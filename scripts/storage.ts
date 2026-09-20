import { BZZ, Duration, Size, Utils } from "@ethersphere/bee-js";
import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { addressSchema, referenceSchema } from "../src/lib/model";
import { checkedBee, config, evidence, json, RUNTIME, save } from "./context";

export type StorageQuote = {
  id: string;
  action: "buy" | "renew";
  batchId?: string;
  days: number;
  payer: string;
  bzz: string;
  plur: string;
  amount: string;
  depth: number;
  batchAmount?: string;
  expiresAt: string;
};
const unsignedInteger = z
  .string()
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/);
const quoteSchema = z
  .object({
    id: z.uuid(),
    action: z.enum(["buy", "renew"]),
    batchId: referenceSchema.optional(),
    days: z.number().positive().max(365),
    payer: addressSchema,
    bzz: z
      .string()
      .max(100)
      .regex(/^[0-9]+(?:\.[0-9]+)?$/),
    plur: unsignedInteger,
    amount: unsignedInteger,
    depth: z.number().int().min(17).max(255),
    batchAmount: unsignedInteger.optional(),
    expiresAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((quote, ctx) => {
    if (
      (quote.action === "renew" &&
        (!quote.batchId || quote.batchAmount === undefined)) ||
      (quote.action === "buy" &&
        (quote.batchId !== undefined || quote.batchAmount !== undefined))
    )
      ctx.addIssue({
        code: "custom",
        message: "The storage quote does not match its operation.",
      });
  });

async function replaceStoredRecord(file: string, value: unknown) {
  // Preserve the last known state if a later journal write is interrupted.
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, json(value), { flag: "wx", mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}
export async function storageStatus() {
  const c = await config();
  const bee = await checkedBee(c, false);
  const [node, balance, batches] = await Promise.all([
    bee.status.getNodeInfo(),
    bee.wallet.getBalance(),
    bee.stamp.getAll(),
  ]);
  return {
    observedAt: new Date().toISOString(),
    mode: node.beeMode,
    payer: c.payer,
    bzz: balance.bzzBalance.toDecimalString(),
    xdai: balance.nativeTokenBalance.toDecimalString(),
    selectedBatch: c.batchId,
    batches: batches.map((b) => ({
      id: b.batchID.toHex(),
      label: b.label,
      usable: b.usable,
      remainingSeconds: b.duration.toSeconds(),
      capacityBytes: b.size.toBytes(),
      usage: b.usage,
      amount: b.amount,
      depth: b.depth,
      immutable: b.immutableFlag,
    })),
  };
}
export async function quoteStorage(
  action: "buy" | "renew",
  days: number,
): Promise<StorageQuote> {
  z.enum(["buy", "renew"]).parse(action);
  if (!Number.isFinite(days) || days <= 0 || days > 365)
    throw new Error(
      "Storage duration must be greater than zero and at most 365 days.",
    );
  if (action === "buy" && days < 1)
    throw new Error("A new batch requires at least one day of storage.");
  const c = await config();
  const bee = await checkedBee(c, action === "renew");
  const batch =
    action === "renew" ? await bee.stamp.get(c.batchId!) : undefined;
  const depth = batch?.depth ?? Utils.getDepthForSize(Size.fromMegabytes(20));
  const chainState = await bee.status.getChainState();
  // Gnosis uses five-second blocks. Capture the exact per-chunk amount, not only a duration.
  const amount = Utils.getAmountForDuration(
    Duration.fromDays(days),
    chainState.currentPrice,
    5,
  );
  const cost = Utils.getStampCost(depth, amount);
  return {
    id: randomUUID(),
    action,
    ...(action === "renew" ? { batchId: c.batchId } : {}),
    days,
    payer: c.payer,
    bzz: cost.toDecimalString(),
    plur: cost.toPLURString(),
    amount: amount.toString(),
    depth,
    ...(batch ? { batchAmount: String(batch.amount) } : {}),
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  };
}
export async function executeStorageQuote(input: unknown, maxPlur: bigint) {
  const quote = quoteSchema.parse(input);
  const operationFile = path.join(
    RUNTIME,
    "storage-operations",
    `${quote.id}.json`,
  );
  try {
    await access(operationFile);
    throw new Error(
      "This storage quote has already been reserved or submitted. Inspect its saved operation and batch before spending again.",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (Date.parse(quote.expiresAt) <= Date.now())
    throw new Error("Storage quote expired. Request a fresh quote.");
  const amount = BigInt(quote.amount);
  const exactPlur = amount * 2n ** BigInt(quote.depth);
  if (
    amount <= 0n ||
    exactPlur >= 2n ** 256n ||
    exactPlur !== BigInt(quote.plur) ||
    BZZ.fromDecimalString(quote.bzz).toPLURBigInt() !== exactPlur ||
    exactPlur > maxPlur
  )
    throw new Error(
      "The exact storage amount exceeds the approved budget or differs from its displayed quote.",
    );
  const c = await config();
  if (
    quote.payer.toLowerCase() !== c.payer.toLowerCase() ||
    (quote.action === "renew" && quote.batchId !== c.batchId)
  )
    throw new Error("Custodian or batch changed since the quote.");
  const before = await storageStatus();
  const bee = await checkedBee(c, quote.action === "renew");
  const chainState = await bee.status.getChainState();
  if (
    Utils.getAmountForDuration(
      Duration.fromDays(quote.days),
      chainState.currentPrice,
      5,
    ) > amount
  )
    throw new Error(
      "Storage price increased. Review a fresh quote before spending.",
    );
  if (quote.action === "renew") {
    const currentBatch = await bee.stamp.get(c.batchId!);
    if (
      currentBatch.depth !== quote.depth ||
      BigInt(currentBatch.amount) !== BigInt(quote.batchAmount!)
    )
      throw new Error(
        "Batch depth or balance changed since the quote. Review a fresh quote before spending.",
      );
  } else if (
    quote.days < 1 ||
    quote.depth !== Utils.getDepthForSize(Size.fromMegabytes(20))
  )
    throw new Error(
      "The new-batch quote differs from the reviewed storage capacity or minimum duration.",
    );
  if (Date.parse(quote.expiresAt) <= Date.now())
    throw new Error(
      "Storage quote expired during preflight. Request a fresh quote.",
    );
  // Keep an exclusive record before dispatch. Reusing a quote after a lost response
  // must not repeat a financial operation; reconciliation uses this saved record.
  const operation = {
    quote,
    before,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(operationFile), { recursive: true });
  try {
    await writeFile(operationFile, json(operation), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(
        "This storage quote has already been reserved or submitted. Inspect its saved operation and batch before spending again.",
      );
    throw error;
  }
  // Duration wrappers fetch another price internally. Fixed stamp amounts prevent
  // price recalculation from changing the requested debit at the reviewed depth.
  // This process does not lock independently submitted dilution of the same batch.
  let result;
  try {
    result =
      quote.action === "renew"
        ? await bee.stamp.topUp(c.batchId!, amount)
        : await bee.stamp.create(amount, quote.depth, {
            label: "Relay catalogue",
            immutableFlag: true,
            waitForUsable: false,
          });
  } catch (error) {
    throw new Error(
      `Submission is unconfirmed for storage operation ${quote.id}, ${quote.batchId ? `batch ${quote.batchId}` : "with no returned batch ID"}. It may have reached Bee. Inspect its saved operation and batch transactions before sending another payment.`,
      { cause: error },
    );
  }
  const recordingWarnings: string[] = [];
  const recordBestEffort = async (
    label: string,
    work: () => Promise<unknown>,
  ) => {
    try {
      await work();
    } catch {
      recordingWarnings.push(label);
    }
  };
  let batchId = quote.batchId;
  let after: Awaited<ReturnType<typeof storageStatus>>;
  try {
    batchId = result.toHex();
    await recordBestEffort(
      "The submitted operation journal could not be updated. Keep this result and batch identifier; do not repeat the payment.",
      () =>
        replaceStoredRecord(operationFile, {
          ...operation,
          status: "sent",
          batchId,
          sentAt: new Date().toISOString(),
        }),
    );
    if (quote.action === "renew" && batchId !== c.batchId)
      throw new Error("Renewal returned a different batch identifier.");
    after = await storageStatus();
    const observed = () => {
      const batch = after.batches.find((b) => b.id === batchId);
      return quote.action === "renew"
        ? batch &&
            batch.depth === quote.depth &&
            BigInt(batch.amount) >= BigInt(quote.batchAmount!) + amount
        : batch?.usable &&
            batch.depth === quote.depth &&
            BigInt(batch.amount) >= amount;
    };
    for (let i = 0; i < 40 && !observed(); i++) {
      await new Promise((r) => setTimeout(r, 3000));
      after = await storageStatus();
    }
    if (!observed())
      throw new Error(
        "The expected batch amount or usability was not observed.",
      );
  } catch (error) {
    throw new Error(
      `Storage operation ${quote.id} was submitted${batchId ? ` for batch ${batchId}` : " but its batch ID could not be read"}; verification is incomplete. Inspect the saved operation and batch before sending another payment.${recordingWarnings.length ? " The submitted journal update also failed." : ""}`,
      { cause: error },
    );
  }
  // The requested amount is now observed. Recording failures cannot turn that
  // known outcome into a failed-payment response or trigger another dispatch.
  const record = {
    kind: "live-postage-operation",
    outcome: "verified" as const,
    observedAt: after.observedAt,
    quote,
    batchId: batchId!,
    before,
    after,
    note: "The SDK returns a batch identifier, not a transaction hash. Lifetime is an estimate; amount increase verifies the top-up.",
    recordingWarnings,
  };
  if (quote.action === "buy")
    await recordBestEffort(
      `Storage was verified for batch ${record.batchId}, but selecting it in the operator configuration failed. Retain this identifier and select it before publishing; do not buy another batch.`,
      () =>
        replaceStoredRecord(path.join(RUNTIME, "config.json"), {
          ...c,
          batchId: record.batchId,
        }),
    );
  await recordBestEffort(
    "The payment was verified, but its evidence receipt could not be saved. Keep this returned result; do not repeat the payment.",
    () => evidence(`storage-${quote.action}`, record),
  );
  await recordBestEffort(
    "The payment was verified, but the cached storage observation could not be saved. Refresh the batch observation; do not repeat the payment.",
    () => save(path.join(RUNTIME, "storage.json"), after),
  );
  await recordBestEffort(
    "The payment was verified, but its final operation journal could not be saved. Keep this returned result; the earlier reservation remains in place.",
    () =>
      replaceStoredRecord(operationFile, {
        ...operation,
        status: "verified",
        batchId: record.batchId,
        record,
      }),
  );
  return record;
}
