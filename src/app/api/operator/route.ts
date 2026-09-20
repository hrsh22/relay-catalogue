import { NextRequest } from "next/server";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const { config } = await import("../../../../scripts/context");
    const { storageStatus } = await import("../../../../scripts/storage");
    const c = await config();
    return Response.json(
      { config: c, storage: await storageStatus() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "The local Bee node or operator configuration is unavailable." },
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
  if (root.relayBusy)
    return Response.json(
      { error: "An operation is still in progress. Wait for its result." },
      { status: 409 },
    );
  root.relayBusy = true;
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
      ])
      .parse(body.action);
    const ctx = await import("../../../../scripts/context");
    const c = await ctx.config();
    const { catalogueSchema } = await import("@/lib/model");
    const council = await import("../../../../scripts/council");
    const key = (alias: string) => `.runtime/private/${alias}.key`;
    let result: unknown;
    if (action === "publish" || action === "stage") {
      const alias = z
        .enum(["publisher-a", "publisher-b", "publisher-c"])
        .parse(body.identity);
      let catalogue = catalogueSchema.parse(body.catalogue);
      if (action === "stage") {
        const bee = await ctx.checkedBee(c);
        try {
          const head = await bee.feed
            .makeReader(c.topic.slice(2), catalogue.publisher.slice(2))
            .downloadReference();
          const previous = catalogueSchema.parse(
            (await bee.data.download(head.reference)).toJSON(),
          );
          catalogue = {
            ...catalogue,
            previous: head.reference.toHex(),
            revision: previous.revision + 1,
          };
        } catch (error) {
          const { BeeResponseError } = await import("@ethersphere/bee-js");
          if (!(error instanceof BeeResponseError && error.status === 404))
            throw error;
        }
      }
      const { publishCatalogue } = await import("../../../../scripts/publish");
      result = await publishCatalogue(catalogue, key(alias), {
        staging: action === "stage",
      });
    } else if (action === "propose") {
      result = await council.prepareAppointment(
        z.string().parse(body.incoming),
        c.topic,
        z.string().parse(body.checkpoint),
        z.string().parse(body.agreement),
      );
    } else if (action === "approve") {
      const alias = z
        .enum(["council-1", "council-2", "council-3", "council-4"])
        .parse(body.identity);
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
    root.relayBusy = false;
  }
}
