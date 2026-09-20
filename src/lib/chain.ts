import {
  createPublicClient,
  fallback,
  http,
  parseAbi,
  type Address,
} from "viem";
import { gnosis } from "viem/chains";
import { registryAbi } from "./registry-abi";
import { addressSchema, type RegistryState } from "./model";

export const RPC_URLS = [
  "https://gnosis-rpc.publicnode.com",
  "https://rpc.gnosischain.com",
];
export const councilAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
  "function isOwner(address) view returns (bool)",
]);
export function chainClient(rpc?: string) {
  return createPublicClient({
    chain: gnosis,
    transport: rpc
      ? http(rpc, { timeout: 15000, retryCount: 1 })
      : fallback(
          RPC_URLS.map((url) => http(url, { timeout: 10000, retryCount: 0 })),
        ),
  });
}
export async function readRegistry(
  registryInput: string,
  rpc?: string,
): Promise<RegistryState> {
  const registry = addressSchema.parse(registryInput) as Address;
  const client = chainClient(rpc);
  if ((await client.getChainId()) !== 100)
    throw new Error("Relay requires Gnosis Chain (100).");
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const names = [
    "council",
    "catalogueId",
    "publisher",
    "topic",
    "checkpoint",
    "agreement",
    "revision",
  ] as const;
  const values = await Promise.all(
    names.map((functionName) =>
      client.readContract({
        address: registry,
        abi: registryAbi,
        functionName,
        blockNumber,
      }),
    ),
  );
  const council = values[0] as Address;
  const [owners, threshold] = await Promise.all([
    client.readContract({
      address: council,
      abi: councilAbi,
      functionName: "getOwners",
      blockNumber,
    }),
    client.readContract({
      address: council,
      abi: councilAbi,
      functionName: "getThreshold",
      blockNumber,
    }),
  ]);
  if (threshold < 2n)
    throw new Error(
      "Council threshold is below two. Resolve governance before trusting a new appointment.",
    );
  return {
    chainId: 100,
    registry,
    council,
    catalogueId: values[1] as `0x${string}`,
    publisher: values[2] as Address,
    topic: values[3] as `0x${string}`,
    checkpoint: (values[4] as string).slice(2),
    agreement: (values[5] as string).slice(2),
    revision: String(values[6]),
    blockNumber: String(blockNumber),
    owners: [...owners],
    threshold: Number(threshold),
  };
}
