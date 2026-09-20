# Relay

**A shared catalogue with a next keeper.**

Relay keeps the reader's starting identifier unchanged when publishing responsibility moves from one steward to another. A 2-of-3 Safe on Gnosis controls a small appointment registry. That registry points to the current steward's Swarm feed. Publishing keys and the funded Bee node's paying identity are separate.

Built for Road To Devcon V, Problem 3: **The succession nobody wrote down**. The catalogue contains 21 invented records across seven example collections. It does not claim to catalogue actual monastery holdings.

## The live result

- App: [relay-catalogue-hrsh22.vercel.app](https://relay-catalogue-hrsh22.vercel.app)
- Registry: [`0x258a08b90fb76ac3f87d0cb1baebc206370d7d57`](https://gnosisscan.io/address/0x258a08b90fb76ac3f87d0cb1baebc206370d7d57)
- Council Safe: [`0x905BbC3A0D565BfF5681B064c932f896cC23186F`](https://gnosisscan.io/address/0x905BbC3A0D565BfF5681B064c932f896cC23186F)
- Durable identifier: `eip155:100:0x258a08b90fb76ac3f87d0cb1baebc206370d7d57`
- Real A -> B -> C handoffs, corrections from B and C, a replaced council delegate, an ignored retired-publisher update and a top-up of the existing postage batch are recorded in [evidence/](evidence/).

These are live network operations by distinct test identities, all operated by Harsh Gupta on one laptop. They prove the protocol, not independent human custody. Folio and Relay share one local funded Bee node and postage batch. Storage ownership does not move when the publishing identity changes.

## Read it without this app or the keeper's computer

```sh
npm ci
npm run relay -- read --registry 0x258a08b90fb76ac3f87d0cb1baebc206370d7d57
```

No private configuration, local Bee, account, Vercel deployment or Safe Transaction Service is required for this read path. It uses public Gnosis RPC and Swarm gateway endpoints, which can be replaced with command options. The reader trusts those providers; it is not a blockchain light client.

The browser app presents the catalogue, condition and photography status, a human-readable role arrangement, actual handoff receipts, recovery information and postage observations. Anyone can prepare an unsigned correction request. A local operator can publish corrections, stage incoming feeds, approve and execute succession, and extend postage.

## Run locally

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3002` for the public reader. For the configured node custodian:

```sh
npm run operator:start
```

Ctrl-C closes the manual operator session. No background service, tunnel, startup item or caffeinate process is installed. Setup, key separation, portable proposal files and recovery are covered in [OPERATIONS.md](docs/OPERATIONS.md).

## What to inspect

| Requirement                                   | Implementation and evidence                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Same reader identifier after a handoff        | [Registry contract](contracts/RelayRegistry.sol), [chain resolution](src/lib/chain.ts), [public reader](src/lib/network.ts), two live appointment receipts               |
| Separate paying and signing identities        | [Configuration and node address checks](scripts/context.ts), [dedicated feed signer](scripts/publish.ts), [identity separation](src/lib/model.ts)                        |
| Renew an existing batch                       | [Storage implementation](scripts/storage.ts), CLI `storage-quote` / `storage-execute`, local browser renewal, live renewal receipt                                       |
| Named successor and precise trigger           | [Committee agreement](docs/AGREEMENT.md), including B and C public addresses and retirement/unavailability/compromise conditions                                         |
| Completed handoff between distinct identities | [Live rehearsal script](scripts/rehearse-live.ts), [public evidence bundle](public/evidence.json), signatures, transaction hashes, feed indices and incoming corrections |
| Appointment authority separate from publisher | Safe-only `appoint`, minimum threshold and role checks in the contract, portable [council commands](scripts/council.ts)                                                  |
| Credentials excluded                          | Owner-only ignored `.runtime/private`, [secret check](scripts/check-secrets.mjs), Vercel and trace exclusions                                                            |
| Incoming identity supplied outside source     | `relay propose --incoming ADDRESS`, `prepareAppointment(incoming, ...)`, operator form                                                                                   |

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
```

Tests cover malformed catalogues, duplicate identities, payer/publisher separation and unsafe endpoint configuration. The isolated Gnosis-fork rehearsal exercises real Safe bytecode: insufficient approvals, unauthorized publication authority, stale and replayed proposals, delegate replacement and repeated succession. Live receipts distinguish actual transactions from read-only simulations.

See [VERIFICATION.md](docs/VERIFICATION.md) for the node-off recovery, browser walkthrough and source/runtime comparison. The free Loops rubric review is in [LOOPS_EVALUATION.md](docs/LOOPS_EVALUATION.md).

## Limits we chose

- Council approval depends on Gnosis, transaction gas and at least two surviving council keys. The registry has no hidden administrator or upgrade key. Losing quorum requires a new agreement and identifier.
- The appointed steward can publish incorrect records until replaced. A signature identifies a publisher, not the truth of a manuscript description.
- A retired publisher can keep writing to their old feed. The current registry no longer directs readers there; old data is not erased.
- One node means shared custody of postage. A successor who loses access needs another funded node and retained copies; no batch-transfer feature is claimed.
- Postage needs recurring human attention. The UI labels saved observations, and the agreement assigns renewal duties. Network pricing can change lifetime estimates.
- The default public reader and operator use the same open-source protocol. They can run independently of the original deployment, but gateway/RPC availability still matters.

Read the [plain-language agreement](docs/AGREEMENT.md) before interpreting the dashboard as governance. The proposed libraries have not adopted it; this is an explicitly labelled demonstration.
