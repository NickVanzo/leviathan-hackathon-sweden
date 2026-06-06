# Status as an evidence tier, set by a verification funnel

We redefined a **Detection record**'s **Status** from a registry-derived label into a
source-agnostic **evidence tier**, and made Earth observation the entry point of the
system (it is an EO hackathon).

Previously `CONFIRMED` meant exactly one thing: the record's **IMO** matched the
**Known-shadow registry**, computed by the originating **Node** at sign time.
`SUSPECTED` meant an unverified operator report. A **Dark vessel** candidate — a boat
with no **AIS** at acquisition and therefore no IMO — could never become `CONFIRMED`
under that definition, which made the satellite-discovery funnel impossible.

Now Status carries an evidence tier with two confirmation paths:

- `SUSPECTED` — flagged by automated triage (no AIS at acquisition) or an unverified
  operator report; not yet human-verified.
- `CONFIRMED` — verified by **either** a **Known-shadow registry** IMO match
  (automatic) **or** an operator's on-site confirmation (human).

This sits inside a three-stage **Verification funnel**: **Discovery** (a **Scene** —
one real Sentinel-1 acquisition over an **AOI** — surfaces detections) → **Triage**
(each detection is matched against AIS within R≈500 m; no match → dark candidate,
`SUSPECTED`) → **Confirmation** (an operator confirms on site → `CONFIRMED`). Because
records are immutable and gossip is union-by-id, "flipping" a candidate is not a
mutation: confirmation is a **new** signed record sharing the candidate's track key,
and the latest record wins on the read side. Both confirmation paths still resolve
before signing, so Status remains computed once at sign time and baked into the
record — and `status` is part of the signed field concatenation (ADR 0001), so a
confirmation cannot be forged or downgraded in transit.

**Alternative rejected:** keep `CONFIRMED` registry-only and represent operator
confirmation as a separate field (e.g. `verified_by`) or a third status. Rejected
because it splits "is this proven?" across two fields, complicates the globe/registry
rendering that already keys off Status, and obscures the funnel — the product's spine
— behind an extra concept.

**Consequences / trade-offs accepted:** a dark candidate has no IMO, so its candidate
record and its confirmation are grouped by a track key, not an IMO; the registry shows
its IMO as unknown ("—"), which is the truthful state for an unidentified vessel. An
operator can assert `CONFIRMED` without a registry match — acceptable because operator
nodes are already inside the **Trusted-key allowlist** (the trust boundary is the key,
not the registry). AIS-matched ("normal") boats in a Scene are illustrative context
only: they are never signed into the **Mirror** and appear only in the Scene view.
