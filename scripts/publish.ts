import { BeeResponseError, FeedIndex } from "@ethersphere/bee-js";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  catalogueSchema,
  distinctIdentities,
  hex32Schema,
  type Catalogue,
} from "../src/lib/model";
import { readRegistry } from "../src/lib/chain";
import {
  checkedBee,
  config,
  evidence,
  json,
  readKey,
  RPC,
  RUNTIME,
  save,
} from "./context";

export async function publishCatalogue(
  input: unknown,
  keyFile: string,
  options: { staging?: boolean; allowRetired?: boolean; topic?: Hex } = {},
) {
  const c = await config();
  const key = await readKey(keyFile);
  const publisher = privateKeyToAccount(key).address;
  const catalogue = catalogueSchema.parse(input);
  if (
    catalogue.publisher.toLowerCase() !== publisher.toLowerCase() ||
    catalogue.catalogueId.toLowerCase() !== c.catalogueId.toLowerCase()
  )
    throw new Error(
      "Catalogue identity does not match this signing key or catalogue configuration.",
    );
  const state = c.registry ? await readRegistry(c.registry, RPC) : null;
  if (
    state &&
    (state.catalogueId.toLowerCase() !== c.catalogueId.toLowerCase() ||
      state.council.toLowerCase() !== c.council?.toLowerCase())
  )
    throw new Error(
      "Configured catalogue or council differs from the registry.",
    );
  const topic = hex32Schema
    .parse(
      options.staging ? (options.topic ?? c.topic) : (state?.topic ?? c.topic),
    )
    .toLowerCase() as Hex;
  if (/^0x0+$/.test(topic)) throw new Error("The feed needs a nonzero topic.");
  distinctIdentities(
    publisher,
    c.payer,
    state?.owners || Object.values(c.councilOwners),
  );
  if (
    state &&
    !options.staging &&
    !options.allowRetired &&
    state.publisher.toLowerCase() !== publisher.toLowerCase()
  )
    throw new Error(
      "This identity is not the appointed publisher. Stage an incoming feed before proposing a handoff.",
    );
  const bee = await checkedBee(c);
  const writer = bee.feed.makeWriter(topic.slice(2), key);
  let index = FeedIndex.fromBigInt(0n);
  let previous: string | null = null;
  let currentHead;
  try {
    currentHead = await writer.downloadReference();
  } catch (error) {
    if (!(error instanceof BeeResponseError && error.status === 404))
      throw error;
  }
  if (currentHead) {
    previous = currentHead.reference.toHex();
    if (!currentHead.feedIndexNext)
      throw new Error("Bee did not supply the next feed index.");
    index = currentHead.feedIndexNext;
    const previousCatalogue = catalogueSchema.parse(
      (await bee.data.download(previous)).toJSON(),
    );
    if (
      previousCatalogue.catalogueId.toLowerCase() !==
        catalogue.catalogueId.toLowerCase() ||
      previousCatalogue.publisher.toLowerCase() !== publisher.toLowerCase()
    )
      throw new Error(
        "The existing feed belongs to a different catalogue or publisher.",
      );
    if (catalogue.revision !== previousCatalogue.revision + 1)
      throw new Error(
        "Catalogue revision must increment by one within the publisher's feed.",
      );
  } else if (catalogue.revision !== 0)
    throw new Error("A new publisher feed starts at catalogue revision zero.");
  if (catalogue.previous !== previous)
    throw new Error(
      "The catalogue changed after this draft was opened. Refresh and reapply your correction.",
    );
  const bytes = json(catalogue);
  if (Buffer.byteLength(bytes) > 2_000_000)
    throw new Error("Catalogue exceeds the supported size limit.");
  const upload = await bee.data.upload(c.batchId!, bytes, { pin: true });
  const reference = upload.reference.toHex();
  // Confirm exact bytes before pointing the public feed at them.
  if ((await bee.data.download(reference)).toUtf8() !== bytes)
    throw new Error("Uploaded catalogue failed readback.");
  if (state && !options.staging && !options.allowRetired) {
    const latest = await readRegistry(c.registry!, RPC);
    if (
      latest.revision !== state.revision ||
      latest.publisher.toLowerCase() !== publisher.toLowerCase() ||
      latest.topic.toLowerCase() !== topic ||
      latest.catalogueId.toLowerCase() !== state.catalogueId.toLowerCase() ||
      latest.council.toLowerCase() !== state.council.toLowerCase()
    )
      throw new Error(
        "A succession happened during publication. Data is uploaded, but the retired feed was not advanced.",
      );
  }
  // Reserve this publisher/topic/index exclusively before signing an update. A retry or a
  // second process cannot overwrite a record whose network outcome is still uncertain.
  const pendingDirectory = path.join(RUNTIME, "pending-publications");
  const pendingFile = path.join(
    pendingDirectory,
    `${publisher.toLowerCase()}-${topic.slice(2)}-${index.toHex()}.json`,
  );
  if (topic === c.topic.toLowerCase()) {
    try {
      await access(
        path.join(pendingDirectory, `${publisher}-${index.toHex()}.json`),
      );
      throw new Error(
        "An earlier publication reserved this feed index. Reconcile its saved reference before writing again.",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const pending = {
    publisher,
    topic,
    reference,
    feedIndex: index.toHex(),
    catalogue,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  await mkdir(pendingDirectory, { recursive: true });
  try {
    await writeFile(pendingFile, json(pending), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(
        `An earlier publication reserved index ${index.toHex()} for this feed. Check its saved reference at that exact index before writing again.`,
      );
    throw error;
  }
  let uploadError: unknown;
  try {
    await writer.uploadReference(c.batchId!, reference, { index });
  } catch (error) {
    uploadError = error;
  }
  let head;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const observed = await writer.downloadReference({ index });
      if (observed.reference.toHex() !== reference)
        throw new Error(
          "Another update occupies the expected feed index. Reconcile this feed before writing again.",
        );
      head = observed;
      break;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Another update"))
        throw error;
      if (attempt === 19)
        throw new Error(
          `Publication could not yet be verified at index ${index.toHex()}. A reconciliation record is saved locally. Check that index before retrying. ${uploadError ? "The upload also reported a transport error." : ""}`,
        );
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  if (!head) throw new Error("Publication remains unverified.");
  const record = {
    kind: "live-swarm-publication",
    observedAt: new Date().toISOString(),
    publisher,
    catalogueId: c.catalogueId,
    topic,
    batchId: c.batchId,
    reference,
    feedIndex: head.feedIndex.toBigInt().toString(),
    previous,
    change: catalogue.change,
    staging: Boolean(options.staging),
    retiredPublisherTest: Boolean(options.allowRetired),
  };
  await save(pendingFile, {
    ...pending,
    status: "verified",
    verifiedAt: record.observedAt,
  });
  await evidence("publication", record);
  return record;
}
export function nextEdition(
  current: Catalogue,
  reference: string,
  change: string,
): Catalogue {
  return {
    ...structuredClone(current),
    previous: reference,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    change,
  };
}
