import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { keccak256, toHex, type Address } from "viem";
import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import {
  localBee,
  privateFile,
  readKey,
  PRIVATE,
  RUNTIME,
  saveConfig,
  type Config,
} from "./context";

export async function createIdentities() {
  try {
    await access(path.join(RUNTIME, "config.json"));
    throw new Error(
      "Identities already exist. Existing keys were left untouched.",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const identities: Record<string, Address> = {};
  for (const name of [
    "publisher-a",
    "publisher-b",
    "publisher-c",
    "council-1",
    "council-2",
    "council-3",
    "council-4",
    "executor",
  ]) {
    let key;
    try {
      key = await readKey(path.join(PRIVATE, `${name}.key`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      key = generatePrivateKey();
      await privateFile(`${name}.key`, key + "\n");
    }
    identities[name] = privateKeyToAccount(key).address;
  }
  const node = await localBee().wallet.getBalance();
  const catalogueId = toHex(randomBytes(32));
  const config: Config = {
    chainId: 100,
    catalogueId,
    topic: keccak256(toHex(`relay.catalogue.v1:${catalogueId}`)),
    payer: node.walletAddress as Address,
    initialPublisher: identities["publisher-a"],
    publishers: Object.fromEntries(
      ["a", "b", "c"].map((n) => [n, identities[`publisher-${n}`]]),
    ),
    councilOwners: Object.fromEntries(
      ["1", "2", "3", "4"].map((n) => [n, identities[`council-${n}`]]),
    ),
    executor: identities.executor,
    saltNonce: BigInt(`0x${randomBytes(8).toString("hex")}`).toString(),
  };
  await saveConfig(config);
  return config;
}
