import solc from "solc";
import { readFile } from "node:fs/promises";
import { createPublicClient, http } from "viem";
import { gnosis } from "viem/chains";
const demo = JSON.parse(await readFile("public/demo.json", "utf8"));
const artifact = JSON.parse(await readFile("contracts/artifact.json", "utf8"));
const settings = structuredClone(artifact.settings);
settings.outputSelection = {
  "*": {
    "*": [
      "evm.deployedBytecode.object",
      "evm.deployedBytecode.immutableReferences",
    ],
  },
};
const compiled = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: {
        "RelayRegistry.sol": {
          content: await readFile("contracts/RelayRegistry.sol", "utf8"),
        },
      },
      settings,
    }),
  ),
);
if (compiled.errors?.some((e) => e.severity === "error"))
  throw new Error("Source compilation failed.");
const code =
  compiled.contracts["RelayRegistry.sol"].RelayRegistry.evm.deployedBytecode;
const client = createPublicClient({
  chain: gnosis,
  transport: http(
    process.env.RELAY_RPC_URL || "https://gnosis-rpc.publicnode.com",
  ),
});
const actual = await client.getBytecode({ address: demo.registry });
if (!actual)
  throw new Error("No deployed contract at the configured registry.");
let actualCode = actual.slice(2);
let compiledCode = code.object;
if (actualCode.length !== compiledCode.length)
  throw new Error("Runtime bytecode length differs from the compiled source.");
// Immutable constructor values replace compiler placeholders. Compare every other byte,
// then check both public immutable values independently against the deployment record.
for (const references of Object.values(code.immutableReferences)) {
  for (const { start, length } of references) {
    actualCode =
      actualCode.slice(0, start * 2) +
      "0".repeat(length * 2) +
      actualCode.slice((start + length) * 2);
    compiledCode =
      compiledCode.slice(0, start * 2) +
      "0".repeat(length * 2) +
      compiledCode.slice((start + length) * 2);
  }
}
if (actualCode !== compiledCode)
  throw new Error(
    "Runtime instructions or metadata differ from the tracked contract source.",
  );
const council = await client.readContract({
  address: demo.registry,
  abi: artifact.abi,
  functionName: "council",
});
const catalogueId = await client.readContract({
  address: demo.registry,
  abi: artifact.abi,
  functionName: "catalogueId",
});
if (
  council.toLowerCase() !== demo.council.toLowerCase() ||
  catalogueId !== demo.catalogueId
)
  throw new Error(
    "Immutable authority or catalogue identity differs from the deployment record.",
  );
console.log(
  JSON.stringify(
    {
      kind: "live-bytecode-verification",
      observedAt: new Date().toISOString(),
      chainId: 100,
      registry: demo.registry,
      council,
      catalogueId,
      compiler: solc.version(),
      runtimeBytes: actualCode.length / 2,
      instructionsAndMetadataMatch: true,
      constructorImmutablesMatch: true,
    },
    null,
    2,
  ),
);
