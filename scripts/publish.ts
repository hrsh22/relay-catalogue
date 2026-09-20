import { BeeResponseError, FeedIndex } from "@ethersphere/bee-js";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { randomUUID } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  addressSchema,
  catalogueSchema,
  distinctIdentities,
  hex32Schema,
  referenceSchema,
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
  type Config,
} from "./context";

const pendingDirectory = path.join(RUNTIME, "pending-publications");
const journalFields = {
  publisher: addressSchema,
  reference: referenceSchema,
  feedIndex: z.string().regex(/^[0-9a-f]{16}$/),
  catalogue: catalogueSchema,
  createdAt: z.iso.datetime(),
};
const journalSchema = z
  .object({
    ...journalFields,
    topic: hex32Schema,
    status: z.enum(["pending", "verified"]),
    verifiedAt: z.iso.datetime().optional(),
    batchId: referenceSchema.optional(),
    staging: z.boolean().optional(),
  })
  .strict();
const legacyJournalSchema = z.object(journalFields).strict();
type PublicationJournal = z.infer<typeof journalSchema>;
export type PendingPublicationSummary = {
  id: string;
  publisher: string;
  topic: string;
  reference: string;
  feedIndex: string;
  createdAt: string;
};

async function readPublicationJournal(input: string, c: Config) {
  const file = path.resolve(pendingDirectory, input);
  const id = path.basename(file);
  if (
    path.dirname(file) !== pendingDirectory ||
    !/^0x[0-9a-fA-F]{40}-(?:[0-9a-fA-F]{64}-)?[0-9a-f]{16}\.json$/.test(id)
  )
    throw new Error(
      "Choose a saved publication journal from the pending-publications directory.",
    );
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 2_500_000)
      throw new Error("Invalid journal file.");
    const text = await readFile(file, "utf8");
    if (Buffer.byteLength(text) > 2_500_000)
      throw new Error("Journal is too large.");
    const input: unknown = JSON.parse(text);
    const current = journalSchema.safeParse(input);
    const journal: PublicationJournal = current.success
      ? current.data
      : {
          ...legacyJournalSchema.parse(input),
          topic: hex32Schema.parse(c.topic),
          status: "pending",
        };
    const legacyName = `${journal.publisher}-${journal.feedIndex}.json`;
    const expectedName = `${journal.publisher}-${journal.topic.slice(2)}-${journal.feedIndex}.json`;
    const legacy =
      id.toLowerCase() === legacyName.toLowerCase() &&
      journal.topic.toLowerCase() === c.topic.toLowerCase();
    if (
      (!legacy && id.toLowerCase() !== expectedName.toLowerCase()) ||
      journal.publisher.toLowerCase() !==
        journal.catalogue.publisher.toLowerCase() ||
      /^0x0+$/.test(journal.topic) ||
      Buffer.byteLength(json(journal.catalogue)) > 2_000_000 ||
      (journal.status === "verified" && !journal.verifiedAt)
    )
      throw new Error("Journal identity or payload differs.");
    return { file, id, journal, legacy };
  } catch (error) {
    throw new Error(
      `Saved publication journal ${id} is missing, malformed or inconsistent. It has not been changed.`,
      { cause: error },
    );
  }
}

async function recordVerifiedPublication(
  file: string,
  journal: unknown,
  record: unknown,
  evidenceKind: string,
): Promise<string[]> {
  const warnings: string[] = [];
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, json(journal), { flag: "wx", mode: 0o600 });
    await rename(temporary, file);
  } catch {
    warnings.push(
      "Publication is confirmed, but its journal could not be marked verified. The previous reservation is retained; resume it to reconcile the same update.",
    );
  } finally {
    await unlink(temporary).catch(() => {});
  }
  try {
    await evidence(evidenceKind, record);
  } catch {
    warnings.push(
      "Publication is confirmed, but its local evidence receipt could not be saved. Keep the returned reference and feed index.",
    );
  }
  return warnings;
}

export async function listPendingPublications(): Promise<
  PendingPublicationSummary[]
