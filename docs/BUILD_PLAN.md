# Problem 3 proposal: Relay

Status: direction approved by the builder, who delegated implementation decisions and operation. Build, live succession, independent recovery and browser verification are complete. See VERIFICATION.md.

Prepared 20 September 2026. Original deadline snapshot: 11:11 PM IST. The post-submission evaluator now reports 20 September 2026 at 19:41 UTC, which is 21 September at 1:11 AM IST. All work was completed before the original deadline.

## Outcome

Relay is a shared catalogue with a rehearsed succession procedure. A reader keeps the same catalogue link while the appointed publisher changes. Storage payment, catalogue publication and appointment of a successor have separate identities and explicit responsibilities.

Create `rtd-5/relay` as a separate Git repository beside Folio and Fieldnote. Build one Next.js, TypeScript and shadcn application for Vercel, plus portable operator commands in that same repository. Pin `@ethersphere/bee-js` to the already-used 13.1.0 version and read the installed Next.js guides before implementation.

## Proposed authority model

Use a small public registry on Gnosis Chain, controlled by a 2-of-3 Safe. The registry holds the current publisher address, feed topic, succession revision and a reference to the written arrangement. Its address is the durable catalogue identifier.

The read path is: catalogue identifier -> registry -> current publisher's Swarm feed -> catalogue data on Swarm. Changing publisher changes the registry state, not the reader's starting identifier. Another host or the recovery CLI can resolve that same identifier without the original Vercel deployment.

| Role                 | Credential and capabilities                             | Limits                                                                                                 |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Catalogue steward    | Dedicated feed signing key, provided at runtime         | Can publish catalogue revisions; cannot appoint the next steward or spend the Bee wallet               |
| Council              | Three dedicated Safe owner keys; two approvals required | Can appoint a publisher and replace council members; does not thereby own the Bee node or its batches  |
| Storage custodian    | Funded Bee node and its node wallet                     | Buys and extends storage; access to its API also permits spending stamps, so the API stays on loopback |
| Transaction executor | A funded Gnosis account                                 | Pays gas and relays already-authorized Safe transactions; cannot supply missing approvals              |
| Reader               | Public catalogue identifier                             | Reads without signing in or running the publisher's computer                                           |

The proposed three council delegates represent a committee agreement, not a claim that three real committee members joined this demo. Each council key must differ from the publishing and paying identities. Safe owner replacement lets the appointment authority itself survive a delegate leaving.

Safe is proposed because it provides an existing threshold authorization mechanism and an ordered public transaction record. A custom reader-vote protocol would need its own rules for stale votes, competing successors, discovery and authority rotation. The accepted cost is dependence on Gnosis availability, RPC access and gas. Public RPC endpoints must be configurable; no private Relay server or Safe Transaction Service account should be required to execute a completed proposal.

Implement the registry with a narrow, immutable authorization boundary to the Safe. Reject unauthorized writes, invalid addresses and stale succession revisions. Avoid upgrade admin keys. Contract tests and a local-chain rehearsal precede any live deployment. Prepare actual gas and postage quotes before funded operations.

## Product experience

1. **Catalogue:** searchable records for seven example collections, condition, missing or damaged folios, photography status and revision provenance. Mark example data clearly.
2. **Stewardship:** current steward, council threshold, role capabilities, the next named successor and the conditions for a handoff. Use plain language before technical identifiers.
3. **Handoff:** enter the incoming publisher address, confirm that they control it, prepare a proposal, collect two approvals, execute, and verify a real publication from the incoming identity.
4. **Storage:** show batch identity, remaining lifetime estimate, last verification time, renewal responsibility and an executable quote-and-extend flow for the existing batch.
5. **Evidence:** chronological handoff receipts with feed references, publisher addresses, transaction hashes and verification results. Distinguish live checks from saved observations.
6. **Recovery:** downloadable public handover information and documented commands for reading, publishing, approving succession and renewing storage from another checkout.

Do not send private keys to Vercel or publish them in the repository. The demo can use owner-only, ignored local key files. Signed proposal files can be exchanged and executed without a hosted coordination service. Production custody requires the signers to hold their own keys independently.

## Local node and storage

Reuse the existing funded Bee node for the live rehearsal. Keep Bee on `127.0.0.1:1633`. Provide a manual foreground operator command; Ctrl-C stops the connection. No login item, launch agent, caffeinate or always-running tunnel.

The public reader must work with the local node and tunnel stopped. Node-touching operations run locally. If a Vercel operator session needs a tunnel, expose an authenticated, restricted application bridge, not the raw Bee API. The ordinary local operator flow should work without a tunnel.

The separate repository must accept its Bee URL and expected paying address through configuration, so a successor can use their own funded node. Local reuse of Folio's node is a convenience, not a dependency embedded in the protocol.

Demonstrate extending an existing batch and record its identifier before and after. Show estimates rather than promising a fixed permanent expiry date. Define a regular human renewal schedule and escalation thresholds in the agreement.

A batch does not transfer when the publisher changes. If the original machine or node key is lost, the successor needs another funded node and batch, then republishes retained catalogue data and continues their authorized feed. Preserve a public recovery copy and document this transition. Never describe one shared node as independent storage custody.

## Live rehearsal and evidence

