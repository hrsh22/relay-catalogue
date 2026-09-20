import Safe, {
  EthSafeSignature,
  EthSafeTransaction,
} from "@safe-global/protocol-kit";
import type { SafeTransactionData } from "@safe-global/types-kit";
import {
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  parseAbi,
  recoverAddress,
  recoverMessageAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import { registryAbi } from "../src/lib/registry-abi";
import { readRegistry } from "../src/lib/chain";
import {
  addressSchema,
  distinctIdentities,
  referenceSchema,
  hex32Schema,
  type Catalogue,
  type RegistryState,
} from "../src/lib/model";
import { bytesAt, readFeed, DEFAULT_GATEWAY } from "../src/lib/network";
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
  // Supporting context travels with a proposal but is not part of the Safe signature.
  context?: {
    trigger: "retirement" | "unreachable" | "compromised";
    note: string;
  };
};
export type ProposalReview = {
  proposal: Proposal;
  state: RegistryState;
  nonce: number;
  approvals: string[];
  appointment?: {
    outgoing: string;
    incoming: string;
    topic: string;
    checkpoint: string;
    agreement: string;
    expectedRevision: string;
  };
  replacement?: { outgoing: string; incoming: string };
  incomingPublication?: {
    catalogue: Catalogue;
    reference: string;
    gateway: string;
    agreementText: string;
  };
};

const uintString = z
  .string()
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/);
const proposalSchema = z
  .object({
    format: z.literal("relay.proposal.v1"),
    chainId: z.literal(100),
    registry: addressSchema,
    council: addressSchema,
    kind: z.enum(["appoint", "replace-councillor"]),
    description: z.string().max(2000),
    createdAt: z.iso.datetime(),
    transaction: z
      .object({
        to: addressSchema,
        value: uintString,
        data: z
          .string()
          .max(330)
          .regex(/^0x(?:[0-9a-fA-F]{2})+$/),
        operation: z.literal(0),
        safeTxGas: uintString,
        baseGas: uintString,
        gasPrice: uintString,
        gasToken: addressSchema,
        refundReceiver: addressSchema,
        nonce: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      })
      .strict(),
    safeTxHash: hex32Schema,
    signatures: z
      .array(
        z
          .object({
            signer: addressSchema,
            data: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
          })
          .strict(),
      )
      .max(100),
    context: z
      .object({
        trigger: z.enum(["retirement", "unreachable", "compromised"]),
        note: z.string().max(2000),
      })
      .strict()
      .optional(),
  })
  .strict();
const swapOwnerAbi = parseAbi([
  "function swapOwner(address prevOwner,address oldOwner,address newOwner)",
]);
const safeEventsAbi = parseAbi([
  "event ExecutionSuccess(bytes32 indexed txHash,uint256 payment)",
  "event AddedOwner(address indexed owner)",
  "event RemovedOwner(address indexed owner)",
]);
const legacySafeEventsAbi = parseAbi([
  "event ExecutionSuccess(bytes32 txHash,uint256 payment)",
  "event AddedOwner(address owner)",
  "event RemovedOwner(address owner)",
]);

function assertConfiguredRegistry(c: Config, state: RegistryState) {
  if (
    state.catalogueId.toLowerCase() !== c.catalogueId.toLowerCase() ||
    state.council.toLowerCase() !== c.council?.toLowerCase()
  )
    throw new Error(
      "Configured catalogue or council differs from the registry.",
    );
  distinctIdentities(state.publisher, c.payer, state.owners);
}

