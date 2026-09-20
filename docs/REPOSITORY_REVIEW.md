# Repository evaluation: Problem 3

Reviewed 20 September 2026 against the freshly retrieved Loops prompt for **The succession nobody wrote down** and all eight published Test Cases. The initial evaluated implementation was `49d2a509805c18accdcc411cdda812dea3942bc1`. [Invocation and check record](../evidence/repo-review.json).

`loops evaluate --event road-to-devcon-v --problem steward-succession --format json` was run from this repository. It supplies review instructions, not an official score. The event-level CLI context still names Folio, but the Problem 3 workspace contains this separate Relay repository. This assessment follows the actual Relay code and receipts; it does not require viewing the hosted demo.

A follow-up adds the readable offline recovery document and automated fork CI described below. [New fork run](../evidence/fork-automation.json), [process cleanup](../evidence/fork-lifecycle.json), [interruption cleanup](../evidence/fork-interruption.json), and [public-data recovery generation](../evidence/recovery-copy.json) are separate from the original evaluator invocation.

The follow-up [evaluation receipt](../evidence/qualitative-review.json) records another problem-specific Loops prompt retrieval and the current 12-test / nine-contract-check validation.

## Alignment summary

A stable registry on Gnosis points readers to the current publisher's Swarm feed. A separate 2-of-3 Safe controls appointments; the publisher cannot redirect the registry alone. The repository records two real appointments, incoming corrections, council replacement and an extension of the existing postage batch, using identified demonstration signers and a configured storage custodian.

## Verified strengths

- [RelayRegistry.sol](../contracts/RelayRegistry.sol) has a narrow council-only appointment path, stale-revision and role checks, and no upgrade or administrator escape hatch. [Chain resolution](../src/lib/chain.ts) and [network resolution](../src/lib/network.ts) form a third-party read path independent of Vercel.
- [council.ts](../scripts/council.ts) prepares, validates, signs and executes portable proposals. [relay.ts](../scripts/relay.ts) exposes the CLI and [the local operator route](../src/app/api/operator/route.ts) exposes the same operations locally.
- [The agreement](AGREEMENT.md) states who decides, publishes and pays, names successors, defines triggers and describes loss of quorum in ordinary language.
- [The live rehearsal record](../evidence/2026-09-20T08-10-17.056Z-rehearsal-summary.json), separate transaction receipts and [independent recovery](../evidence/independent-recovery.json) establish actions beyond a proposed architecture.

## All eight published technical checks

Weights identify the published rubric; they are not awarded scores. Each mechanical check has an implementation and inspectable supporting evidence.

