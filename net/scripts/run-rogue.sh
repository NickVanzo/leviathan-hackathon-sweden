#!/usr/bin/env bash
# Launch a ROGUE node: valid signatures, but its key is NOT in the allowlist.
# It dials the mesh and tries to push a forged detection; legit nodes reject it
# and their /health rejected-count climbs. Ctrl-C stops it.
set -euo pipefail

cd "$(dirname "$0")/.."
NODE=./build/node

if [[ ! -x "$NODE" ]]; then
  echo "build first: make build" >&2
  exit 1
fi

echo "starting rogue -> dialing node1/2/3, injecting a forged record"
"$NODE" --id rogue --http-port 8099 --key keys/rogue.key \
  --allowlist keys/trusted-keys.json --gossip-port 9099 \
  --peers 127.0.0.1:9081,127.0.0.1:9082,127.0.0.1:9083 &
ROGUE=$!

trap 'kill "$ROGUE" 2>/dev/null || true; exit 0' INT TERM
sleep 1
curl -s -X POST 127.0.0.1:8099/detections -H 'Content-Type: application/json' \
  -d '{"id":"FORGED-CABLE-THREAT","lat":55.0,"lon":15.4,"flag":"DARK","size_m":999}' >/dev/null
echo "forged record injected at rogue; watch the mesh reject it. Ctrl-C to stop."
wait "$ROGUE"
