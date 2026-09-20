import { Duration, Size } from "@ethersphere/bee-js";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  checkedBee,
  config,
  evidence,
  RUNTIME,
  save,
  saveConfig,
} from "./context";

export type StorageQuote = {
  id: string;
  action: "buy" | "renew";
  batchId?: string;
  days: number;
  payer: string;
  bzz: string;
  plur: string;
  expiresAt: string;
};
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
  if (!Number.isFinite(days) || days <= 0 || days > 365)
    throw new Error(
      "Storage duration must be greater than zero and at most 365 days.",
    );
  const c = await config();
  const bee = await checkedBee(c, action === "renew");
  const cost =
    action === "renew"
      ? await bee.storage.getDurationExtensionCost(
          c.batchId!,
          Duration.fromDays(days),
        )
      : await bee.storage.getCost(
          Size.fromMegabytes(20),
          Duration.fromDays(days),
        );
  return {
    id: randomUUID(),
    action,
    ...(action === "renew" ? { batchId: c.batchId } : {}),
    days,
    payer: c.payer,
    bzz: cost.toDecimalString(),
    plur: cost.toPLURString(),
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  };
}
export async function executeStorageQuote(
  quote: StorageQuote,
  maxPlur: bigint,
) {
  if (Date.parse(quote.expiresAt) < Date.now())
    throw new Error("Storage quote expired. Request a fresh quote.");
  const c = await config();
  if (
    quote.payer.toLowerCase() !== c.payer.toLowerCase() ||
    (quote.action === "renew" && quote.batchId !== c.batchId)
  )
    throw new Error("Custodian or batch changed since the quote.");
  const current = await quoteStorage(quote.action, quote.days);
  if (
    BigInt(current.plur) > BigInt(quote.plur) ||
    BigInt(current.plur) > maxPlur
  )
    throw new Error("Storage price exceeds the reviewed quote or budget.");
  const before = await storageStatus();
  const bee = await checkedBee(c, quote.action === "renew");
  const result =
    quote.action === "renew"
      ? await bee.storage.extendDuration(
          c.batchId!,
          Duration.fromDays(quote.days),
        )
      : await bee.storage.buy(
          Size.fromMegabytes(20),
          Duration.fromDays(quote.days),
          {
            label: "Relay catalogue",
            immutableFlag: true,
            waitForUsable: true,
          },
        );
  const batchId = result.toHex();
  if (quote.action === "renew" && batchId !== c.batchId)
    throw new Error("Renewal returned a different batch identifier.");
  if (quote.action === "buy") await saveConfig({ ...c, batchId });
  let after = await storageStatus();
  const prior = before.batches.find((b) => b.id === batchId);
  for (
    let i = 0;
    quote.action === "renew" &&
    i < 40 &&
    BigInt(after.batches.find((b) => b.id === batchId)?.amount || "0") <=
      BigInt(prior?.amount || "0");
    i++
  ) {
    await new Promise((r) => setTimeout(r, 3000));
    after = await storageStatus();
  }
  if (
    quote.action === "renew" &&
    BigInt(after.batches.find((b) => b.id === batchId)?.amount || "0") <=
      BigInt(prior?.amount || "0")
  )
    throw new Error(
      "Renewal was sent but its increased batch balance has not yet been observed. Check the batch before sending again.",
    );
  const record = {
    kind: "live-postage-operation",
    observedAt: after.observedAt,
    quote,
    batchId,
    before,
    after,
    note: "The SDK returns a batch identifier, not a transaction hash. Lifetime is an estimate; amount increase verifies the top-up.",
  };
  await evidence(`storage-${quote.action}`, record);
  await save(path.join(RUNTIME, "storage.json"), after);
  return record;
}