| #   | Published check                                       | Weight | Implementation, caller and proof                                                                                                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Stable reader indirection survives publisher rotation |     20 | Immutable registry address -> [readRegistry](../src/lib/chain.ts) -> [readFeed](../src/lib/network.ts). The [A -> B -> C summary](../evidence/2026-09-20T08-10-17.056Z-rehearsal-summary.json) retains the same identifier; the CLI reads it without private configuration.                                                                                                     |
| 2   | Paying and signing identities configured separately   |     12 | [context.ts](../scripts/context.ts) verifies configured payer against Bee's wallet; [publish.ts](../scripts/publish.ts) reads a separate publisher key and checks role separation against council owners. [model tests](../tests/model.test.ts) reject identity reuse.                                                                                                          |
| 3   | Extend or top up existing storage                     |     10 | [storage.ts](../scripts/storage.ts) calls `storage.extendDuration`; CLI `storage-quote`/`storage-execute` and local `quote`/`renew` actions call it. [Actual renewal receipt](../evidence/2026-09-20T08-10-16.378Z-storage-renew.json) records the same batch ID and increased amount.                                                                                          |
| 4   | Written successor and trigger                         |     10 | [AGREEMENT.md](AGREEMENT.md) contains A, B and C public addresses and retirement, fourteen-day unavailability and compromise triggers in the same tracked document.                                                                                                                                                                                                             |
| 5   | Record an actually completed handoff                  |     10 | [A -> B receipt](../evidence/2026-09-20T08-05-54.845Z-appoint.json), [B -> C receipt](../evidence/2026-09-20T08-09-08.068Z-appoint.json), incoming publications and the rehearsal summary contain distinct identities, transaction hashes and feed references.                                                                                                                  |
| 6   | Appointment authority differs from publisher          |      8 | Council-only `appoint` in [RelayRegistry.sol](../contracts/RelayRegistry.sol), threshold validation and Safe signature execution in [council.ts](../scripts/council.ts). [Nine isolated-fork checks](../evidence/2026-09-20T07-52-02.358Z-fork-rehearsal.json) include unauthorized publisher, one-signature failure, replay/stale rejection and replacement council operation. |
| 7   | Exclude tracked credentials                           |      6 | [.gitignore](../.gitignore), [.vercelignore](../.vercelignore), ignored owner-only key files and [secret check](../scripts/check-secrets.mjs). The public deployment disables operator routes before importing private operation modules. Current secret scanning passes.                                                                                                       |
| 8   | Parameterize incoming identity                        |      4 | `--incoming` in [relay.ts](../scripts/relay.ts), `prepareAppointment(incoming, ...)` in [council.ts](../scripts/council.ts#L119), and external-address input in [operator-panel.tsx](../src/components/operator-panel.tsx). Demo aliases do not determine the contract's successor.                                                                                             |

## Product judgment and code craft

The code implements an authority change with portable council approvals and a replaceable executor. The agreement assigns the human decisions, renewal duties and recovery procedure. Actual code and live receipts substantiate repeated succession.

The receipts identify demonstration signers operated by Harsh Gupta. The configured Bee node is managed by the storage custodian and shares its batch with Folio; appointment changes the publishing authority, while batch ownership remains with its paying identity. Timestamped storage observations and actual renewal receipts are distinguished from the agreement's ongoing renewal duties.

## Reproduce from the repository

```sh
npm ci
npm test
npm run typecheck
npm run contract:build
npm run check:secrets
npm run build
npm run verify:live
npm run verify:contract
npm run verify:fork
```

Twelve local tests and type checks pass. The nine-check Safe rehearsal is a separate CI job and command. `verify:live` reads public network state and both appointment receipts with no keys; `verify:contract` compares deployed runtime bytecode and constructor immutables with tracked source. Neither command sends a transaction. The 08:48 UTC public verification resolved C, feed index 2 and 21 records while Bee was stopped.

`npm run verify:fork` starts an isolated loopback Anvil at a block selected from the public RPC, creates ephemeral in-memory identities and no default unlocked accounts, then runs all nine contract checks. It never imports operator context, loads local secrets, starts Bee or sends public-chain transactions. The runner stops its worker and Anvil on success, failure or interruption. Reports and lifecycle evidence go to `.runtime/fork-verification/` and are retained as CI artifacts. Use `RELAY_FORK_SOURCE` for another HTTPS public RPC; `RELAY_FORK_BLOCK` requires a source retaining that historical state. RPC failure fails the job rather than silently skipping it. The separately named `rehearse-live.ts` performs funded operations and is not needed for routine verification.

The human recovery path now has a [script-free offline document](../src/lib/recovery.ts), called by the Handoff record view in [relay-app.tsx](../src/components/relay-app.tsx). It includes every catalogue record, observed authority, the actual registry-linked agreement read from Swarm, and a plain-language procedure. Agreement fetch failure prevents a partial download. [Recovery tests](../tests/recovery.test.ts) cover retention, untrusted text escaping and incomplete data. The document is a dated reading copy. Its handoff instructions use the council threshold observed from the registry.

## Success fit and repository evidence

The completed rehearsal shows the original publisher leaving the appointment path, the same identifier remaining readable, incoming publishers correcting the catalogue, and the custodian extending the existing storage batch.

1. Keep the stable-identifier and distinct-authority evidence adjacent to the implementation: the highest-weight paths and completed transaction receipts are mapped above.
2. Keep review reproducible from GitHub: public CLI verification, independent checkout evidence, automated CI checks and portable proposal instructions are tracked.
3. Keep operator responsibilities concrete: the tracked agreement, configured paying identity, existing-batch renewal path and receipts identify who pays and how the next holder takes over.

The source and evidence map covers all published mechanical criteria. This repository review is not an awarded score.
