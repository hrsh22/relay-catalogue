import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Bee } from "@ethersphere/bee-js";
import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gnosis } from "viem/chains";
import { chainClient } from "../src/lib/chain";
import { addressSchema, referenceSchema } from "../src/lib/model";

export const ROOT = path.resolve(
  /* turbopackIgnore: true */ process.env.RELAY_ROOT || process.cwd(),
);
try {
  process.loadEnvFile(path.join(ROOT, ".env.local"));
} catch {}
export const RUNTIME = path.join(ROOT, ".runtime");
export const PRIVATE = path.join(RUNTIME, "private");
export const RPC =
  process.env.RELAY_RPC_URL || "https://gnosis-rpc.publicnode.com";
export const BEE_URL = process.env.RELAY_BEE_URL || "http://127.0.0.1:1633";
export type Config = {
  chainId: 100;
  registry?: Address;
  council?: Address;
  catalogueId: Hex;
  topic: Hex;
  payer: Address;
  batchId?: string;
  initialPublisher: Address;
  publishers: Record<string, Address>;
  councilOwners: Record<string, Address>;
  executor: Address;
  saltNonce: string;
};
export const json = (value: unknown) =>
  JSON.stringify(
    value,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n";
export async function save(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, json(value));
}
export async function config(): Promise<Config> {
  return JSON.parse(await readFile(path.join(RUNTIME, "config.json"), "utf8"));
}
export async function saveConfig(value: Config) {
  await save(path.join(RUNTIME, "config.json"), value);
}
export async function readKey(file: string): Promise<Hex> {
  const key = (
    await readFile(/* turbopackIgnore: true */ path.resolve(ROOT, file), "utf8")
  ).trim();
  if (!/^0x[a-f0-9]{64}$/i.test(key))
    throw new Error(
      "Expected an owner-only file containing one Ethereum-compatible private key.",
    );
  return key as Hex;
}
export async function privateFile(name: string, value: string) {
  await mkdir(PRIVATE, { recursive: true, mode: 0o700 });
  await chmod(PRIVATE, 0o700);
  const file = path.join(PRIVATE, name);
  await writeFile(file, value, { flag: "wx", mode: 0o600 });
  return file;
}
export function publicClient() {
  return chainClient(RPC);
}
export async function wallet(keyFile: string) {
  return createWalletClient({
    account: privateKeyToAccount(await readKey(keyFile)),
    chain: gnosis,
    transport: http(RPC),
  });
}
export function localBee() {
  const url = new URL(BEE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error(
      "The operator requires a loopback Bee API. Run these commands on the node's machine.",
    );
  return new Bee(BEE_URL, { timeout: 120000, endlesslyRetry: false });
}
export async function checkedBee(c: Config, needsBatch = true) {
  const bee = localBee();
  const balance = await bee.wallet.getBalance();
  const payer = addressSchema.parse(balance.walletAddress);
  if (payer.toLowerCase() !== c.payer.toLowerCase())
    throw new Error(
      "Connected Bee paying identity differs from the configured custodian.",
    );
  if (balance.chainID !== 100)
    throw new Error("Bee is not connected to Gnosis Chain.");
  if (needsBatch) {
    referenceSchema.parse(c.batchId);
    const batch = await bee.stamp.get(c.batchId!);
    if (!batch.usable || batch.duration.toSeconds() <= 0)
      throw new Error(
        "The configured batch is not usable. Renew or select an active batch.",
      );
  }
  return bee;
}
export async function evidence(kind: string, value: unknown) {
  const name = `${new Date().toISOString().replaceAll(":", "-")}-${kind}.json`;
  await save(path.join(ROOT, "evidence", name), value);
  return name;
}
