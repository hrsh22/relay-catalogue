# Relay

[Latest source-only Loops review](docs/CODE_EVALUATION.md) - independent council workflow, correction intake and implementation status.

[Earlier strict rubric review](docs/STRICT_EVALUATION.md) - all eight technical checks and the twenty-point criterion.

[Recorded CI and deployment verification](evidence/release-verification.json) - evidence for the commit identified in that file.
[Repository evaluation and all eight published checks](docs/REPOSITORY_REVIEW.md) - source paths, tests, committed evidence and reproduction commands.

**A shared catalogue with a next keeper.**

Relay keeps the reader's starting identifier unchanged when publishing responsibility moves from one steward to another. A 2-of-3 Safe on Gnosis controls a small appointment registry. That registry points to the current steward's Swarm feed. Publishing keys and the funded Bee node's paying identity are separate.

Built for Road To Devcon V, Problem 3: **The succession nobody wrote down**. The catalogue contains 21 invented records across seven example collections. It does not claim to catalogue actual monastery holdings.

## The live result

- Registry: [`0x258a08b90fb76ac3f87d0cb1baebc206370d7d57`](https://gnosisscan.io/address/0x258a08b90fb76ac3f87d0cb1baebc206370d7d57)
- Council Safe: [`0x905BbC3A0D565BfF5681B064c932f896cC23186F`](https://gnosisscan.io/address/0x905BbC3A0D565BfF5681B064c932f896cC23186F)
- Durable identifier: `eip155:100:0x258a08b90fb76ac3f87d0cb1baebc206370d7d57`
- Real A -> B -> C handoffs, corrections from B and C, a replaced council delegate, an ignored retired-publisher update and a top-up of the existing postage batch are recorded in [evidence/](evidence/).

The receipts record live network operations by distinct demonstration identities operated by Harsh Gupta. Folio and Relay use the same configured, operator-managed Bee node and postage batch. The storage custodian retains batch ownership when publishing responsibility changes.

## Verify the submitted repository

```sh
npm ci
npm run relay -- read --registry 0x258a08b90fb76ac3f87d0cb1baebc206370d7d57
```

This verification reads public network state without private configuration, a Bee node or an account. It uses public Gnosis RPC and Swarm gateway endpoints, which can be replaced with command options. The reader trusts those providers; it is not a blockchain light client.

The browser app presents the catalogue, condition and photography status, a human-readable role arrangement, actual handoff receipts, recovery information and postage observations. The [reader implementation](src/components/relay-app.tsx) obtains the catalogue only from its registry and Swarm feed. Optional deployment receipts cannot replace this read; they are scoped to the matching registry and catalogue. Agreement text and council approval counts come from the selected registry, and operator actions require the same registry and catalogue identity. A [complete captured reading copy](evidence/reading-and-recovery-copy.html) is included for repository review. The handoff view downloads the same printable HTML format: all records, the actual registry-linked agreement fetched from Swarm, dated public authority and plain-language succession steps. It opens offline without scripts or an account and labels itself as a recorded copy. Anyone can prepare an unsigned correction request. The configured operator can publish corrections, stage incoming feeds, approve and execute succession, and extend postage.

## Review from GitHub

The requirement map below links directly to implementation and recorded evidence. The [plain-language agreement](docs/AGREEMENT.md), [repository evaluation](docs/REPOSITORY_REVIEW.md), automated tests and CI artifacts form the review path. The hosted reader is optional; the submitted code and receipts stand on their own.

Maintainer setup and recovery procedures are documented in [OPERATIONS.md](docs/OPERATIONS.md). [Independent council setup](docs/INDEPENDENT_COUNCIL.md) explains reviewing and approving the same portable proposal on each holder's computer with only their own key. `npm run council:start` starts that desk without probing or starting Bee. Council authority is read separately from the outgoing feed, so losing that feed does not block review of a valid incoming appointment.

The [council desk](src/components/council-proposal.tsx) decodes the actual transaction, verifies existing signatures, exports public proposal files and produces a readable review packet. The signatures authorize the exact transaction; an accompanying committee note is clearly marked as unsigned. The [correction inbox](src/components/correction-inbox.tsx) compares a contributor's request with its source edition and lets the appointed steward publish only the reviewed changes. A stale request is rejected before publication. The registry-linked agreement is rendered as readable headings, lists and paragraphs.

These workflows support separate participation. The project owner has taken responsibility for the human side and asked that it be considered handled. The committed A -> B -> C receipts retain their original provenance as a single-builder protocol rehearsal. The latest implementation review is source-only; no new runtime rehearsal or tests were performed for these changes.

The operator also exposes [interrupted-publication recovery](src/components/publication-recovery.tsx), which resumes the same saved reference at its exact feed position. Verified renewal receipts remain downloadable even if saving a local record or refreshing the display fails. Before signing, the operator checks that the selected identity's key actually matches the public address shown in the form.

## What to inspect

| Requirement                                    | Implementation and evidence                                                                                                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same reader identifier after a handoff         | [Registry contract](contracts/RelayRegistry.sol), [chain resolution](src/lib/chain.ts), [public reader](src/lib/network.ts), two live appointment receipts                                                |
| Separate paying and signing identities         | [Configuration and node address checks](scripts/context.ts), [dedicated feed signer](scripts/publish.ts), [identity separation](src/lib/model.ts)                                                         |
| Renew an existing batch                        | [Storage implementation](scripts/storage.ts), CLI `storage-quote` / `storage-execute`, local browser renewal, live renewal receipt                                                                        |
| Named successor and precise trigger            | [Committee agreement](docs/AGREEMENT.md), including B and C public addresses and retirement/unavailability/compromise conditions                                                                          |
| Completed handoff between distinct identities  | [Live rehearsal script](scripts/rehearse-live.ts), [public evidence bundle](public/evidence.json), signatures, transaction hashes, feed indices and incoming corrections                                  |
| Appointment authority separate from publisher  | Safe-only `appoint`, minimum threshold and role checks in the contract, portable [council commands](scripts/council.ts)                                                                                   |
| Credentials excluded                           | Owner-only ignored `.runtime/private`, [secret check](scripts/check-secrets.mjs), Vercel and trace exclusions                                                                                             |
| Incoming identity supplied outside source      | `relay propose --incoming ADDRESS`, `prepareAppointment(incoming, ...)`, operator form                                                                                                                    |
| Independent proposal exchange                  | [Council desk](src/components/council-proposal.tsx), [validated proposal review](scripts/council.ts), [readable review packet](src/lib/proposal-document.ts), [holder setup](docs/INDEPENDENT_COUNCIL.md) |
| Contributing libraries can propose corrections | [Request validation and edition changes](src/lib/corrections.ts), [review and publishing interface](src/components/correction-inbox.tsx)                                                                  |

The underlying format is documented in [FORMAT.md](docs/FORMAT.md). The implementation pins bee-js 13.1.0 and uses its namespace APIs. The frontend uses Next.js 16.3.5, TypeScript, React and shadcn-style Radix primitives. The Safe implementation is 1.4.1; the narrow registry is compiled with Solidity 0.8.37 targeting Paris.

## Verify

```sh
npm test
npm run typecheck
npm run contract:build
npm run build
npm run check:secrets
npm run verify:live
npm run verify:contract
npm run verify:fork
```

Tests cover malformed catalogues, duplicate identities, payer/publisher separation and unsafe endpoint configuration. `verify:fork` starts its own temporary loopback Anvil, exercises real Safe bytecode, and stops every child on completion, failure or interruption: insufficient approvals, unauthorized publication authority, stale and replayed proposals, delegate replacement and repeated succession. CI runs these nine fork checks in a separate job and retains the report and process lifecycle record. It needs public RPC reads but no secret, Bee process or funded account. Live receipts distinguish actual transactions from fork simulations.

See [VERIFICATION.md](docs/VERIFICATION.md) for the node-off recovery, browser walkthrough and source/runtime comparison. The free Loops rubric review is in [LOOPS_EVALUATION.md](docs/LOOPS_EVALUATION.md).

## Stewardship and storage

The [agreement](docs/AGREEMENT.md) assigns publishing, council approval, storage payment and succession responsibilities. The storage custodian operates the configured Bee node, reviews timestamped postage estimates and renews the existing batch through the quote-and-renew workflow. The receipts identify the actual renewal performed. Publishing succession updates the registry's authority while preserving the catalogue identifier and the batch's paying identity.

The submitted catalogue and agreement use explicitly labelled demonstration identities and records. See the source-linked review and evidence for the actions performed.
