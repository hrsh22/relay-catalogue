// Isolated fork rehearsal. Never sends transactions to a public chain.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Safe from "@safe-global/protocol-kit";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { gnosis } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { registryAbi } from "../src/lib/registry-abi";
import { evidence } from "./context";

const rpc = "http://127.0.0.1:8547";
const client = createPublicClient({ chain: gnosis, transport: http(rpc) });
const keys = Array.from({ length: 8 }, () => generatePrivateKey());
const accounts = keys.map((key) => privateKeyToAccount(key));
const wallet = createWalletClient({
  account: accounts[7],
  chain: gnosis,
  transport: http(rpc),
});
await fetch(rpc, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "anvil_setBalance",
    params: [wallet.account.address, "0x56BC75E2D63100000"],
  }),
});
const predicted = await Safe.init({
  provider: rpc,
  predictedSafe: {
    safeAccountConfig: {
      owners: accounts.slice(0, 3).map((a) => a.address),
      threshold: 2,
    },
    safeDeploymentConfig: {
      safeVersion: "1.4.1",
      saltNonce: Date.now().toString(),
    },
  },
});
const council = (await predicted.getAddress()) as Address;
const deployment = await predicted.createSafeDeploymentTransaction();
await client.waitForTransactionReceipt({
  hash: await wallet.sendTransaction({
    to: deployment.to as Address,
    data: deployment.data as Hex,
    value: 0n,
  }),
});
assert(await client.getBytecode({ address: council }));
const artifact = JSON.parse(await readFile("contracts/artifact.json", "utf8"));
const topic = keccak256(toHex("fork rehearsal topic"));
const ref = keccak256(toHex("fork-only dummy Swarm reference"));
const deploymentHash = await wallet.deployContract({
  abi: registryAbi,
  bytecode: artifact.bytecode,
  args: [council, ref, accounts[4].address, topic, ref, ref],
});
const registry = (
  await client.waitForTransactionReceipt({ hash: deploymentHash })
).contractAddress!;
const checks: string[] = [];
const check = (name: string) => {
  checks.push(name);
  console.log("PASS", name);
};
await assert.rejects(
  client.simulateContract({
    account: accounts[4],
    address: registry,
    abi: registryAbi,
    functionName: "appoint",
    args: [0n, accounts[5].address, topic, ref, ref],
  }),
);
check("Publisher cannot appoint a successor directly");
const sdk = await Safe.init({ provider: rpc, safeAddress: council });
assert.equal(await sdk.getThreshold(), 2);
check("Actual Safe contract requires two approvals");
async function propose(revision: bigint, publisher: Address) {
  return sdk.createTransaction({
    transactions: [
      {
        to: registry,
        value: "0",
        data: encodeFunctionData({
          abi: registryAbi,
          functionName: "appoint",
          args: [revision, publisher, topic, ref, ref],
        }),
      },
    ],
  });
}
async function approve(tx: Awaited<ReturnType<typeof propose>>, index: number) {
  return (
    await Safe.init({
      provider: rpc,
      safeAddress: council,
      signer: keys[index],
    })
  ).signTransaction(tx);
}
async function valid(tx: Awaited<ReturnType<typeof propose>>) {
  try {
    return await sdk.isValidTransaction(tx, { from: wallet.account.address });
  } catch {
    return false;
  }
}
async function execute(tx: Awaited<ReturnType<typeof propose>>) {
  const hash = await wallet.sendTransaction({
    to: council,
    data: (await sdk.getEncodedTransaction(tx)) as Hex,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
}
let tx = await approve(await propose(0n, accounts[5].address), 0);
assert.equal(await valid(tx), false);
check("One signature cannot execute an appointment");
tx = await approve(tx, 1);
assert.equal(await valid(tx), true);
await execute(tx);
assert.equal(
  (
    await client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "publisher",
    })
  ).toLowerCase(),
  accounts[5].address.toLowerCase(),
);
check("Two signatures appoint successor B");
assert.equal(await valid(tx), false);
check("Executed Safe transaction cannot be replayed");
let stale = await approve(
  await approve(await propose(0n, accounts[6].address), 0),
  1,
);
assert.equal(await valid(stale), false);
check("Stale succession revision is rejected even with quorum");
let bad = await approve(
  await approve(await propose(1n, accounts[0].address), 0),
  1,
);
assert.equal(await valid(bad), false);
check("Council and publisher identities cannot overlap");
let replacement = await sdk.createSwapOwnerTx({
  oldOwnerAddress: accounts[0].address,
  newOwnerAddress: accounts[3].address,
});
replacement = await approve(await approve(replacement, 1), 2);
await execute(replacement);
assert.equal(await sdk.isOwner(accounts[0].address), false);
assert.equal(await sdk.isOwner(accounts[3].address), true);
assert.equal(await sdk.getThreshold(), 2);
check(
  "Council delegate replacement preserves threshold and removes old delegate",
);
let third = await approve(
  await approve(await propose(1n, accounts[6].address), 1),
  3,
);
assert.equal(await valid(third), true);
await execute(third);
assert.equal(
  await client.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "revision",
  }),
  2n,
);
check(
  "Replacement council appoints successor C without original delegate or publisher",
);
await evidence("fork-rehearsal", {
  kind: "isolated-gnosis-fork",
  publicChainTransactions: false,
  observedAt: new Date().toISOString(),
  checks,
  council,
  registry,
  note: "This validates real Safe bytecode on a local fork. Separate live receipts are required for the actual handoff.",
});
console.log("Fork rehearsal completed:", checks.length, "checks.");
