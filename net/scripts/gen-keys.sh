#!/usr/bin/env bash
# Generate per-node keyfiles + the trusted-key allowlist, always consistent.
# node1/2/3 are trusted (their pubkeys go in the allowlist); rogue is NOT.
set -euo pipefail

cd "$(dirname "$0")/.."
NODE=./build/node
KEYS=keys
mkdir -p "$KEYS"

if [[ ! -x "$NODE" ]]; then
  echo "build first: make build" >&2
  exit 1
fi

trusted=()
for n in node1 node2 node3; do
  pk=$("$NODE" --gen-key "$KEYS/$n.key")
  trusted+=("\"$pk\"")
done

# Rogue key exists but is deliberately left out of the allowlist.
"$NODE" --gen-key "$KEYS/rogue.key" >/dev/null

printf '[\n  %s\n]\n' "$(IFS=$',\n  '; echo "${trusted[*]}")" >"$KEYS/trusted-keys.json"
echo "wrote $KEYS/trusted-keys.json (${#trusted[@]} trusted keys); rogue.key excluded"
