# Problem 3 alignment review

Local review against the free Loops evaluator prompt, retrieved on 20 September 2026. This is not an official scored judging attempt. The evaluator prompt supplies instructions for inspecting the repository; it does not run the tests or produce an official verdict.

## Alignment summary

Relay directly implements succession for a shared Swarm catalogue. The public identifier resolves a Gnosis appointment registry governed by an actual 2-of-3 Safe, then the current publisher's feed. Live evidence records A -> B -> C, incoming corrections, a replaced council delegate, an ignored old-publisher update and an extension of the existing postage batch.

The remaining social limitation is explicit: one builder operated all dedicated test identities on one laptop. No independent institutional adoption or human custody is claimed.

## Verified strengths

- `contracts/RelayRegistry.sol` permits appointments only from the council Safe and rejects a threshold below two, a council owner reused as publisher, zero addresses and stale succession revisions. No upgrade or administrator escape hatch exists.
- `scripts/council.ts` creates, validates, signs and executes portable Safe transaction files. The incoming address is a parameter. Signing and execution do not depend on the Safe Transaction Service or a Relay backend.
- `src/lib/network.ts` and `src/lib/chain.ts` implement the third-party read path from a stable registry address. The command-line reader can run without local private configuration or the original application host.
- `scripts/publish.ts` consumes a dedicated publisher key. `scripts/context.ts` checks that Bee's wallet matches a separately configured payer; `distinctIdentities` rejects role overlap.
- `scripts/storage.ts` extends an existing batch, rechecks cost and records a before/after amount increase for the same batch identifier. The browser and CLI both call it.
- `docs/AGREEMENT.md` names actual demo successor identifiers and defines voluntary retirement, fourteen-day unavailability and compromise triggers in ordinary language.
- `evidence/` contains real transaction hashes, signatures, feed indices and public references. Isolated-fork checks are labelled separately from public-chain operations.

## Per-criterion assessment

| Criterion                                     | Assessment and evidence                                                                                                                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable reader indirection                     | Implemented and exercised through two live appointments. See registry contract, public resolver and rehearsal-summary evidence. The contract address stayed unchanged.                                      |
| Paying and signing identities differ          | Implemented in configuration and consumed by distinct call paths. The Bee wallet differs from all publisher and council identities.                                                                         |
| Existing storage is renewed                   | Live top-up verified through the same batch ID and increased batch amount. The one-day renewal cost was 0.0954448101244928 xBZZ; shared custody with Folio is disclosed.                                    |
| Specific successor and trigger                | Both present in the tracked committee agreement. B and C are named by public signing identity.                                                                                                              |
| Actual handoff                                | Two completed, independently inspectable appointment transactions plus publications by incoming B and C. Multi-identity rehearsal is real; independent human custody is not demonstrated.                   |
| Appointment authority differs from publishing | Actual Safe controls the registry. Publisher-only and one-signature attempts fail in the fork rehearsal; a one-signature live eth_call also failed before each real appointment.                            |
| No tracked credentials                        | Owner-only ignored local files; actual local key material is compared against repository files by the secret check. Production operator access is disabled and deployment files exclude local runtime data. |
| Incoming identity parameterized               | CLI `--incoming`, form input and `prepareAppointment` parameter supply the successor. Public demo addresses appear as evidence, not as a fixed succession rule.                                             |

## Gaps, limits and improvements made

1. The first immediate read after B's publication returned a stale feed head. The update itself had succeeded. We reconciled the live index without republishing, then changed publication verification to read the exact index and save a reconciliation record before writing. Latest-head discovery can still lag.
2. A fresh fourteen-day batch exceeded the remaining event balance. Reusing and extending the existing funded batch improved continuity within the available funds. It does not separate custody from Folio.
3. There is no independent human handoff: one person controls this test environment. Production use requires delegates and a successor to retain their own keys independently, with off-machine recovery copies.
4. Losing two council keys cannot be silently repaired. A new agreement and identifier are necessary. This is the cost of having no single recovery administrator.
5. Reader availability still depends on public Swarm retrieval, funded postage, Gnosis and chosen RPC/gateway providers. The UI labels recorded data when current state cannot be verified; it does not claim cryptographic light-client verification.
6. Renewal requires a responsible person and available funds. The app supplies a working quote-and-renew path, not a fictitious automatic payment guarantee.

## Success-criteria fit

Technically demonstrated: the original publisher stops participating in the appointment path, the same catalogue identifier remains readable, another signer corrects it, and the existing storage is paid forward. Repeating the procedure and replacing a council delegate covers succession beyond the first successor.

Socially partial: actual institutions have not adopted the agreement, and the demo does not establish independent custody or an enduring renewal fund. Those limits are stated in the app, agreement and README.

## Final verification priorities

1. Check the deployed reader with local Bee and operator stopped, from a clean browser context and an isolated checkout.
2. Inspect mobile layouts, correction validation, local operator renewal quotes and public failure states.
3. Confirm repository CI and public evidence links before submitting the separate Problem 3 repository.