async function verifyIncomingPublication(
  state: RegistryState,
  incoming: Address,
  topic: Hex,
  checkpoint: string,
  agreement: string,
) {
  const gateway = process.env.RELAY_READ_GATEWAY || DEFAULT_GATEWAY;
  const incomingHead = await readFeed(
    { ...state, publisher: incoming, topic },
    gateway,
  );
  if (incomingHead.reference !== checkpoint)
    throw new Error(
      "The incoming feed does not resolve to the proposed checkpoint. Stage and verify its catalogue first.",
    );
  const agreementBytes = await bytesAt(gateway, agreement, 128_000);
  const agreementText = new TextDecoder("utf-8", { fatal: true }).decode(
    agreementBytes,
  );
  if (
    !agreementText.trim() ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(agreementText)
  )
    throw new Error("The proposed agreement must be readable UTF-8 text.");
  return { ...incomingHead, agreementText };
}
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
  assertConfiguredRegistry(c, state);
  const next = getAddress(addressSchema.parse(incoming));
  distinctIdentities(next, c.payer, state.owners);
  if (next.toLowerCase() === state.publisher.toLowerCase())
    throw new Error("The incoming steward is already appointed.");
  referenceSchema.parse(checkpoint);
  referenceSchema.parse(agreement);
  hex32Schema.parse(topic);
  if (/^0x0+$/.test(topic))
    throw new Error("The incoming feed needs a nonzero topic.");
  await verifyIncomingPublication(state, next, topic, checkpoint, agreement);
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
  assertConfiguredRegistry(c, state);
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
export async function validateProposal(input: unknown) {
  const proposal = proposalSchema.parse(input) as Proposal;
  proposal.registry = getAddress(proposal.registry);
  proposal.council = getAddress(proposal.council);
  proposal.safeTxHash = proposal.safeTxHash.toLowerCase() as Hex;
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
    t.gasPrice !== "0" ||
    t.safeTxGas !== "0" ||
    t.baseGas !== "0"
  )
    throw new Error(
      "Only zero-value calls without gas refunds or internal gas overrides are allowed.",
    );
  const state = await readRegistry(c.registry!, RPC);
  assertConfiguredRegistry(c, state);
  let appointment: ProposalReview["appointment"];
  let replacement: ProposalReview["replacement"];
  let incomingPublication: ProposalReview["incomingPublication"];
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
    if (
      encodeFunctionData({
        abi: registryAbi,
        functionName: "appoint",
        args: decoded.args,
      }).toLowerCase() !== t.data.toLowerCase()
    )
      throw new Error("Appointment calldata is not canonical.");
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
    // Imported proposals must pass the same readiness checks as locally prepared ones.
    incomingPublication = await verifyIncomingPublication(
      state,
      next,
      topic,
      checkpoint.slice(2),
      agreement.slice(2),
    );
    appointment = {
      outgoing: state.publisher,
      incoming: next,
      topic,
      checkpoint: checkpoint.slice(2),
      agreement: agreement.slice(2),
      expectedRevision: revision.toString(),
    };
  } else if (proposal.kind === "replace-councillor") {
    if (t.to.toLowerCase() !== c.council?.toLowerCase())
      throw new Error("Council replacement target differs from the Safe.");
    const decoded = decodeFunctionData({
      abi: swapOwnerAbi,
      data: t.data as Hex,
    });
    if (
      encodeFunctionData({
        abi: swapOwnerAbi,
        functionName: "swapOwner",
        args: decoded.args,
      }).toLowerCase() !== t.data.toLowerCase()
    )
      throw new Error("Council replacement calldata is not canonical.");
    const [previous, outgoing, next] = decoded.args;
    const outgoingIndex = state.owners.findIndex(
      (owner) => owner.toLowerCase() === outgoing.toLowerCase(),
    );
    const expectedPrevious =
      outgoingIndex === 0
        ? "0x0000000000000000000000000000000000000001"
        : state.owners[outgoingIndex - 1];
    if (
      next === zeroAddress ||
      next.toLowerCase() === "0x0000000000000000000000000000000000000001" ||
      next.toLowerCase() === state.council.toLowerCase() ||
      outgoingIndex < 0 ||
      previous.toLowerCase() !== expectedPrevious?.toLowerCase() ||
      state.owners.some(
        (owner) => owner.toLowerCase() === next.toLowerCase(),
      ) ||
      [state.publisher, c.payer].some(
        (a) => a.toLowerCase() === next.toLowerCase(),
      )
    )
      throw new Error("Invalid council replacement or stale owner ordering.");
    replacement = { outgoing, incoming: next };
  } else throw new Error("Unsupported proposal kind.");
  const sdk = await councilSdk(c);
  const nonce = await sdk.getNonce();
  if (nonce !== t.nonce)
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
    const v = Number.parseInt(signature.data.slice(-2), 16);
    let recovered: Address;
    // Safe uses v+4 for personal-message signatures; 27/28 signs the EIP-712 hash directly.
    // Contract and prevalidated signatures need different authorization and are not accepted here.
    if (v === 27 || v === 28) {
      recovered = await recoverAddress({
        hash: proposal.safeTxHash,
        signature: signature.data as Hex,
      });
    } else if (v === 31 || v === 32) {
      recovered = await recoverMessageAddress({
        message: { raw: proposal.safeTxHash },
        signature:
          `${signature.data.slice(0, -2)}${(v - 4).toString(16)}` as Hex,
      });
    } else
      throw new Error("Only recoverable council EOA signatures are supported.");
    if (recovered.toLowerCase() !== signer.toLowerCase())
      throw new Error(
        "A council signature does not authorize this proposal hash.",
      );
    signature.signer = signer;
    seen.add(signer);
    tx.addSignature(new EthSafeSignature(signer, signature.data));
  }
  return {
    sdk,
    tx,
    state,
    proposal,
    nonce,
    approvals: [...seen],
    appointment,
    replacement,
    incomingPublication,
    config: c,
  };
}
export async function reviewProposal(input: unknown): Promise<ProposalReview> {
  const {
    proposal,
    state,
    nonce,
    approvals,
    appointment,
    replacement,
    incomingPublication,
  } = await validateProposal(input);
  return {
    proposal,
    state,
    nonce,
    approvals,
    ...(appointment ? { appointment } : {}),
    ...(replacement ? { replacement } : {}),
    ...(incomingPublication ? { incomingPublication } : {}),
  };
}
export async function approveProposal(input: unknown, keyFile: string) {
  const { tx, state, proposal, config: c } = await validateProposal(input);
  const signer = privateKeyToAccount(await readKey(keyFile)).address;
  if (!state.owners.some((a) => a.toLowerCase() === signer.toLowerCase()))
    throw new Error("This signing key is not a current council delegate.");
  if (
    proposal.signatures.some(
      (s) => s.signer.toLowerCase() === signer.toLowerCase(),
    )
  )
    throw new Error("This delegate already approved the proposal.");
  const sdk = await councilSdk(c, keyFile);
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
  input: unknown,
  keyFile: string,
  maxWei: bigint,
) {
  const {
    tx,
    state,
    proposal,
    appointment,
    replacement,
    config: c,
  } = await validateProposal(input);
  if (tx.signatures.size < state.threshold)
    throw new Error(
      `Need ${state.threshold} distinct current council approvals.`,
    );
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
  const submitted = {
    kind: proposal.kind,
    hash,
    proposal,
    before: state,
    submittedAt: new Date().toISOString(),
  };
  try {
    await evidence("council-submitted", { ...submitted, status: "submitted" });
  } catch (error) {
    throw new Error(
      `Council transaction ${hash} was submitted, but its local record could not be saved. Check that transaction before executing again.`,
      { cause: error },
    );
  }
  const receipt = await client
    .waitForTransactionReceipt({ hash })
    .catch((error) => {
      throw new Error(
        `Council transaction ${hash} was submitted but its receipt is not yet confirmed. Check that transaction before executing again.`,
        { cause: error },
      );
    });
  if (receipt.status !== "success") throw new Error("Transaction reverted.");
  const safeEvents = receipt.logs.flatMap((log) => {
    if (log.address.toLowerCase() !== c.council!.toLowerCase()) return [];
    // Safe 1.4.1 indexes these event identities; older deployed Safes did not.
    for (const abi of [safeEventsAbi, legacySafeEventsAbi]) {
      try {
        return [decodeEventLog({ abi, data: log.data, topics: log.topics })];
      } catch {}
    }
    return [];
  });
  if (
    !safeEvents.some(
      (event) =>
        event.eventName === "ExecutionSuccess" &&
        event.args.txHash.toLowerCase() === proposal.safeTxHash.toLowerCase(),
    )
  )
    throw new Error(
      `Transaction ${hash} mined without confirming this Safe proposal. Inspect its receipt before retrying.`,
    );
  if (appointment) {
    const expected = appointment;
    const applied = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== c.registry!.toLowerCase()) return false;
      try {
        const event = decodeEventLog({
          abi: registryAbi,
          data: log.data,
          topics: log.topics,
        });
        return (
          event.eventName === "StewardAppointed" &&
          event.args.revision === BigInt(expected.expectedRevision) + 1n &&
          event.args.previousPublisher.toLowerCase() ===
            expected.outgoing.toLowerCase() &&
          event.args.publisher.toLowerCase() ===
            expected.incoming.toLowerCase() &&
          event.args.topic.toLowerCase() === expected.topic.toLowerCase() &&
          event.args.checkpoint.slice(2) === expected.checkpoint &&
          event.args.agreement.slice(2) === expected.agreement
        );
      } catch {
        return false;
      }
    });
    if (!applied)
      throw new Error(
        `Transaction ${hash} did not confirm the approved appointment. Inspect its receipt before retrying.`,
      );
  }
  if (
    replacement &&
    (!safeEvents.some(
      (event) =>
        event.eventName === "RemovedOwner" &&
        event.args.owner.toLowerCase() === replacement.outgoing.toLowerCase(),
    ) ||
      !safeEvents.some(
        (event) =>
          event.eventName === "AddedOwner" &&
          event.args.owner.toLowerCase() === replacement.incoming.toLowerCase(),
      ))
  )
    throw new Error(
      `Transaction ${hash} did not confirm the approved council replacement. Inspect its receipt before retrying.`,
    );
  // Receipt events prove this transaction's outcome even if another valid succession follows it.
  await evidence("council-confirmed", {
    ...submitted,
    status: "confirmed",
    blockNumber: receipt.blockNumber,
    observedAt: new Date().toISOString(),
  });
  const after = await readRegistry(c.registry!, RPC).catch((error) => {
    throw new Error(
      `Council transaction ${hash} is confirmed, but the current registry could not be refreshed. Refresh the catalogue; do not execute this proposal again.`,
      { cause: error },
    );
  });
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