1. Create distinct publisher identities A, B and C, separate council identities and explicit node/payer configuration. Record public addresses only.
2. Upload the initial catalogue through the funded light node. Resolve it using the public identifier from an independent read path.
3. Have A publish a correction. Record its feed index and Swarm reference.
4. Rehearse A being unavailable. Collect two council approvals without A's publisher key, appoint B, and have B publish another correction. Verify that the original reader link resolves B's version.
5. Show that A publishing to the retired feed does not change the authoritative catalogue. Also show that one council signature cannot appoint a successor.
6. Repeat B -> C without B's publisher key to demonstrate that succession is repeatable.
7. Replace one council signer through the Safe and verify that the remaining council can still authorize a handoff. A retired council signer must no longer count.
8. Extend the existing storage batch, record the transaction or available node receipt and before/after observations, and verify the catalogue again.
9. Stop local services. Read the catalogue from the deployed app and a clean recovery command using public infrastructure.

The rehearsal will prove multiple distinct signing identities, not independent human custody, if one person operates all keys on this laptop. Label it exactly that way. A real transfer to another human custodian is stronger evidence and requires that person's participation; do not invent one or claim it happened.

## Committee agreement

Write a short agreement understandable without SDK knowledge. Name the current and next steward by public identifier; define voluntary retirement, inability to contact the steward for an agreed period, and confirmed key compromise as separate triggers. State who documents the trigger and how the two approvals are collected. Avoid automatic death or inactivity detection claims.

Define who checks storage, who provides funds, when low lifetime escalates, who keeps recovery copies, how corrections are requested, how council delegates are replaced, and what happens if fewer than two council keys survive. Explain that lost quorum cannot be fixed by an undisclosed administrator.

Label the seven-library agreement as a proposed arrangement demonstrated with test identities. Do not claim actual institutional adoption.

## Rubric coverage and acceptance gates

| Technical criterion                                  | Weight | Required evidence                                                                                                  |
| ---------------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------ |
| Stable reader indirection through publisher rotation |     20 | Original identifier resolves A, then B, then C through live registry and feed reads                                |
| Separate paying and publishing identities            |     12 | Runtime configuration and call paths consume distinct identities; explicit equality checks reject accidental reuse |
| Extend an existing postage batch                     |     10 | Executable renewal path, same batch identifier, recorded before/after state                                        |
| Specific successor and trigger                       |     10 | Human-readable agreement with actual demo successor public address and precise trigger                             |
| Actual handoff between distinct signing identities   |     10 | Signed and on-chain receipts plus a successful incoming publication; custody limitation disclosed                  |
| Appointment authority differs from publisher         |      8 | Safe controls registry; publisher-only and one-signature attempts fail                                             |
| No tracked credentials                               |      6 | Secret scan, ignored private runtime files, public-only evidence                                                   |
| Incoming steward supplied outside source             |      4 | CLI/form input and configuration; no successor address hardcoded into application logic                            |

For the remaining qualitative criterion, focus on an understandable agreement, recovery without the original operator service, honest node custody limits and a product that makes responsibility clear. A polished dashboard alone is insufficient.

Test the authorization boundaries, stale/replayed proposals, wrong chain/address inputs, missing quorum, old-publisher behavior, failed uploads, unsuccessful renewal and gateway failures. Do not present a stale snapshot as a verified current catalogue. Run type checks, builds, secret checks and a real mobile/browser walkthrough.

## Build sequence

1. Product and authority direction confirmed on 20 September 2026.
2. Implement and locally test the registry, Safe transaction flow and public resolver first.
3. Connect the funded Bee node; complete a real A -> B handoff before expanding the UI.
4. Build the catalogue, stewardship, renewal and handoff screens.
5. Complete B -> C, council replacement, storage renewal and recovery evidence.
6. Review against the free Loops evaluator prompt, fix gaps and prepare the separate Problem 3 submission for review.

Do not overwrite the existing Folio event-level CLI repository field. Problem 3 must use its own workspace submission slot. This plan does not submit anything or run official scoring.

## Sources

- [Live Problem 3 brief and eight technical checks](https://www.loops.house/road-to-devcon-v/workspace), inspected in the signed-in workspace on 20 September 2026.
- The free evaluator prompt saved as `evaluator.json` alongside this plan, including the qualitative rubric. It supplies review instructions, not an official score.
- Problem knowledge graph evidence saved as `knowledge-architecture.json`. Its retrieval supports feed and node concepts but does not decide between the proposed architectures.
- [bee-js SOC and feeds](https://bee-js.ethswarm.org/docs/soc-and-feeds/): dedicated publisher keys, owner/topic addressing and sequential updates.
- [bee-js storage](https://bee-js.ethswarm.org/docs/storage/): cost estimation, extending existing batches and lifetime estimates.
- [Safe deployment](https://docs.safe.global/sdk/protocol-kit/guides/safe-deployment).
- [Safe signatures](https://docs.safe.global/sdk/protocol-kit/guides/signatures): owners and signature thresholds.
- [Safe transaction execution](https://docs.safe.global/sdk/protocol-kit/guides/execute-transactions).
- [Safe owner management](https://docs.safe.global/reference-smart-account/owners/addOwnerWithThreshold).

The application architecture and implementation sequence above are our proposal, not a claim made by these source documents.

## Budget decision during implementation

A fresh 14-day batch was quoted at 1.3354 xBZZ, above the remaining 0.2463 xBZZ event balance. Relay therefore uses the existing Folio batch on the shared Bee node, with roughly 13 days remaining at inspection. The live renewal extends this existing batch; public documentation discloses the shared storage custody. Dedicated publisher and council identities remain separate.
