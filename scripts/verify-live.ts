import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createPublicClient, http, type Hex } from "viem";
import { gnosis } from "viem/chains";
import { resolveCatalogue } from "../src/lib/network";
const { values } = parseArgs({
  options: {
    registry: { type: "string" },
    gateway: { type: "string" },
    rpc: { type: "string" },
  },
});
const demo = JSON.parse(
  await readFile(new URL("../public/demo.json", import.meta.url), "utf8"),
);
const result = await resolveCatalogue(
  values.registry || demo.registry,
  values.gateway,
  values.rpc,
);
assert(result.catalogue.records.length > 0);
const client = createPublicClient({
  chain: gnosis,
  transport: http(values.rpc || "https://gnosis-rpc.publicnode.com"),
});
for (const handoff of demo.handoffs) {
  const receipt = await client.getTransactionReceipt({
    hash: handoff.hash as Hex,
  });
  assert.equal(receipt.status, "success");
  assert.equal(receipt.to?.toLowerCase(), demo.council.toLowerCase());
}
console.log(
  JSON.stringify(
    {
      checkedAt: result.observedAt,
      registry: result.state.registry,
      publisher: result.state.publisher,
      successionRevision: result.state.revision,
      reference: result.reference,
      feedIndex: result.feedIndex,
      records: result.catalogue.records.length,
      councilThreshold: result.state.threshold,
      nodeOrPrivateConfigurationRequired: false,
      transactionReceiptsChecked: demo.handoffs.length,
    },
    null,
    2,
  ),
);
