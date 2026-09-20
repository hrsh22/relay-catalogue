import { z } from "zod";
import {
  catalogueSchema,
  hex32Schema,
  recordSchema,
  referenceSchema,
  type CatalogueRecord,
  type ResolvedCatalogue,
} from "./model";

export const MAX_CORRECTION_BYTES = 32 * 1024;
export const correctionRequestSchema = z
  .object({
    format: z.literal("relay.correction.v1"),
    catalogueId: hex32Schema,
    sourceReference: referenceSchema.nullable(),
    record: recordSchema,
    reason: z.string().trim().min(1).max(1000),
    preparedAt: z.iso.datetime(),
    note: z.string().max(1000),
  })
  .strict();
export type CorrectionRequest = z.infer<typeof correctionRequestSchema>;

export function parseCorrectionRequest(text: string): CorrectionRequest {
  if (new TextEncoder().encode(text).byteLength > MAX_CORRECTION_BYTES)
    throw new Error("Choose a correction request of 32 KiB or smaller.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(
      "This file is not valid JSON. Ask for the original downloaded correction request.",
    );
  }
  const parsed = correctionRequestSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      "This file is not a complete Relay correction request. Download a new request from the current catalogue; all record fields, the source edition and a reason are required.",
    );
  return parsed.data;
}

const reviewedFields = [
  ["collection", "Library"],
  ["title", "Record title"],
  ["shelfmark", "Shelf mark"],
  ["material", "Material"],
  ["folios", "Folio count"],
  ["condition", "Condition"],
  ["photographed", "Photography"],
  ["notes", "Keeper's notes"],
] as const;

export function reviewCorrection(
  request: CorrectionRequest,
  current: ResolvedCatalogue,
) {
  // Import state is never authoritative: check every request again against
  // the currently resolved catalogue before review and before publication.
  const parsed = correctionRequestSchema.parse(request);
  if (
    parsed.catalogueId.toLowerCase() !==
      current.catalogue.catalogueId.toLowerCase() ||
    parsed.catalogueId.toLowerCase() !== current.state.catalogueId.toLowerCase()
  )
    throw new Error(
      "This request belongs to a different catalogue. Open that catalogue before importing it.",
    );
  if (!parsed.sourceReference)
    throw new Error(
      "This request has no verified source edition. Ask the contributor to refresh the current catalogue and download a new correction request.",
    );
  if (parsed.sourceReference !== current.reference)
    throw new Error(
      "The catalogue has changed since this request was prepared. No records were changed. Ask the contributor to review the latest edition and download a new request; this older request cannot overwrite it.",
    );
  const before = current.catalogue.records.find(
    (record) => record.id === parsed.record.id,
  );
  if (!before)
    throw new Error(
      "The requested record is not in this catalogue. A correction can only update an existing record.",
    );
  if (
    !current.catalogue.collections.some(
      (collection) => collection.id === parsed.record.collection,
    )
  )
    throw new Error(
      "The requested library is not in this catalogue. Choose an existing library before preparing the request.",
    );
  const value = (
    record: CatalogueRecord,
    field: (typeof reviewedFields)[number][0],
  ) => {
    if (field === "collection") {
      const collection = current.catalogue.collections.find(
        (entry) => entry.id === record.collection,
      );
      return collection
        ? `${collection.name} (${collection.id})`
        : record.collection;
    }
    return String(record[field]);
  };
  const changes = reviewedFields
    .filter(([field]) => before[field] !== parsed.record[field])
    .map(([field, label]) => ({
      field,
      label,
      before: value(before, field),
      after: value(parsed.record, field),
    }));
  if (!changes.length)
    throw new Error(
      "This request does not change any catalogue fields. A new edition is not needed.",
    );
  return { request: parsed, before, changes };
}

export function correctionEdition(
  request: CorrectionRequest,
  current: ResolvedCatalogue,
  now: string,
) {
  const reviewed = reviewCorrection(request, current);
  if (
    current.catalogue.publisher.toLowerCase() !==
    current.state.publisher.toLowerCase()
  )
    throw new Error(
      "The appointed steward has changed. Refresh the catalogue before publishing a correction.",
    );
  return catalogueSchema.parse({
    ...current.catalogue,
    revision: current.catalogue.revision + 1,
    previous: current.reference,
    updatedAt: now,
    change: reviewed.request.reason,
    records: current.catalogue.records.map((record) =>
      record.id === reviewed.before.id
        ? { ...reviewed.request.record, updatedAt: now }
        : record,
    ),
  });
}
