# Leviathan — Resilient Distributed Maritime Surveillance

A hackathon prototype (Digital Earth Sweden, Critical Infrastructure Monitoring track) for spotting **dark vessels** in the Baltic — ships seen in Sentinel-1 SAR imagery with no matching AIS broadcast, the signature of the kind of activity behind subsea-cable sabotage.

Two layers:

1. **Detection layer** — a SAR + AIS pipeline (Python notebooks) matches satellite detections against AIS; anything unmatched becomes a signed **detection record**. Run once ahead of the event, exported to file — no live computer vision.
2. **Network layer** — a peer-to-peer mesh of C++ nodes replicates those records and gossips until every node holds the same set. A Next.js map reads from any node and renders the vessels. Kill a node and its data is still served by the others: no single point of failure.

The frontend lives in `frontend/`, the pipeline in the root notebooks, and the mesh in `net/`. The rest of this README covers the network layer; see `docs/adr/` for full design rationale.

# Network layer

A peer-to-peer mesh of C++ nodes that replicates signed vessel-detection records.

## Architecture

- **Node** — one process. Holds a full **mirror** of every detection record; no node owns a region or is a coordinator.
- **Gossip** — every ~1 s each node dials its peers over raw TCP, exchanges full record sets, and unions them by record `id` (anti-entropy). The mesh converges with no consensus and no conflict resolution.
- **Records** — immutable and keyed by `id`. Each is Ed25519-signed (libsodium) by the originating node over a fixed field concatenation (`id|lat|lon|time|flag|origin|imo|status`), not the JSON, to avoid serialization drift.
- **Trust** — incoming records are verified against a static allowlist of trusted public keys before union. Unsigned or unknown-key records are rejected.
- **HTTP API** — per node: `GET /health`, `GET /detections`, `POST /detections`. The frontend reads from any node.
- **Adapters** — detection sources feed in via a seed loader, so the mesh is independent of the dataset.

```
peer ──gossip(~1s)── Node ──gossip(~1s)── peer
                      │  full mirror, union-by-id
                      └── HTTP API ── frontend
```

## Key decisions

- **Full mirrors over sharding** — killing any node loses no data, and union of immutable id-keyed records is the simplest possible gossip. Trade-off: doesn't scale to large datasets / many nodes (fine at this scale).
- **Sign records, not just transport** — a rogue node cannot poison the mirror; authenticity, not only availability. `status` is in the signed fields, so a verdict is tamper-evident in transit.
- **Static key allowlist** — no rotation/revocation; cut deliberately for the timeline.
- **Confirmation is a new record, not a mutation** — flipping a candidate to `CONFIRMED` is a new signed record on the same track key; latest wins on read. Keeps records immutable and gossip a pure union.

## Build & run

From `net/`:

```
make            # build
make keys       # generate node keyfiles (gitignored)
./scripts/run-mesh.sh
```
