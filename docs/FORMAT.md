# The public catalogue format

The catalogue is UTF-8 JSON, uploaded through `bee.data.upload` and retrieved through `/bytes/{reference}`. Its content reference is stored in the appointed publisher's sequential Swarm feed. The feed uses `uploadReference` and `downloadReference`, not arbitrary-payload encoding.

The stable identifier names a Gnosis registry address, not a publisher. The registry exposes `catalogueId`, `publisher`, `topic`, `checkpoint`, `agreement`, `revision` and `council`. A reader resolves it at an observed block, reads that publisher's feed, validates the catalogue, then checks that an appointment did not change during retrieval. Registry revision counts appointments; catalogue revision counts editions within one publisher's feed.

`src/lib/model.ts` defines the executable validation schema. The top-level fields are:

| Field                  | Meaning                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `format`               | Exactly `relay.catalogue.v1`                                                               |
| `catalogueId`          | 32-byte 0x-prefixed identity matching the registry                                         |
| `publisher`            | Ethereum-compatible address matching the currently appointed feed owner                    |
| `title`, `description` | Human-readable catalogue description                                                       |
| `demonstration`        | Whether the records are invented for demonstration                                         |
| `revision`             | Non-negative integer; increments within this publisher's feed                              |
| `previous`             | Prior edition's unprefixed 64-hex content reference, or null for this feed's first edition |
| `updatedAt`            | ISO UTC timestamp supplied by the publisher, not a trusted blockchain timestamp            |
| `change`               | Plain-language explanation of this edition                                                 |
| `collections`          | Unique collection IDs, names and regions                                                   |
| `records`              | Unique record IDs referring to known collections                                           |

Each record includes `id`, `collection`, `title`, `shelfmark`, `material`, non-negative `folios`, `condition`, `photographed`, `notes` and `updatedAt`. Conditions are `stable`, `fragile`, `damaged` and `missing`; photography states are `complete`, `partial` and `not-started`. A valid signature establishes who published a record, not that a physical item exists or that a historical claim is true.

Unknown fields, duplicate identifiers, invalid addresses and unknown collection references are rejected. The supported catalogue body limit is 2 MB. Files are public. No ACT revocation or erasure promise is made.

`public/sample-catalogue.json` is an initial example. `public/catalogue-snapshot.json` is a dated recorded edition for explicitly labelled offline display. A snapshot does not substitute for checking the live registry and feed.
