import Safe, {
  EthSafeSignature,
  EthSafeTransaction,
} from "@safe-global/protocol-kit";
import type { SafeTransactionData } from "@safe-global/types-kit";
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { registryAbi } from "../src/lib/registry-abi";
import { readRegistry } from "../src/lib/chain";
import {
  addressSchema,
  distinctIdentities,
  referenceSchema,
} from "../src/lib/model";
import { readFeed, DEFAULT_GATEWAY } from "../src/lib/network";
import {
  config,
  evidence,
  publicClient,
  readKey,
  RPC,
  saveConfig,
  wallet,
  type Config,
} from "./context";

export type Proposal = {
  format: "relay.proposal.v1";
  chainId: 100;
  registry: Address;
  council: Address;
  kind: "appoint" | "replace-councillor";
  description: string;
  createdAt: string;
  transaction: SafeTransactionData;
  safeTxHash: Hex;
  signatures: { signer: string; data: string }[];
};
export async function councilSdk(c: Config, keyFile?: string) {
  if (!c.council) throw new Error("Council has not been deployed.");
  return Safe.init({
    provider: RPC,
    safeAddress: c.council,
    ...(keyFile ? { signer: await readKey(keyFile) } : {}),
  });
}
export async function prepareCouncil(c: Config) {
  const owners = [
    c.councilOwners["1"],
    c.councilOwners["2"],
    c.councilOwners["3"],
  ];
  distinctIdentities(c.initialPublisher, c.payer, owners);
  return Safe.init({
    provider: RPC,
    predictedSafe: {
      safeAccountConfig: { owners, threshold: 2 },
      safeDeploymentConfig: { saltNonce: c.saltNonce, safeVersion: "1.4.1" },
    },
  });
}
export async function deployCouncil(
  keyFile: string,
  maxWei: bigint,
  persist = true,
) {
  const c = await config();
  const sdk = await prepareCouncil(c);
  const address = (await sdk.getAddress()) as Address;
  const client = publicClient();
  if (await client.getBytecode({ address })) {
    if (persist) await saveConfig({ ...c, council: address });
    return { address, alreadyDeployed: true };
  }
  const tx = await sdk.createSafeDeploymentTransaction();
  const sender = await wallet(keyFile);
  const gas = await client.estimateGas({
    account: sender.account,
    to: tx.to as Address,
    data: tx.data as Hex,
    value: BigInt(tx.value),
  });
  const gasPrice = await client.getGasPrice();
  if (gas * gasPrice * 2n > maxWei)
    throw new Error("Safe deployment exceeds the configured gas budget.");
  const hash = await sender.sendTransaction({
    to: tx.to as Address,
    data: tx.data as Hex,
    value: BigInt(tx.value),
    gas: (gas * 12n) / 10n,
    gasPrice,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error("Safe deployment reverted.");
  const connected = await Safe.init({ provider: RPC, safeAddress: address });
  if ((await connected.getThreshold()) !== 2)
    throw new Error("Unexpected Safe threshold after deployment.");
  if (persist) {
    await saveConfig({ ...c, council: address });
    await evidence("council-deployed", {
      address,
      hash,
      blockNumber: receipt.blockNumber,
      owners: await connected.getOwners(),
      threshold: 2,
    });
  }
  return { address, hash };
}
export async function prepareAppointment(
  incoming: string,
  topic: Hex,
  checkpoint: string,
  agreement: string,
): Promise<Proposal> {
  const c = await config();
  if (!c.registry || !c.council)
    throw new Error("Deploy the council and registry first.");
  const state = await readRegistry(c.registry, RPC);
  const next = getAddress(addressSchema.parse(incoming));
  distinctIdentities(next, c.payer, state.owners);
  if (next.toLowerCase() === state.publisher.toLowerCase())
    throw new Error("The incoming steward is already appointed.");
  referenceSchema.parse(checkpoint);
  referenceSchema.parse(agreement);
  const incomingHead = await readFeed(
    { ...state, publisher: next, topic },
    process.env.RELAY_READ_GATEWAY || DEFAULT_GATEWAY,
  );
  if (incomingHead.reference !== checkpoint)
    throw new Error(
      "The incoming feed does not resolve to the proposed checkpoint. Stage and verify its catalogue first.",
    );
  const sdk = await councilSdk(c);
  const tx = await sdk.createTransaction({
    transactions: [
      {
        to: c.registry,
        value: "0",
        data: encodeFunctionData({
          abi: registryAbi,
          functionName: "appoint",
          args: [
            BigInt(state.revision),
            next,
            topic,
            `0x${checkpoint}`,
            `0x${agreement}`,
          ],
        }),
      },
    ],
  });
  return {
    format: "relay.proposal.v1",
    chainId: 100,
    registry: c.registry,
    council: c.council,
    kind: "appoint",
    description: `Appoint ${next} after ${state.publisher}; expected succession revision ${state.revision}.`,
    createdAt: new Date().toISOString(),
    transaction: tx.data,
    safeTxHash: (await sdk.getTransactionHash(tx)) as Hex,
    signatures: [],
  };
}
export async function prepareReplacement(
  oldOwner: string,
  newOwner: string,
): Promise<Proposal> {
  const c = await config();
  if (!c.registry || !c.council) throw new Error("No deployment configured.");
  addressSchema.parse(oldOwner);
  addressSchema.parse(newOwner);
  const state = await readRegistry(c.registry, RPC);
  if (
    [state.publisher, c.payer].some(
      (a) => a.toLowerCase() === newOwner.toLowerCase(),
    )
  )
    throw new Error(
      "A council delegate must differ from the publisher and payer.",
    );
  const sdk = await councilSdk(c);
  const tx = await sdk.createSwapOwnerTx({
    oldOwnerAddress: oldOwner,
    newOwnerAddress: newOwner,
  });
  return {
    format: "relay.proposal.v1",
    chainId: 100,
    registry: c.registry,
    council: c.council,
    kind: "replace-councillor",
    description: `Replace council delegate ${oldOwner} with ${newOwner}; retain threshold.`,
    createdAt: new Date().toISOString(),
    transaction: tx.data,
    safeTxHash: (await sdk.getTransactionHash(tx)) as Hex,
    signatures: [],
  };
}
export async function validateProposal(proposal: Proposal) {
  const c = await config();
  if (
    proposal.format !== "relay.proposal.v1" ||
    proposal.chainId !== 100 ||
    proposal.registry.toLowerCase() !== c.registry?.toLowerCase() ||
    proposal.council.toLowerCase() !== c.council?.toLowerCase()
  )
    throw new Error("Proposal is for a different catalogue, council or chain.");
  const t = proposal.transaction;
  if (
    t.operation !== 0 ||
    t.value !== "0" ||
    t.gasToken !== zeroAddress ||
    t.refundReceiver !== zeroAddress ||
    t.gasPrice !== "0"
  )
    throw new Error("Only zero-value calls without gas refunds are allowed.");
  const state = await readRegistry(c.registry!, RPC);
  if (proposal.kind === "appoint") {
    if (t.to.toLowerCase() !== c.registry?.toLowerCase())
      throw new Error("Appointment target is not the registry.");
    const decoded = decodeFunctionData({
      abi: registryAbi,
      data: t.data as Hex,
    });
    if (decoded.functionName !== "appoint")
      throw new Error("Unknown registry operation.");
    const [revision, next, topic, checkpoint, agreement] = decoded.args;
    if (revision !== BigInt(state.revision))
      throw new Error("Proposal is stale: the succession revision changed.");
    if (
      next.toLowerCase() === state.publisher.toLowerCase() ||
      next === zeroAddress ||
      /^0x0+$/.test(topic) ||
      /^0x0+$/.test(checkpoint) ||
      /^0x0+$/.test(agreement)
    )
      throw new Error("Invalid incoming appointment.");
    distinctIdentities(next, c.payer, state.owners);
  } else if (proposal.kind === "replace-councillor") {
    if (t.to.toLowerCase() !== c.council?.toLowerCase())
      throw new Error("Council replacement target differs from the Safe.");
    const decoded = decodeFunctionData({
      abi: parseAbi([
        "function swapOwner(address prevOwner,address oldOwner,address newOwner)",
      ]),
      data: t.data as Hex,
    });
    const next = decoded.args[2];
    if (
      next === zeroAddress ||
      [state.publisher, c.payer].some(
        (a) => a.toLowerCase() === next.toLowerCase(),
      )
    )
      throw new Error("Invalid new council delegate.");
  } else throw new Error("Unsupported proposal kind.");
  const sdk = await councilSdk(c);
  if ((await sdk.getNonce()) !== t.nonce)
    throw new Error("Proposal nonce is stale. Prepare a new proposal.");
  const tx = new EthSafeTransaction(t);
  if (
    (await sdk.getTransactionHash(tx)).toLowerCase() !==
    proposal.safeTxHash.toLowerCase()
  )
    throw new Error("Proposal hash does not match its transaction.");
  const seen = new Set<string>();
  for (const signature of proposal.signatures) {
    const signer = getAddress(signature.signer);
    if (
      seen.has(signer) ||
      !state.owners.some((a) => a.toLowerCase() === signer.toLowerCase())
    )
      throw new Error("Duplicate or non-council signature.");
    if (!/^0x[0-9a-f]{130}$/i.test(signature.data))
      throw new Error("Invalid signature encoding.");
    seen.add(signer);
    tx.addSignature(new EthSafeSignature(signer, signature.data));
  }
  return { sdk, tx, state };
}
export async function approveProposal(proposal: Proposal, keyFile: string) {
  const { tx, state } = await validateProposal(proposal);
  const signer = privateKeyToAccount(await readKey(keyFile)).address;
  if (!state.owners.some((a) => a.toLowerCase() === signer.toLowerCase()))
    throw new Error("This signing key is not a current council delegate.");
  if (
    proposal.signatures.some(
      (s) => s.signer.toLowerCase() === signer.toLowerCase(),
    )
  )
    throw new Error("This delegate already approved the proposal.");
  const sdk = await councilSdk(await config(), keyFile);
  const signed = await sdk.signTransaction(tx);
  return {
    ...proposal,
    signatures: [...signed.signatures.values()].map((s) => ({
      signer: s.signer,
      data: s.data,
    })),
  };
}
export async function executeProposal(
  proposal: Proposal,
  keyFile: string,
  maxWei: bigint,
) {
  const { tx, state } = await validateProposal(proposal);
  if (tx.signatures.size < state.threshold)
    throw new Error(
      `Need ${state.threshold} distinct current council approvals.`,
    );
  const c = await config();
  const sdk = await councilSdk(c, keyFile);
  if (!(await sdk.isValidTransaction(tx)))
    throw new Error("The Safe rejected this transaction or its signatures.");
  const sender = await wallet(keyFile);
  const data = (await sdk.getEncodedTransaction(tx)) as Hex;
  const client = publicClient();
  const gas = await client.estimateGas({
    account: sender.account,
    to: c.council!,
    data,
  });
  const gasPrice = await client.getGasPrice();
  if (gas * gasPrice * 2n > maxWei)
    throw new Error("Transaction exceeds the configured gas budget.");
  const hash = await sender.sendTransaction({
    to: c.council!,
    data,
    gas: (gas * 13n) / 10n,
    gasPrice,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction reverted.");
  const after = await readRegistry(c.registry!, RPC);
  if (
    proposal.kind === "appoint" &&
    BigInt(after.revision) !== BigInt(state.revision) + 1n
  )
    throw new Error("Safe transaction mined but appointment was not applied.");
  const record = {
    kind: proposal.kind,
    observedAt: new Date().toISOString(),
    hash,
    blockNumber: receipt.blockNumber,
    proposal,
    before: state,
    after,
  };
  await evidence(proposal.kind, record);
  return record;
}
