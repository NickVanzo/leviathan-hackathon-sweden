# Resilient Distributed Maritime Surveillance

A hackathon prototype (Digital Earth Sweden, 4–5 June 2026, Critical Infrastructure
Monitoring track). Real **Dark vessel** detections from Sentinel-1 SAR + AIS are
served by a peer-to-peer mesh of C++ **Nodes** that each hold a full mirror of the
data and gossip to converge. Killing a Node loses nothing — the surveillance
survives the same kind of attack (Baltic subsea-cable sabotage, e.g. Eagle S /
Estlink 2) that it exists to watch for.

## The idea

Two layers:

1. **Detection layer (pre-computed, reused).** The validated SAR+AIS pipeline runs
   once before/early in the event and exports **Detection records** to a file. No
   live computer vision at the event.
2. **Network layer (the judged build).** N C++ **Nodes** load the records and
   **Anti-entropy gossip** them peer-to-peer until all Nodes hold the same set
   (**Mirror**). Each Node exposes a tiny HTTP API; a Next.js map reads from a Node
   and renders **Detection records** as dots. Demo: inject a record at one Node →
   it propagates to all; kill a peer Node → its data is still served by the others.

## Product

A web map of flagged dark vessels over the Baltic. Click a vessel → its
**Detection record** (position, acquisition time, size estimate, Dark/Spoofer flag)
plus the pre-computed **SAR crop**. A Node panel shows which Nodes are alive, with
operator buttons to **inject** a detection and **kill** a Node — the demo proves
no single point of failure.

## Language

### Detection layer

**AIS** (Automatic Identification System):
The VHF radio beacon large ships must broadcast, carrying identity (MMSI) and GPS
position. The "truth signal" imagery is compared against.
_Avoid_: ISO, transponder data.

**Detection**:
A ship-like object found in a satellite image, with a pixel location converted to
lat/lon. The output of the image side of the pipeline.

**Dark vessel**:
A ship that appears as a **Detection** but has no matching **AIS** broadcast at the
same place and time. The primary flag.
_Avoid_: faker, ghost.

**Spoofer**:
A ship broadcasting a fake **AIS** position that contradicts where imagery shows it.
Secondary flag.

**Detection record**:
One immutable, id-keyed JSON object the network carries: vessel id, lat/lon,
acquisition time (UTC), size estimate, Dark/Spoofer flag, optional **IMO**,
a **Status**, an optional **Scene** reference, an optional track key grouping a
**Dark vessel** candidate with its on-site confirmation (a candidate has no
**IMO**), origin **Node**, and an Ed25519 **Signature** with the origin's
`origin_pubkey`. Immutable → the network never needs conflict resolution.

**IMO**:
The permanent IMO ship identification number — fixed for the life of a hull,
the key sanctions lists (EU/OFAC) use. The identifier matched against the
**Known-shadow registry**. Preferred over MMSI, which is reassignable and
spoofable.

**Status**:
The evidence tier of a **Detection record**, source-agnostic.
`SUSPECTED` — flagged by automated triage (a **Dark vessel**: no **AIS** at
acquisition) or an unverified operator report; not yet human-verified.
`CONFIRMED` — verified by either path: its **IMO** matched the **Known-shadow
registry** (automatic), or an operator confirmed it on site (the human step of
the **Verification funnel**). Either path resolves before signing, so Status is
still computed once by the originating **Node** at sign time and baked into the
signed record — immutability and the **Signature** are unchanged.

**Known-shadow registry**:
An in-memory set of known shadow-vessel **IMO** numbers each **Node** loads at
startup (e.g. Eagle S, IMO 9329760). A record whose **IMO** is in the set is
flagged **CONFIRMED**.

**AOI** (Area of Interest):
The geographic rectangle (bbox) a **Scene** covers. **Detection** positions are
mapped into the AOI to place overlays on the **Scene** image.

**Scene**:
One real Sentinel-1 acquisition over an **AOI**, carrying the **Detections** found
in it. The discovery stage of the **Verification funnel**: the operator clicks an
AOI footprint on the globe, opens the Scene, and sees the radar image with its
**Detections** overlaid — **AIS**-matched boats muted, **Dark vessel** candidates
flagged. The real image is fetched live from Sentinel Hub for the AOI + acquisition
window. Supersedes the earlier per-detection radar chip.

**Verification funnel**:
The three stages that turn a satellite image into signed proof. **Discovery**: a
**Scene** surfaces **Detections**. **Triage** (automated): each **Detection** is
matched against **AIS** at acquisition within R≈500 m — no match flags a **Dark
vessel** candidate (**SUSPECTED**). **Confirmation** (human): an operator confirms
a candidate on site, flipping its **Status** to **CONFIRMED**, signed into the
**Mirror**. Satellite = discovery, automated AIS check = triage, the human network
= proof.

