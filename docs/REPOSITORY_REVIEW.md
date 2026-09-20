# Repository evaluation: Problem 3

Reviewed 20 September 2026 against the freshly retrieved Loops prompt for **The succession nobody wrote down** and all eight published Test Cases. The evaluated implementation was `49d2a509805c18accdcc411cdda812dea3942bc1`. [Invocation and check record](../evidence/repo-review.json).

`loops evaluate --event road-to-devcon-v --problem steward-succession --format json` was run from this repository. It supplies review instructions, not an official score. The event-level CLI context still names Folio, but the Problem 3 workspace contains this separate Relay repository. This assessment follows the actual Relay code and receipts; it does not require viewing the hosted demo.

## Alignment summary

A stable registry on Gnosis points readers to the current publisher's Swarm feed. A separate 2-of-3 Safe controls appointments; the publisher cannot redirect the registry alone. The repository records two real appointments, incoming corrections, council replacement and an extension of the existing postage batch, with explicit one-builder test custody limits.

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

The qualitative criterion is not satisfied merely by showing several addresses. The architecture has no private hosted transaction coordinator and supports separately held signer files and replaceable executors. The agreement defines human responsibilities and recovery limits. Actual code and live receipts substantiate repeated succession.

However, the demonstration uses multiple test identities controlled by one builder on one laptop. It does not establish independent human custody. Shared Bee storage does not transfer with publishing authority. There is no recurring renewal fund, thirty-day reserve or institutional adoption. Those limitations remain a substantive qualitative risk and are stated in the README, agreement and interface.

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
```

Eight local tests and type checks pass. The saved nine-check fork rehearsal is separate from these eight model tests. `verify:live` reads public network state and both appointment receipts with no keys; `verify:contract` compares deployed runtime bytecode and constructor immutables with tracked source. Neither command sends a transaction. The 08:48 UTC public verification resolved C, feed index 2 and 21 records while Bee was stopped.

To reproduce the isolated contract rehearsal, start this process in one terminal:

```sh
node node_modules/@foundry-rs/anvil/bin.mjs --host 127.0.0.1 --port 8547 --fork-url https://gnosis-rpc.publicnode.com --chain-id 100 --silent
```

Then run `npx tsx scripts/rehearse-chain.ts` from this repo. That script is hardwired to loopback port 8547, generates ephemeral test keys and writes no public-chain transactions. It requires a reachable upstream Gnosis RPC to populate the fork. Stop Anvil afterward. The separately named `rehearse-live.ts` performs funded operations and is not needed for source review or routine verification.

## Success fit and three priorities

Technical success is demonstrated: the original publisher can stop participating, the same identifier remains readable, and incoming publishers correct the catalogue. Social custody and enduring payment are partial.

1. Keep the stable-identifier and distinct-authority evidence adjacent to the implementation: the highest-weight paths and completed transaction receipts are mapped above.
2. Make reproduction possible without the original machine: public CLI verification, independent checkout evidence and portable proposal instructions are tracked.
3. Preserve honest custody and renewal limitations. Separate human holders and an enduring fund require real adoption, not additional test keys or stronger marketing claims.

No published mechanical criterion was found unimplemented. This assessment is not an awarded score and does not claim that the qualitative custody gap is solved.
