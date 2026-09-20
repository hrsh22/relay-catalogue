# Council review with separate keyholders

Each delegate can review and sign a portable proposal in their own Relay checkout using only their own approval key. The council session needs Gnosis RPC and public Swarm reads to verify the proposal and its referenced records. It does not need the storage custodian's Bee process, node configuration or credentials.

This is the implemented path for separate holders. The existing public rehearsal used test identities controlled by one builder; it is not evidence that separate people have completed this procedure.

## Prepare the holder's checkout

Use Node.js 22 and install the repository dependencies:

```sh
npm ci
mkdir -p .runtime/private
chmod 700 .runtime/private
```

Download the **public operator configuration** from the existing operator and save it as `.runtime/config.json`. It identifies the chain, registry, council, catalogue, role addresses and storage batch. It contains no signing keys. Confirm the registry identifier with the libraries' retained record before using that configuration. Copy only this public file, not another operator's `.runtime` directory or environment file.

A delegate installs only the approval key they control as `.runtime/private/council-<alias>.key`, where `<alias>` matches their entry in `councilOwners`. For example, delegate `2` uses `council-2.key`. The file contains one Ethereum-compatible `0x`-prefixed private key and must have owner-only permissions (`chmod 600` on that file). Keep the key out of the browser form, proposal files and Git. The public address must already be a current council owner; changing an alias in configuration cannot appoint a delegate. A new holder must first be appointed by the existing council.

After a replacement appoints an external delegate, the downloaded configuration may still contain the earlier alias mappings. The incoming holder completes this public setup step:

1. Confirm their public address appears among the current council owners read from the registry.
2. In their own `.runtime/config.json`, add that public address to `councilOwners` under a unique alias such as `library-east`. Use 1-32 letters, numbers, underscores or hyphens, beginning with a letter or number. Preserve the registry, council and catalogue identifiers and the other public mappings.
3. Install only their own approval key as `.runtime/private/council-library-east.key`, set its permissions to `600`, and reload the council session. The alias and key filename must agree.

This mapping tells the UI which local key belongs to which public address. It does not change council membership, grant approval authority or substitute for the prior on-chain appointment. Every review and approval checks the current council owners. The public setup download validates address-valued mappings and omits extra configuration properties; do not place private values in the public configuration.

An executor instead installs only their own funded key as `.runtime/private/executor.key`, also with owner-only permissions. An executor does not need a delegate's private key. Do not run the test identity initializer for this setup: it generates several roles for a rehearsal rather than establishing separate custody.

```sh
npm run council:start
```

Open `http://127.0.0.1:3002`. This starts the council UI with `RELAY_COUNCIL_ONLY=1`; it does not probe or start Bee. `RELAY_RPC_URL` may select the holder's preferred Gnosis RPC. The default RPC is configured in [context.ts](../scripts/context.ts). Ctrl-C closes only the session's owned process. [The launcher](../scripts/operator.ts) keeps the full `operator:start` command available for the storage custodian.

## Review, approve and pass on the proposal

1. Import the public proposal JSON in the handoff panel and request its verified review. Importing does not sign or send a transaction.
2. Compare the registry and council addresses with the library's retained identifier. Inspect the proposal kind, chain, transaction hash, nonce, current approval threshold and already-verified signers. For a handoff, inspect the outgoing and incoming public addresses, succession revision, starting catalogue and agreement. For a delegate replacement, inspect both delegate addresses.
3. Read the referenced catalogue and agreement. Confirm the human reason for the change through the libraries' agreed process. Free-text supporting context is not itself part of the Safe transaction signature; the displayed transaction fields and referenced content are what the review validates.
4. Select the holder's available council identity and approve the reviewed proposal. The signing code independently repeats validation and verifies that the key belongs to a current delegate. Approval signs this proposal; it does not execute the appointment.
5. Export the updated public proposal JSON and pass it to the next delegate. That delegate imports, reviews, approves and exports it from their own checkout with their own key. Exchange the proposal and its public signatures, never the key files.
6. An executor imports and reviews the completed proposal. Once the current threshold is satisfied, they execute it using their funded executor key. The executor pays the transaction fee and cannot manufacture missing council approvals. Reopen the original catalogue identifier and verify the resulting appointment or council membership.

The [proposal implementation](../scripts/council.ts) validates the configured registry, chain, current Safe owners, nonce, canonical transaction data and recovered signatures. Incoming handoff content is checked through public Swarm reads. Review, approval and execution repeat the relevant checks; a stale proposal must be prepared and approved again. The [operator API](../src/app/api/operator/route.ts) is restricted to the loopback session and same-origin mutations.

The same public-file exchange is available through the [documented CLI commands](OPERATIONS.md#a-handoff-without-a-hosted-coordinator), using explicit key-file paths. The browser path makes those review and exchange steps available without sharing the storage node or centralizing every delegate's key.
