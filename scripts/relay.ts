import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createIdentities } from "./identities";
import { config, json, save, saveConfig, checkedBee, RPC } from "./context";
import { deploymentQuote, deployRegistry } from "./deploy";
import {
  deployCouncil,
  prepareAppointment,
  prepareReplacement,
  approveProposal,
  executeProposal,
  reviewProposal,
} from "./council";
import { quoteStorage, executeStorageQuote, storageStatus } from "./storage";
import { publishCatalogue } from "./publish";
import { resolveCatalogue } from "../src/lib/network";
import { readRegistry } from "../src/lib/chain";
import { hex32Schema } from "../src/lib/model";
const { positionals, values: o } = parseArgs({
  allowPositionals: true,
  options: {
    key: { type: "string" },
    input: { type: "string" },
    out: { type: "string" },
    incoming: { type: "string" },
    checkpoint: { type: "string" },
    agreement: { type: "string" },
    days: { type: "string" },
    "max-wei": { type: "string", default: "1000000000000000" },
    "max-plur": { type: "string" },
    gateway: { type: "string" },
    rpc: { type: "string" },
    registry: { type: "string" },
    "old-owner": { type: "string" },
    "new-owner": { type: "string" },
    "batch-id": { type: "string" },
    staging: { type: "boolean" },
    topic: { type: "string" },
  },
});
function required(name: keyof typeof o): string {
  const value = o[name];
  if (typeof value !== "string" || !value)
    throw new Error(`Provide --${name}.`);
  return value;
}
async function input() {
  return JSON.parse(await readFile(required("input"), "utf8"));
}
async function main() {
  const command = positionals[0] || "help";
  let result: unknown;
  switch (command) {
    case "init":
      result = await createIdentities();
      break;
    case "deployment-quote":
      result = await deploymentQuote();
      break;
    case "deploy-council":
      result = await deployCouncil(
        required("key"),
        BigInt(required("max-wei")),
      );
      break;
    case "deploy-registry":
      result = await deployRegistry(
        required("checkpoint"),
        required("agreement"),
        required("key"),
        BigInt(required("max-wei")),
      );
      break;
    case "storage":
      result = await storageStatus();
      break;
    case "select-batch": {
      const c = { ...(await config()), batchId: required("batch-id") };
      await checkedBee(c);
      await saveConfig(c);
      result = { batchId: c.batchId };
      break;
    }
    case "storage-quote":
      result = await quoteStorage(
        positionals[1] === "buy" ? "buy" : "renew",
        Number(required("days")),
      );
      break;
    case "storage-execute":
      result = await executeStorageQuote(
        await input(),
        BigInt(required("max-plur")),
      );
      break;
    case "publish": {
      const c = await config();
      const topic = o.topic
        ? (hex32Schema.parse(o.topic) as `0x${string}`)
        : c.registry
          ? (await readRegistry(c.registry, RPC)).topic
          : c.topic;
      result = await publishCatalogue(await input(), required("key"), {
        staging: o.staging,
        ...(o.staging ? { topic } : {}),
      });
      break;
    }
    case "upload": {
      const bee = await checkedBee(await config());
      result = {
        reference: (
          await bee.data.upload(
            (await config()).batchId!,
            await readFile(required("input")),
            { pin: true },
          )
        ).reference.toHex(),
      };
      break;
    }
    case "propose": {
      const c = await config();
      const topic = o.topic
        ? (hex32Schema.parse(o.topic) as `0x${string}`)
        : c.registry
          ? (await readRegistry(c.registry, RPC)).topic
          : c.topic;
      result = await prepareAppointment(
        required("incoming"),
        topic,
        required("checkpoint"),
        required("agreement"),
      );
      break;
    }
    case "replace-councillor":
      result = await prepareReplacement(
        required("old-owner"),
        required("new-owner"),
      );
      break;
    case "approve":
      result = await approveProposal(await input(), required("key"));
      break;
    case "review":
      result = await reviewProposal(await input());
      break;
    case "execute":
      result = await executeProposal(
        await input(),
        required("key"),
        BigInt(required("max-wei")),
      );
      break;
    case "read": {
      const registry = o.registry || (await config()).registry;
      if (!registry) throw new Error("Provide --registry.");
      result = await resolveCatalogue(registry, o.gateway, o.rpc);
      break;
    }
    case "registry": {
      const registry = o.registry || (await config()).registry;
      if (!registry) throw new Error("Provide --registry.");
      result = await readRegistry(registry, o.rpc);
      break;
    }
    default:
      result = {
        commands: [
          "init",
          "deployment-quote",
          "deploy-council --key FILE",
          "storage-quote buy|renew --days N --out FILE",
          "storage-execute --input FILE --max-plur N",
          "publish --input FILE --key FILE [--staging] [--topic HEX32]",
          "upload --input FILE",
          "deploy-registry --checkpoint REF --agreement REF --key FILE",
          "propose --incoming ADDRESS --checkpoint REF --agreement REF --out FILE [--topic HEX32]",
          "review --input FILE",
          "approve --input FILE --key FILE --out FILE",
          "execute --input FILE --key FILE",
          "replace-councillor --old-owner ADDRESS --new-owner ADDRESS",
          "read --registry ADDRESS [--gateway URL] [--rpc URL]",
        ],
        note: "Keys are read from local files; pass addresses and proposal files between operators. No hosted transaction service is needed.",
      };
  }
  if (o.out) await save(o.out, result);
  console.log(json(result));
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Operation failed");
  process.exitCode = 1;
});
