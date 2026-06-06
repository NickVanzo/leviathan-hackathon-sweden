# Replicated-mirror P2P gossip with signed detection records

We built the surveillance data layer as a peer-to-peer mesh of C++ **Nodes** where
every Node holds a full **Mirror** of all **Detection records** and runs ~1 s
**anti-entropy gossip** (exchange full sets, union by id) to converge — rather than
nodes owning separate sea regions. Mirrors were chosen because they give the
strongest "no single point of failure" story per build-hour: killing any Node loses
no data, with the simplest possible gossip (immutable id-keyed records → union, no
consensus, no conflict resolution).

Every **Detection record** is **Ed25519-signed** (libsodium) by its originating Node
over a fixed field concatenation (`id|lat|lon|time|flag|origin|imo|status`, *not* the
JSON blob, to avoid serialization drift) and verified against a static **Trusted-key
allowlist** before union. A rogue Node therefore cannot poison the Mirror —
authenticity, not just availability. Because `status` is among the signed fields, an
operator-confirmed record's verdict is itself tamper-evident (see ADR 0002).

**Trade-offs accepted:** mirrors don't scale to large datasets or many nodes, and a
static allowlist has no key rotation/revocation. Both are irrelevant at hackathon
scale and were cut deliberately to protect the 2-day solo timeline. The data source
is decoupled via per-source **Adapters**, so this layer is unaffected by whatever
shadow-vessel dataset arrives.
