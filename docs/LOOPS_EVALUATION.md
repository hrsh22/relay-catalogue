# Problem 3 alignment review

Local review against the free Loops evaluator prompt, retrieved on 20 September 2026. This is not an official scored judging attempt. The evaluator prompt supplies instructions for inspecting the repository; it does not run the tests or produce an official verdict.

## Alignment summary

Relay directly implements succession for a shared Swarm catalogue. The public identifier resolves a Gnosis appointment registry governed by an actual 2-of-3 Safe, then the current publisher's feed. Live evidence records A -> B -> C, incoming corrections, a replaced council delegate, an ignored old-publisher update and an extension of the existing postage batch.

The receipts identify the demonstration signers operated by Harsh Gupta and the configured paying identity. The agreement assigns publishing, council decisions and storage renewal to their respective roles.

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
| Actual handoff                                | Two completed, independently inspectable appointment transactions plus publications by incoming B and C. The receipts identify the demonstration signers and their separate keys.                           |
| Appointment authority differs from publishing | Actual Safe controls the registry. Publisher-only and one-signature attempts fail in the fork rehearsal; a one-signature live eth_call also failed before each real appointment.                            |
| No tracked credentials                        | Owner-only ignored local files; actual local key material is compared against repository files by the secret check. Production operator access is disabled and deployment files exclude local runtime data. |
| Incoming identity parameterized               | CLI `--incoming`, form input and `prepareAppointment` parameter supply the successor. Public demo addresses appear as evidence, not as a fixed succession rule.                                             |

## Implementation decisions and improvements

1. Publication verification reads the exact signed index and saves a reconciliation record before writing. This handles a gateway returning a stale latest head without duplicating the update.
2. The storage workflow renews the existing configured batch and records its identifier and amount before and after. Folio and Relay use the same paying node; appointment changes publishing authority while preserving that batch ownership.
3. Council approvals use portable transaction files, and any funded executor can send a completed proposal. The registry enforces the current quorum, rejects stale succession revisions and contains no administrator override.
4. The public reader distinguishes verified current state from a dated retained copy. The offline recovery document includes every catalogue record, the actual linked agreement and instructions matching the observed council threshold.
5. The custodian manages Bee and renewal. Quote expiry, balance, spending ceiling and batch amount checks are implemented before and after the renewal operation.

## Success-criteria fit

Technically demonstrated: the original publisher stops participating in the appointment path, the same catalogue identifier remains readable, another signer corrects it, and the existing storage is paid forward. Repeating the procedure and replacing a council delegate covers succession beyond the first successor.

The committee agreement is a proposed arrangement using demonstration records and identities. The repository retains the actual handoff, publication and renewal evidence separately from those proposed responsibilities.

## Final verification completed

1. With Bee, Next operator and the test chain stopped, the deployed reader loaded in incognito Chrome and a clean GitHub checkout resolved C feed index 2 without private configuration.
2. Mobile layouts, correction validation, live browser publication, renewal quotes and the unavailable-gateway state were checked. Operator accessibility, collection-name search and external successor input were improved.
3. Twelve tests, type checking, production build, source/runtime contract verification and secret scanning passed. Nine Safe checks run through `npm run verify:fork` and a separate CI job. See [VERIFICATION.md](VERIFICATION.md) for the evidence.

## Submission and platform record

After submission, the free evaluator was fetched again. Its event-level project is named `road-to-devcon-v_p1p2p3_harsh-gupta` but its single `repoUrl` still points to Folio. The workspace stores three separate problem repositories. A full reload confirmed Problem 3's pasted URL is `https://github.com/hrsh22/relay-catalogue`, with Folio and Fieldnote retained in their own slots. We evaluated the Relay source directly and did not overwrite the shared event-level URL. See [SUBMISSION.md](SUBMISSION.md).

## Repository review path

Start with [REPOSITORY_REVIEW.md](REPOSITORY_REVIEW.md) for all eight weighted technical checks, implementation paths and supporting receipts. The committee agreement, portable approval code, configured storage workflow and automated checks can all be reviewed from GitHub. Hosted demonstrations are supplementary.

No numeric score or win prediction is assigned.