> {
  const c = await config();
  let files: string[];
  try {
    files = await readdir(pendingDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const summaries: PendingPublicationSummary[] = [];
  for (const file of files.filter((name) => name.endsWith(".json")).sort()) {
    const { id, journal } = await readPublicationJournal(file, c);
    if (
      journal.status === "verified" ||
      journal.catalogue.catalogueId.toLowerCase() !==
        c.catalogueId.toLowerCase()
    )
      continue;
    summaries.push({
      id,
      publisher: journal.publisher,
      topic: journal.topic,
      reference: journal.reference,
      feedIndex: journal.feedIndex,
      createdAt: journal.createdAt,
    });
  }
  return summaries;
}

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
    batchId: c.batchId,
    staging: Boolean(options.staging),
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
  const recordingWarnings = await recordVerifiedPublication(
    pendingFile,
    { ...pending, status: "verified", verifiedAt: record.observedAt },
    record,
    "publication",
  );
  return { ...record, recordingWarnings };
}

export async function resumePublication(
  pendingFile: string,
  keyFile: string,
  options: { staging?: boolean } = {},
) {
  const c = await config();
  const { file, journal } = await readPublicationJournal(pendingFile, c);
  const key = await readKey(keyFile);
  const publisher = privateKeyToAccount(key).address;
  if (
    journal.publisher.toLowerCase() !== publisher.toLowerCase() ||
    journal.catalogue.catalogueId.toLowerCase() !== c.catalogueId.toLowerCase()
  )
    throw new Error(
      "Saved publication does not belong to this signing key and configured catalogue.",
    );
  const topic = journal.topic.toLowerCase() as Hex;
  const index = new FeedIndex(journal.feedIndex);
  const assertAuthority = async () => {
    const state = c.registry ? await readRegistry(c.registry, RPC) : null;
    if (
      state &&
      (state.catalogueId.toLowerCase() !== c.catalogueId.toLowerCase() ||
        state.council.toLowerCase() !== c.council?.toLowerCase())
    )
      throw new Error(
        "Configured catalogue or council differs from the registry. Recovery has not sent an update.",
      );
    distinctIdentities(
      publisher,
      c.payer,
      state?.owners || Object.values(c.councilOwners),
    );
    if (
      !options.staging &&
      (publisher.toLowerCase() !==
        (state?.publisher ?? c.initialPublisher).toLowerCase() ||
        topic !== (state?.topic ?? c.topic).toLowerCase())
    )
      throw new Error(
        "The saved publisher or topic is no longer appointed. Recovery has not sent an update.",
      );
  };
  await assertAuthority();
  // Reading a confirmed update does not require a currently usable postage batch.
  const bee = await checkedBee(c, false);
  const writer = bee.feed.makeWriter(topic.slice(2), key);
  const expectedBytes = json(journal.catalogue);
  if ((await bee.data.download(journal.reference)).toUtf8() !== expectedBytes)
    throw new Error(
      "Saved catalogue bytes do not match its Swarm reference. Recovery has not sent an update.",
    );
  const readExactIndex = async () => {
    try {
      const head = await writer.downloadReference({ index });
      if (
        head.feedIndex.toHex() !== journal.feedIndex ||
        head.reference.toHex() !== journal.reference
      )
        throw new Error(
          "A different publication occupies the saved index. Recovery will not overwrite it.",
        );
      return head;
    } catch (error) {
      if (error instanceof BeeResponseError && error.status === 404)
        return null;
      throw error;
    }
  };
  let head = await readExactIndex();
  let recovery: "already-published" | "resent" = "already-published";
  if (!head) {
    if (journal.status === "verified")
      throw new Error(
        "This index was previously verified but is unavailable now. Change or restore the read connection before retrying; recovery has not sent an update.",
      );
    let latest;
    try {
      latest = await writer.downloadReference();
    } catch (error) {
      if (!(error instanceof BeeResponseError && error.status === 404))
        throw error;
    }
    if (latest) {
      if (
        latest.feedIndexNext?.toHex() !== journal.feedIndex ||
        latest.reference.toHex() !== journal.catalogue.previous
      )
        throw new Error(
          "The feed moved beyond this saved draft or its previous reference differs. Recovery has not sent an update.",
        );
      const previous = catalogueSchema.parse(
        (await bee.data.download(latest.reference)).toJSON(),
      );
      if (
        previous.publisher.toLowerCase() !== publisher.toLowerCase() ||
        previous.catalogueId.toLowerCase() !== c.catalogueId.toLowerCase() ||
        previous.revision + 1 !== journal.catalogue.revision
      )
        throw new Error(
          "The saved catalogue is not the next edition of this feed. Recovery has not sent an update.",
        );
    } else if (
      index.toBigInt() !== 0n ||
      journal.catalogue.revision !== 0 ||
      journal.catalogue.previous !== null
    )
      throw new Error(
        "The previous feed edition is unavailable. Recovery has not sent an update.",
      );
    await checkedBee(c);
    await assertAuthority();
    // Repeat the exact-index read after preflight. Only a definite 404 permits resending
    // the original reference at the original index; no new payload is ever uploaded.
    head = await readExactIndex();
    if (!head) {
      recovery = "resent";
      let uploadError: unknown;
      try {
        await writer.uploadReference(c.batchId!, journal.reference, { index });
      } catch (error) {
        uploadError = error;
      }
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          head = await readExactIndex();
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.startsWith("A different publication")
          )
            throw error;
          if (attempt === 19)
            throw new Error(
              `The saved update was resent at index ${journal.feedIndex}, but readback is unavailable. Its journal is retained; resume this same saved publication instead of creating another update.`,
              { cause: error },
            );
        }
        if (head) break;
        if (attempt === 19)
          throw new Error(
            `The saved update was resent at index ${journal.feedIndex}, but it has not yet been observed. Its journal is retained; resume this same saved publication instead of creating another update.`,
            { cause: uploadError },
          );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  if (!head)
    throw new Error(
      "Saved publication remains unverified; its journal has been retained.",
    );
  const record = {
    kind: "live-swarm-publication",
    observedAt: new Date().toISOString(),
    publisher,
    catalogueId: c.catalogueId,
    topic,
    batchId: recovery === "resent" ? c.batchId : journal.batchId,
    reference: journal.reference,
    feedIndex: head.feedIndex.toBigInt().toString(),
    previous: journal.catalogue.previous,
    change: journal.catalogue.change,
    staging: Boolean(options.staging),
    retiredPublisherTest: false,
    recovery,
  };
  const recordingWarnings = await recordVerifiedPublication(
    file,
    { ...journal, status: "verified", verifiedAt: record.observedAt },
    record,
    "publication-recovered",
  );
  return { ...record, recordingWarnings };
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
