import { z } from "zod";
import { addressSchema, hex32Schema, referenceSchema } from "./model";

export type Demo = {
  registry: string;
  council: string;
  catalogueId: string;
  payer: string;
  batchId: string;
  publishers: Record<string, string>;
  councilOwners: Record<string, string>;
  agreement: string;
  stableIdentifier: string;
  repository: string;
  storage: { observedAt: string; remainingSeconds: number; usage: number };
  handoffs: {
    title: string;
    from: string;
    to: string;
    hash: string;
    observedAt: string;
    reference: string;
    detail: string;
  }[];
};

// A default address is sufficient to start reading. Optional receipts must not
// prevent the network read if their presentation metadata is malformed.
export const deploymentAddressSchema = z.object({ registry: addressSchema });

// Validate optional deployment receipts before using them as presentation data.
// The registry's live state remains the source of appointment authority.
export const demoSchema: z.ZodType<Demo> = z.object({
  registry: addressSchema,
  council: addressSchema,
  catalogueId: hex32Schema,
  payer: addressSchema,
  batchId: referenceSchema,
  publishers: z.record(z.string(), addressSchema),
  councilOwners: z.record(z.string(), addressSchema),
  agreement: referenceSchema,
  stableIdentifier: z.string(),
  repository: z.url({ protocol: /^https$/ }),
  storage: z.object({
    observedAt: z.iso.datetime(),
    remainingSeconds: z.number().finite().nonnegative(),
    usage: z.number().finite().nonnegative(),
  }),
  handoffs: z
    .array(
      z.object({
        title: z.string(),
        from: addressSchema,
        to: addressSchema,
        hash: hex32Schema,
        observedAt: z.iso.datetime(),
        reference: referenceSchema,
        detail: z.string(),
      }),
    )
    .max(100),
});
