import { z } from "zod";

export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const referenceSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const hex32Schema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const collectionSchema = z
  .object({
    id: z.string().min(1).max(40),
    name: z.string().min(1).max(100),
    region: z.string().min(1).max(100),
  })
  .strict();
export const recordSchema = z
  .object({
    id: z.string().min(1).max(60),
    collection: z.string().min(1).max(40),
    title: z.string().min(1).max(180),
    shelfmark: z.string().min(1).max(80),
    material: z.string().min(1).max(100),
    folios: z.number().int().min(0).max(100000),
    condition: z.enum(["stable", "fragile", "damaged", "missing"]),
    photographed: z.enum(["complete", "partial", "not-started"]),
    notes: z.string().max(2500),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const catalogueSchema = z
  .object({
    format: z.literal("relay.catalogue.v1"),
    catalogueId: hex32Schema,
    title: z.string().min(1).max(180),
    description: z.string().max(2000),
    demonstration: z.boolean(),
    publisher: addressSchema,
    revision: z.number().int().min(0),
    updatedAt: z.iso.datetime(),
    previous: referenceSchema.nullable(),
    change: z.string().min(1).max(1000),
    collections: z.array(collectionSchema).min(1).max(100),
    records: z.array(recordSchema).max(20000),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set(value.collections.map((c) => c.id));
    if (ids.size !== value.collections.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate collection identifiers",
      });
    if (new Set(value.records.map((r) => r.id)).size !== value.records.length)
      ctx.addIssue({ code: "custom", message: "Duplicate record identifiers" });
    if (value.records.some((r) => !ids.has(r.collection)))
      ctx.addIssue({
        code: "custom",
        message: "Record references an unknown collection",
      });
  });
export type Catalogue = z.infer<typeof catalogueSchema>;
export type CatalogueRecord = z.infer<typeof recordSchema>;

export type RegistryState = {
  chainId: 100;
  registry: `0x${string}`;
  council: `0x${string}`;
  catalogueId: `0x${string}`;
  publisher: `0x${string}`;
  topic: `0x${string}`;
  checkpoint: string;
  agreement: string;
  revision: string;
  blockNumber: string;
  owners: string[];
  threshold: number;
};
export type ResolvedCatalogue = {
  state: RegistryState;
  catalogue: Catalogue;
  reference: string;
  feedIndex: string;
  gateway: string;
  observedAt: string;
};

export function distinctIdentities(
  publisher: string,
  payer: string,
  councilOwners: string[],
) {
  const keys = [publisher, payer, ...councilOwners].map((a) =>
    addressSchema.parse(a).toLowerCase(),
  );
  if (new Set(keys).size !== keys.length)
    throw new Error(
      "Publisher, payer and each council signer must use distinct identities.",
    );
}
