# Verification record

Observed on 20 September 2026. This records completed checks, not a promise of permanent network availability or an official contest score.

## Public network

- Registry `0x258a08b90fb76ac3f87d0cb1baebc206370d7d57` stayed unchanged through two actual Safe appointments: A -> B -> C.
- Incoming B and C each published corrections. The public reader ignored A's later retired-feed update.
- A real Safe owner replacement removed delegate 1 and appointed delegate 4; the changed council then appointed C.
- The existing shared postage batch was extended by one day for 0.0954448101244928 xBZZ. Its identifier remained unchanged and its amount increased. Remaining lifetime is an observation, not a fixed expiry guarantee.
- `npm run verify:contract` compared the deployed registry runtime bytecode and metadata with the compiled tracked source, masking only constructor immutable slots and then checking their getter values. All 1,479 runtime bytes matched. This is reproducible source verification, not an explorer verification badge.

See the timestamped receipts in [evidence/](../evidence/) and the [public evidence bundle](../public/evidence.json).

## Independent recovery

The manual operator was started from a stopped node, returned HTTP 200, and stopped with SIGINT. Its Bee and Next children closed. Ports 1633, 3002 and 8547 were confirmed closed.

With those services stopped, a fresh GitHub clone installed its own dependencies and read the registry without `.env.local` or private configuration. It resolved publisher C, succession revision 2, feed index 2, 21 records and the same Swarm reference as the live verification command. An incognito Chrome window independently opened the Vercel app and showed the live catalogue and current C appointment.

- [Operator lifecycle](../evidence/operator-lifecycle.json)
- [Clean checkout recovery](../evidence/independent-recovery.json)
- [Public read with local node stopped](../evidence/public-node-off-read.json)

## Application checks

- Desktop catalogue, record details, collection search, stewardship and storage views inspected.
- Responsive 375px catalogue, navigation and renewal dialog inspected without horizontal overflow.
- Empty correction reason rejected; a valid local browser correction published as C feed index 2 and was read through the public gateway.
- Local renewal quote returned a real amount and expiry. The earlier actual renewal is recorded separately; this UI check did not spend again.
- Changing to an unavailable gateway displayed: "Recorded copy. Current network state could not be verified." Restoring the public gateway recovered live verification.
- Production `/api/operator` returned 404. A cross-origin local mutation returned 403.
- External successor address and checkpoint inputs are supported; proposal preparation validates the incoming feed. Local demo key aliases are optional conveniences.

## Automated checks

Eight format, identity and endpoint tests pass. TypeScript, the production build, contract artifact regeneration and secret scanning pass. The secret scan compares the actual ignored key material against all repository files as well as checking credential patterns.

Nine isolated Gnosis-fork checks exercised actual Safe code: unauthorized publisher, insufficient signatures, successful quorum, replay protection, stale succession revision, role overlap, and council replacement followed by another appointment. The saved record is explicitly marked as a fork rehearsal; it is separate from live transaction evidence.

CI repeats the offline checks in a clean environment: [Verify Relay](https://github.com/hrsh22/relay-catalogue/actions/workflows/verify.yml).

## Limits

One builder controls all demonstration keys on one computer. Independent people have not adopted the agreement. Public RPC and Swarm gateways remain trusted availability dependencies; the reader is not a chain light client. The node and postage batch are shared with Folio. No automatic renewal fund, key recovery administrator or custody transfer is claimed.
