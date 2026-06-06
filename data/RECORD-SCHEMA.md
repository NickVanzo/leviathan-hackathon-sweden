# Detection record schema

The one object the whole network carries. Every data source (hand-made, SAR
pipeline, judge dataset) is mapped to this by an adapter; everything downstream is
source-blind.

## Fields

| field          | type    | notes                                                        |
|----------------|---------|--------------------------------------------------------------|
| `id`           | string  | unique, stable. Records are immutable → union by this.       |
| `lat`          | number  | WGS84 latitude.                                              |
| `lon`          | number  | WGS84 longitude.                                             |
| `time`         | string  | ISO-8601 UTC acquisition instant.                            |
| `size_m`       | number  | estimated vessel length, metres.                            |
| `flag`         | string  | `DARK` or `SPOOFER`.                                         |
| `crop`         | string  | relative path to the SAR crop PNG, or null.                 |
| `origin`       | string  | id of the node that authored the record.                    |
| `origin_pubkey`| string  | base64 Ed25519 public key of `origin`. Added at ingest.     |
| `sig`          | string  | base64 Ed25519 signature. Added at ingest.                  |

## Signing convention

The ingesting node signs each record on load/inject (it is the `origin`). Seed and
adapter output may omit `origin_pubkey`/`sig` — the node fills them.

Signature is over the **fixed field concatenation**, not the JSON:

```
id + "|" + lat + "|" + lon + "|" + time + "|" + flag + "|" + origin
```

(`lat`/`lon` formatted with a fixed precision both sides agree on — e.g. 6 dp — so
signer and verifier hash identical bytes.)

A receiving node rejects any record whose `sig` fails verification or whose
`origin_pubkey` is not in its trusted-key allowlist.
