# Operating Relay

The public reader works without a login or a local node. Signing, publishing and paying run on the operator's own computer. There is no Relay account, hosted transaction queue or master recovery password.

## Read from a clean checkout

```sh
npm ci
npm run relay -- read --registry 0x258a08b90fb76ac3f87d0cb1baebc206370d7d57
```

This reads Gnosis Chain, obtains the currently appointed publisher and topic, and retrieves that feed's catalogue from Swarm. It does not read `.runtime/config.json` when `--registry` is supplied. Use `--gateway https://api.gateway.ethswarm.org` and `--rpc https://gnosis-rpc.publicnode.com` to choose providers explicitly.

In the browser, open **Handoff record > Keep a reading and recovery copy** while the current catalogue is verified. This produces one printable HTML document with all records, the registry-linked agreement fetched from Swarm, observed council identities and plain-language handoff steps. The complete document opens offline and contains no scripts or keys. Its observation timestamp distinguishes a retained copy from current network state; a failed agreement fetch prevents an incomplete download. Keep it in more than one institution.

The durable identifier is `eip155:100:0x258a08b90fb76ac3f87d0cb1baebc206370d7d57`. A Vercel URL is one doorway to it. The default app deployment and recovery card contain the same identifier.

The reader trusts its RPC and gateway. It is not a Gnosis light client. It validates the returned catalogue format, catalogue identity and appointed publisher, and checks whether a succession occurred during the read. If it cannot verify the current state, the UI explicitly labels any retained copy as recorded rather than current.

## Start a manual operator session

```sh
npm run operator:start
```

Open `http://127.0.0.1:3002`. Ctrl-C closes the session and any Bee process it started. If Bee was already running, the command leaves that existing process under its original operator's control. No unattended payment is configured.

For this workspace, `.env.local` points at the existing funded Bee binary and data directory in the sibling Folio folder. Those paths are local convenience configuration and are not committed. Another operator supplies their own paths and node:

```text
RELAY_BEE_URL=http://127.0.0.1:1633
RELAY_BEE_BINARY=/absolute/path/to/bee
RELAY_BEE_DATA=/absolute/path/to/bee-data
RELAY_BEE_PASSWORD_FILE=/absolute/path/to/node-password
RELAY_BEE_RPC_URL=https://your-gnosis-rpc
RELAY_RPC_URL=https://your-gnosis-rpc
```

Use a funded light node. Keep its API on loopback: access to that API can spend stamps and invoke wallet operations. The browser operator API is enabled only by the launcher, rejects Vercel, validates the loopback Host and same-origin mutation requests, and serializes operations. Private keys stay in local files. The public deployment cannot read them or perform operator actions.

## Separate custodians

For a fresh test rehearsal, `npm run relay -- init` generates dedicated test keys in `.runtime/private` with owner-only permissions and stores public configuration in `.runtime/config.json`. Existing key files are never overwritten. This command is a demo convenience, not independent custody.

For independent custody, each actual holder generates their own key locally and shares only its public address. Copy the public configuration to each checkout and provide only the key file that holder controls. Never distribute the entire demo private directory. Council proposals and their signatures are public portable JSON; a delegate needs no other delegate's private key. An executor can execute a completed proposal using any funded executor key, not just the one in our demo.

`RELAY_ROOT` can explicitly identify the checkout root. Run the npm commands from that checkout. The configured payer must equal the connected Bee wallet; accidental identity reuse with a publisher or council delegate is rejected.

## Publishing and incoming feeds

Catalogue data uses `relay.catalogue.v1` (see FORMAT.md). A current steward publishes a file using their key:

```sh
npm run relay -- publish --input catalogue.json --key /private/path/publisher.key
```

The next edition must increment that publisher feed's revision and name the previous content reference. The operator form prepares these fields for corrections. The publisher signs a Swarm feed update with their dedicated key; the node wallet pays for storage, not that signature.

A successor first stages a catalogue under their own key:

```sh
npm run relay -- publish --input incoming-catalogue.json --key /private/path/incoming.key --staging
```