### Network layer

**Node**:
A C++ peer process holding a full **Mirror** of all **Detection records**. Gossips
over raw POSIX TCP and serves records to the browser over HTTP (cpp-httplib).

**Mirror**:
The invariant that every live **Node** holds the same complete set of **Detection
records**. Achieved by **Anti-entropy gossip**; what makes any single Node
disposable.

**Anti-entropy gossip**:
The sync protocol: every ~1 s a **Node** connects to each static peer, exchanges
full record sets both ways, and unions by id. A restarted Node re-syncs the same
way (free rejoin).

**Signature**:
An Ed25519 signature (libsodium) the originating **Node** produces over a fixed
field concatenation of a **Detection record**
(`id|lat|lon|time|flag|origin|imo|status`) — not the JSON blob, to avoid
serialization drift. Because **Status** is inside the signed bytes, an
operator-confirmed record cannot be forged or downgraded in transit. A receiving
Node verifies it against
the **Trusted-key allowlist** before union; a record that fails verification, or
whose `origin_pubkey` is not in the allowlist, is rejected. Stops a rogue Node from
poisoning the **Mirror**.

**Trusted-key allowlist**:
The static set of Ed25519 public keys allowed to author **Detection records**,
shipped in each **Node**'s config alongside the static peer list. The boundary
between a trusted **Node** and a rogue one.

## Relationships

- The detection pipeline produces zero or more **Detection records** per satellite image.
- Each **Node** holds a full **Mirror** of all **Detection records**.
- **Anti-entropy gossip** drives every **Node** toward the same set; killing one **Node** loses no records.
- Every **Detection record** carries a **Signature**; a **Node** rejects any record not signed by a key in its **Trusted-key allowlist**.
- The Next.js map reads **Detection records** from one **Node** over HTTP.

## Example dialogue

> **Dev:** "If I inject a **Detection record** at Node 3, when does Node 1 see it?"
> **Architect:** "Within one gossip round — ~1 s. Node 1 pulls Node 3's full set and
> unions it. Records are immutable, so there's nothing to reconcile."
> **Dev:** "And if Node 2 dies?"
> **Architect:** "Nothing is lost — Node 1 and Node 3 still **Mirror** everything.
> That's the whole point."

## Data sources

The network is **data-source-agnostic**: every source is mapped by a thin **Adapter**
to the one **Detection record** schema, then signed by the ingesting **Node**. Three
interchangeable sources:

- **Hand-made records** — ~5 records hard-coded to unblock network work immediately.
- **SAR**: Sentinel-1 GRD via openEO. Detector output (CFAR on VV → size gate →
  AIS match, freshness-gated, R≈500 m) exported to `detections.json`; the real
  **Scene** image is fetched live from Sentinel Hub per **AOI** + window.
  Validated date: **2025-09-14** (05:15 UTC pass), AOI NW of Bornholm
  `{west:14.4, south:55.2, east:15.2, north:55.6}`. **AIS**: Danish DMA dailies via
  a Hugging Face mirror (Sept 2025). The guaranteed real fallback.
- **Judge dataset** — a dataset of past shadow vessels expected from a judge, shape
  unknown until it lands. Treated as a drop-in **upgrade**, never a dependency: when
  it arrives, write the adapter that fits it. If it lacks positions/timestamps, join
  against AIS or the SAR detections to place dots.

**Adapter**:
A thin per-source mapping from raw data to the **Detection record** schema. The only
thing that knows about a source's format; everything downstream is source-blind.

## Key decisions (locked)

- **Priority: win the jury.** C++ networking kept only because it doubles as the
  on-theme resilience story (total defence / no single point of failure).
- **Node model: replicated Mirrors**, not regional sensing — simplest gossip,
  strongest "no single point of failure" claim per build-hour.
- **Detections pre-computed**, never live CV at the event — avoids two hard builds
  in 2 days solo.
- **Raw POSIX TCP for gossip** (the learning goal), **cpp-httplib** for the browser
  API (no time wasted hand-rolling HTTP).
- **Static peer list**, ~1 s full-set anti-entropy, newline-delimited JSON.
- **Record-level Ed25519 signing baked into the data model** (libsodium), verified
  against a **Trusted-key allowlist** — authenticity, not just availability. Sign a
  field concatenation, not the JSON. Unlocks the rogue-node-rejected demo.
- **Demo kills a peer Node, not the browser's Node** — proves resilience with zero
  failover code and no live-demo flake.
- **Cut**: live detector, citizen-photo whistleblowing, path/velocity/destination
  prediction, dynamic peer discovery, consensus.
