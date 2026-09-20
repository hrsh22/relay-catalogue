import { NextRequest } from "next/server";
import { z } from "zod";
import { access } from "node:fs/promises";
import path from "node:path";
import { addressSchema, hex32Schema, referenceSchema } from "@/lib/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const publicRoleMap = z.record(
  z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/),
  addressSchema,
);
const publicConfigSchema = z
  .object({
    chainId: z.literal(100),
    registry: addressSchema.optional(),
    council: addressSchema.optional(),
    catalogueId: hex32Schema,
    topic: hex32Schema,
    payer: addressSchema,
    batchId: referenceSchema.optional(),
    initialPublisher: addressSchema,
    publishers: publicRoleMap,
    councilOwners: publicRoleMap,
    executor: addressSchema,
    saltNonce: z
      .string()
      .max(78)
      .regex(/^(0|[1-9][0-9]*)$/),
  })
  .strip();

function allowed(request: NextRequest, write = false) {
  if (process.env.RELAY_LOCAL_OPERATOR !== "1" || process.env.VERCEL)
    return false;
  if (
    !["127.0.0.1:3002", "localhost:3002"].includes(
      request.headers.get("host") || "",
    )
  )
    return false;
  if (
    write &&
    request.headers.get("origin") !== `http://${request.headers.get("host")}`
  )
    return false;
  return true;
}
const root = globalThis as unknown as {
  relayBusy?: boolean;
  relayQuotes?: Map<string, unknown>;
};
export async function GET(request: NextRequest) {
  if (!allowed(request))
    return Response.json(
      { error: "Local operator is closed." },
      { status: 404 },
    );
  try {
    const { config, ROOT } = await import("../../../../scripts/context");
    const { storageStatus } = await import("../../../../scripts/storage");
    // Parse before inspecting aliases or returning a portable setup. Unknown
    // top-level fields are omitted; nested role values must be public addresses.
    const publicConfig = publicConfigSchema.parse(await config());
    const aliases = [
      "executor",
      ...Object.keys(publicConfig.publishers).map((key) => `publisher-${key}`),
      ...Object.keys(publicConfig.councilOwners).map((key) => `council-${key}`),
    ];
    const availableIdentities = (
      await Promise.all(
        aliases.map(async (alias) => {
          try {
            await access(path.join(ROOT, ".runtime/private", `${alias}.key`));
            return alias;
          } catch {
            return null;
          }
        }),
      )
    ).filter((alias): alias is string => alias !== null);
    let storage: Awaited<ReturnType<typeof storageStatus>> | null = null;
    let storageError: string | undefined;
    const councilOnly = process.env.RELAY_COUNCIL_ONLY === "1";
    if (!councilOnly) {
      try {
        storage = await storageStatus();
      } catch {
        storageError =
          "The storage node did not return an observation. Council review and approvals remain available.";
      }
    }
    return Response.json(
      {
        config: publicConfig,
        availableIdentities,
        mode: councilOnly ? "council" : "operator",
        storage,
        storageError,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error: "The operator's public catalogue configuration is unavailable.",
      },
      { status: 503 },
    );
  }
}
export async function POST(request: NextRequest) {
  if (!allowed(request, true))
    return Response.json(
      {
        error:
          "Open the manual operator on this computer to perform this action.",
      },
      { status: 403 },
    );
  if (Number(request.headers.get("content-length") || 0) > 2_500_000)
    return Response.json({ error: "Request too large." }, { status: 413 });
  let ownsOperationLock = false;
  try {
    const raw = await request.text();
    if (raw.length > 2_500_000) throw new Error("Request too large.");
    const body = JSON.parse(raw);
    const action = z
      .enum([
        "publish",
        "stage",
        "propose",
        "approve",
        "execute",
        "quote",
        "renew",
        "review-proposal",
        "replace-councillor",
        "registry-state",
      ])
      .parse(body.action);
    // Authority and proposal reads may run together when a saved council
    // session opens. Only this request's mutation can own/release the lock.
    if (!["registry-state", "review-proposal"].includes(action)) {
      if (root.relayBusy)
        return Response.json(
          { error: "An operation is still in progress. Wait for its result." },
          { status: 409 },
        );
      root.relayBusy = true;
      ownsOperationLock = true;
    }
    if (
      process.env.RELAY_COUNCIL_ONLY === "1" &&
      ["publish", "stage", "quote", "renew"].includes(action)
    )
      throw new Error(
        "This council session does not operate storage. Use the publishing or storage custodian's operator for this action.",
      );
    const ctx = await import("../../../../scripts/context");
    const c = await ctx.config();
    const { catalogueSchema } = await import("@/lib/model");
    const council = await import("../../../../scripts/council");
    const key = (alias: string) => `.runtime/private/${alias}.key`;
    const identity = (value: unknown, role: "publisher" | "council") => {
      const alias = z
        .string()
        .regex(/^[a-zA-Z0-9_-]{1,80}$/)
        .parse(value);
      const prefix = `${role}-`;
      const names = role === "publisher" ? c.publishers : c.councilOwners;
      if (
        !alias.startsWith(prefix) ||
        !Object.hasOwn(names, alias.slice(prefix.length))
      )
        throw new Error("Choose a configured identity for this role.");
      return alias;
    };
    let result: unknown;
    if (action === "registry-state") {
      if (!c.registry || !c.council)
        throw new Error(
          "Configure the public catalogue registry and council first.",
        );
      const { readRegistry } = await import("@/lib/chain");
      const state = await readRegistry(c.registry, ctx.RPC);
      if (
        state.catalogueId.toLowerCase() !== c.catalogueId.toLowerCase() ||
        state.council.toLowerCase() !== c.council.toLowerCase()
      )
        throw new Error(
          "Configured catalogue or council differs from the registry.",
        );
      result = state;
    } else if (action === "publish" || action === "stage") {
      const alias = identity(body.identity, "publisher");
      let catalogue = catalogueSchema.parse(body.catalogue);
      const { readRegistry } = await import("@/lib/chain");
      const state = c.registry ? await readRegistry(c.registry, ctx.RPC) : null;
      const topic = state?.topic || c.topic;
      if (action === "stage") {
        const bee = await ctx.checkedBee(c);
        const feed = bee.feed.makeReader(
          topic.slice(2),
          catalogue.publisher.slice(2),
        );
        let head: Awaited<ReturnType<typeof feed.downloadReference>> | null =
          null;
        try {
          head = await feed.downloadReference();
        } catch (error) {
          const { BeeResponseError } = await import("@ethersphere/bee-js");
          if (!(error instanceof BeeResponseError && error.status === 404))
            throw error;
        }
        // A missing head can be a new feed. Once a head exists, unavailable or
        // invalid previous content must fail instead of resetting its history.
        if (head) {
          const previous = catalogueSchema.parse(
            (await bee.data.download(head.reference)).toJSON(),
          );
          catalogue = {
            ...catalogue,
            previous: head.reference.toHex(),
            revision: previous.revision + 1,
          };
        }
      }
      const { publishCatalogue } = await import("../../../../scripts/publish");
      result = await publishCatalogue(catalogue, key(alias), {
        staging: action === "stage",
        ...(action === "stage" ? { topic } : {}),
      });
    } else if (action === "propose") {
      if (!c.registry)
        throw new Error("Configure the public catalogue registry first.");
      const { readRegistry } = await import("@/lib/chain");
      const state = await readRegistry(c.registry, ctx.RPC);
      const proposal = await council.prepareAppointment(
        z.string().parse(body.incoming),
        hex32Schema.parse(body.topic || state.topic) as `0x${string}`,
        z.string().parse(body.checkpoint),
        z.string().parse(body.agreement),
      );
      const context = z
        .object({
          trigger: z.enum(["retirement", "unreachable", "compromised"]),
          note: z.string().trim().min(10).max(2000),
        })
        .strict()
        .optional()
        .parse(body.context);
      result = { ...proposal, ...(context ? { context } : {}) };
    } else if (action === "review-proposal") {
      result = await council.reviewProposal(body.proposal);
    } else if (action === "replace-councillor") {
      result = await council.prepareReplacement(
        z.string().parse(body.outgoing),
        z.string().parse(body.incoming),
      );
    } else if (action === "approve") {
      const alias = identity(body.identity, "council");
      result = await council.approveProposal(body.proposal, key(alias));
    } else if (action === "execute") {
      result = await council.executeProposal(
        body.proposal,
        key("executor"),
        100000000000000n,
      );
    } else if (action === "quote") {
      const { quoteStorage } = await import("../../../../scripts/storage");
      const quote = await quoteStorage(
        "renew",
        z.number().positive().max(365).parse(body.days),
      );
      root.relayQuotes ||= new Map();
      root.relayQuotes.set(quote.id, quote);
      result = quote;
    } else {
      const id = z.string().uuid().parse(body.quoteId);
      const quote = root.relayQuotes?.get(id) as
        import("../../../../scripts/storage").StorageQuote | undefined;
      if (!quote) throw new Error("Request a fresh storage quote first.");
      root.relayQuotes!.delete(id);
      const { executeStorageQuote } =
        await import("../../../../scripts/storage");
      result = await executeStorageQuote(quote, BigInt(quote.plur));
    }
    return Response.json(JSON.parse(ctx.json(result)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const { readableError } = await import("@/lib/network");
    return Response.json({ error: readableError(error) }, { status: 400 });
  } finally {
    if (ownsOperationLock) root.relayBusy = false;
  }
}
