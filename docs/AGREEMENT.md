# The Relay stewardship agreement

This is a proposed agreement for seven contributing libraries. Our catalogue contains invented demonstration records. No monastery or committee has adopted this agreement. Harsh Gupta operates the test identities in this rehearsal; the separate keys do not represent independent human custody.

## Our promise to the next keeper

The catalogue belongs to the contributing libraries. Keeping it is a responsibility that can be passed on. The appointed steward can correct records, but cannot appoint their own replacement. Paying the storage bill does not make someone the editor. Every library keeps the catalogue's public identifier and a readable recovery copy.

## Who does what

- The **steward** maintains the catalogue, records why each correction was made, and responds to the contributing libraries. They hold a dedicated publishing key that contains no money.
- Three **council delegates**, selected under the libraries' own agreement, hold separate approval keys. Any two must approve a new steward or a replacement delegate. A single delegate cannot decide alone. Delegates must not share one password manager or computer in real operation.
- The **storage custodian** operates a funded Bee node, checks storage each week and after each handoff, and renews it. A deputy keeps the instructions and a recovery copy. The custodian's node key owns its storage batches; appointing a new steward does not transfer those batches.
- An **executor** sends an already-approved council transaction and pays its small network fee. Any suitably funded executor can do this. They cannot create missing council approvals.

In this demonstration, the storage custodian's node address is `0xcbd751094539a35fe771df339ec4c1fe12279ff7`. It is the same local Bee node and batch used by Folio. This is shared custody, explicitly, and is not a transfer of storage ownership.

## The named succession

The original test steward A is `0x9655118E79dCAc22D01A669e9242A37ee722Cf48`.

The named first successor B is `0x041B9D252d4BD580171BD302174D6C3672DB91dC`. The next rehearsal successor C is `0xE3D4802600c47A0BB971b4ea9f0e500bE36c1f72`.

A handoff begins when any of these conditions holds:

1. The steward gives a written retirement notice.
2. Two delegates record unsuccessful contact attempts on two different days, and the steward has been unreachable for fourteen days.
3. Two delegates confirm evidence that the publishing key is lost or compromised. They may begin immediately to limit further incorrect publication.

These are human decisions supported by a written record. A website does not detect death or incapacity. For the demo, A and then B give voluntary retirement notices; we do not pretend fourteen days have passed.

## Passing responsibility

The incoming steward checks the current catalogue and keeps a copy. They create their own publishing key and publish the starting catalogue under it. Two delegates independently check the incoming public address, the starting catalogue, the reason for the handoff and the agreement. They approve the same proposal. An executor records the appointment on Gnosis Chain.

Everyone opens the original catalogue link and verifies a correction published by the incoming steward. The outgoing publishing key is no longer followed by that link. It can still sign its old feed; it has not been erased or revoked. Old public data remains public.

Before the new steward leaves, the council repeats this procedure with another named successor. A delegate may also retire: two current delegates replace that delegate's key while retaining the approval threshold. Keep successors and delegates reachable in the libraries' own contact register, outside this public demo.

## Keeping the catalogue paid for

The custodian checks postage at least weekly and immediately after every handoff. Aim for at least thirty days of funded lifetime. At fourteen days, obtain a renewal quote and arrange payment. At seven days, notify the council and deputy through the libraries' normal contact method and renew as soon as possible. The software displays the observation time and an estimate; changing network prices mean it cannot guarantee an expiry date.

Our demo uses the remaining event funds and an existing funded batch. It does not demonstrate a thirty-day reserve or an automatic payment mandate. Live receipts record exactly the extension performed. No unattended service or payment is configured.

If the current node is unavailable, existing public content may still be read through Swarm while its postage remains valid. The deputy can continue renewal only where they have the necessary node or funding access. If that access is lost, a new custodian must fund another node, buy a batch, and republish the retained catalogue and agreement. The council can appoint a publisher using that node while preserving the public registry identifier. This costs money and does not transfer the old batch.

## When something goes wrong

One missing council key leaves two delegates able to act. Replace the missing key promptly. If fewer than two council keys survive, there is no secret administrator who can unlock the registry. The libraries must agree on a new public identifier and tell readers; the current identifier cannot be silently repaired.

A network outage is not an empty catalogue. Keep and label a dated copy, and retry using another gateway or Gnosis RPC. Verify the current appointment before presenting a copy as current. A corrupt or compromised publisher may publish incorrect records before replacement; retain prior editions and compare corrections rather than assuming a signature proves the historical truth of a record.

Store recovery copies, the public identifier and the agreement in more than one institution. Keep private keys separately, under the control of their actual holders. This test on one laptop rehearses the protocol; independent custody and recurring human renewal remain work for real adoption.

## Review

Read this agreement aloud at each handoff and review it annually. Record agreed changes and reference the revised text in the next council appointment. The public handoff record contains public addresses, catalogue references and transaction receipts, never passwords or recovery phrases.
