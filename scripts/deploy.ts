import { readFile } from "node:fs/promises";
import { encodeDeployData, type Address, type Hex } from "viem";
import path from "node:path";
import { registryAbi } from "../src/lib/registry-abi";
import { readRegistry } from "../src/lib/chain";
import {
  checkedBee,
  config,
  evidence,
  publicClient,
  ROOT,
  RPC,
  saveConfig,
  wallet,
} from "./context";
import { prepareCouncil } from "./council";

export async function deploymentQuote() {
  const c = await config();
  const sdk = await prepareCouncil(c);
  const tx = await sdk.createSafeDeploymentTransaction();
  const client = publicClient();
  const gas = await client.estimateGas({
    account: c.executor,
    to: tx.to as Address,
    data: tx.data as Hex,
    value: 0n,
  });
  const gasPrice = await client.getGasPrice();
  return {
    observedAt: new Date().toISOString(),
    executor: c.executor,
    council: await sdk.getAddress(),
    safeGas: gas,
    gasPrice,
    safeCostWei: gas * gasPrice,
    availableNodeWei: (
      await (await checkedBee(c, false)).wallet.getBalance()
    ).nativeTokenBalance.toWeiString(),
  };
}
export async function deployRegistry(
  checkpoint: string,
  agreement: string,
  keyFile: string,
  maxWei: bigint,
) {
  const c = await config();
  if (!c.council) throw new Error("Deploy the council first.");
  if (c.registry)
    throw new Error("A registry is already configured. It was left unchanged.");
  const artifact = JSON.parse(
    await readFile(path.join(ROOT, "contracts/artifact.json"), "utf8"),
  );
  const args = [
    c.council,
    c.catalogueId,
    c.initialPublisher,
    c.topic,
    `0x${checkpoint}`,
    `0x${agreement}`,
  ] as const;
  const client = publicClient();
  const sender = await wallet(keyFile);
  const data = encodeDeployData({
    abi: registryAbi,
    bytecode: artifact.bytecode,
    args,
  });
  const gas = await client.estimateGas({ account: sender.account, data });
  const gasPrice = await client.getGasPrice();
  if (gas * gasPrice * 2n > maxWei)
    throw new Error("Registry deployment exceeds the gas budget.");
  const hash = await sender.deployContract({
    abi: registryAbi,
    bytecode: artifact.bytecode,
    args,
    gas: (gas * 12n) / 10n,
    gasPrice,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress)
    throw new Error("Registry deployment failed.");
  await saveConfig({ ...c, registry: receipt.contractAddress });
  const state = await readRegistry(receipt.contractAddress, RPC);
  await evidence("registry-deployed", {
    observedAt: new Date().toISOString(),
    hash,
    state,
    compiler: artifact.compiler,
    stableIdentifier: `eip155:100:${receipt.contractAddress}`,
  });
  return state;
}
