#!/usr/bin/env bash
# Launch the 3-node mesh locally, tail combined logs. Ctrl-C stops all.
# To kill ONE node for the resilience demo, in another terminal:
#   kill "$(lsof -ti:8082)"
set -euo pipefail

cd "$(dirname "$0")/.."
NODE=./build/node
ALLOWLIST=keys/trusted-keys.json
LOGDIR=/tmp/shadowmesh

if [[ ! -x "$NODE" ]]; then
  echo "build first: make build" >&2
  exit 1
fi
mkdir -p "$LOGDIR"

ids=(node1 node2 node3)
http_ports=(8081 8082 8083)
gossip_ports=(9081 9082 9083)
peers=(
  "127.0.0.1:9082,127.0.0.1:9083"
  "127.0.0.1:9081,127.0.0.1:9083"
  "127.0.0.1:9081,127.0.0.1:9082"
)
pids=()

# Only node1 ingests live AIS (the "sensor" station); it gossips to the rest,
# so the mesh stays consistent (one signer per live record).
ais_counts=(2 0 0)

for i in "${!ids[@]}"; do
  id="${ids[$i]}"
  "$NODE" --id "$id" --http-port "${http_ports[$i]}" --key "keys/$id.key" \
    --allowlist "$ALLOWLIST" --gossip-port "${gossip_ports[$i]}" \
    --peers "${peers[$i]}" --ais "${ais_counts[$i]}" >"$LOGDIR/$id.log" 2>&1 &
  pids+=("$!")
  echo "started $id (pid $!) http :${http_ports[$i]} gossip :${gossip_ports[$i]} -> $LOGDIR/$id.log"
done

cleanup() {
  echo
  echo "stopping mesh..."
  kill "${pids[@]}" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo "mesh up. Ctrl-C to stop all. Tailing logs:"
tail -f "$LOGDIR"/node*.log