For a new feed, set its catalogue revision to zero and previous reference to null; keep the catalogue identifier and use the incoming publisher's public address. A staged feed is not authoritative until the council appoints it. Publication checks the bytes and the exact signed feed index. Latest-feed discovery may lag briefly, so readers should refresh before expecting a new edition. Pending publication records remain in `.runtime/pending-publications` for reconciliation after transport failures; do not blindly send another update.

## A handoff without a hosted coordinator

Prepare the proposal with the incoming address and its verified checkpoint. The CLI reads the incoming feed before creating the proposal:

```sh
npm run relay -- propose --incoming 0xINCOMING_ADDRESS --checkpoint SWARM_REFERENCE --agreement AGREEMENT_REFERENCE --out proposal.json
```

One delegate checks and signs it on their machine, then passes the resulting public file to the next delegate:

```sh
npm run relay -- approve --input proposal.json --key /private/path/council.key --out approved-once.json
npm run relay -- approve --input approved-once.json --key /private/path/other-council.key --out approved-twice.json
```

An executor checks and executes the completed proposal:

```sh
npm run relay -- execute --input approved-twice.json --key /private/path/executor.key --max-wei 100000000000000
```

The amount is a gas budget ceiling in wei, not a transfer to the council. Proposals permit only zero-value calls with no gas-refund recipient. The Safe's signatures authorize the exact target, calldata, nonce and chain. The registry also rejects a stale succession revision. The public link continues resolving the same registry, which now points to the new publisher's feed.

To replace a departing council delegate, prepare a `replace-councillor` proposal using `--old-owner` and `--new-owner`, then approve and execute it in the same way. The `swapOwner` path retains the threshold. A retired delegate no longer counts toward it.

## Renew the existing batch

```sh
npm run relay -- storage
npm run relay -- storage-quote renew --days 1 --out renewal.json
npm run relay -- storage-execute --input renewal.json --max-plur 1200000000000000
```

Review the actual quote, paying address and balance before execution. `max-plur` is the xBZZ spending ceiling; 10^16 PLUR equals 1 xBZZ. Gnosis gas is additional. Quotes expire after two minutes, are re-priced before execution, and the browser consumes each quote once. The receipt compares the same batch identifier and checks its amount increased. The SDK result is a batch identifier, not a transaction hash.

The demo renewed the existing Folio batch rather than buying storage it could not afford from the remaining event funds. Shared node custody is explicit. Node observations and lifetime estimates do not guarantee perpetual availability.

## When the original node is lost

Keep the public identifier, the latest verified catalogue JSON and the agreement outside the original machine. The incoming custodian needs their own funded Bee and batch; the original batch is not transferred. Configure that new node and expected payer, upload the retained agreement, stage the catalogue with the successor key, and complete the council appointment. The registry remains the same. The operator and publisher can also move to another node without a new appointment if the publishing identity and topic remain the same, provided they preserve and reconcile the existing feed sequence.

Do not promise recovery if all copies disappear after postage lapses. If two council keys are lost, the current registry has no administrator override. A new agreement and reader identifier become necessary.

## Deployment and verification

The Next.js app can be deployed as one Vercel project. It needs no production private environment variables. Do not set `RELAY_LOCAL_OPERATOR` in production. `.vercelignore`, file-trace exclusions and Git ignore rules exclude local runtime material.

```sh
npm test
npm run typecheck
npm run build
npm run check:secrets
```

Run `npm run verify:fork` to exercise nine checks against actual Safe contracts on an isolated loopback Gnosis fork. The runner starts and stops its own Anvil and worker, including on failure or Ctrl-C. It never starts Bee, loads operator configuration or reads private key files. Test keys are generated in memory and balances exist only on the fork.

The public RPC is queried for a current block, which is pinned for that run and saved in `.runtime/fork-verification/report.json`. Public endpoints may not retain historical state, so a permanently pinned historical block is not the default. An archive-capable endpoint and `RELAY_FORK_BLOCK` can reproduce a specific historical block; `RELAY_FORK_SOURCE` selects another public HTTPS RPC. The source is only used for read requests. The report, log and process cleanup record are also uploaded by the separate CI fork job. An unavailable RPC is a failed check, not a skipped pass. `scripts/rehearse-live.ts` records the dedicated live demonstration with resumable checkpoints. Do not rerun its funded steps on another catalogue without reviewing their purpose and limits.
