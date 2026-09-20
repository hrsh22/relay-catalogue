import { Bee } from "@ethersphere/bee-js";
import { readRegistry } from "./chain";
import {
  catalogueSchema,
  referenceSchema,
  type ResolvedCatalogue,
  type RegistryState,
} from "./model";

export const DEFAULT_GATEWAY = "https://api.gateway.ethswarm.org";
export function gatewayOrigin(value: string) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Use a gateway origin without credentials, query or path.");
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("Use HTTPS or a loopback Bee endpoint.");
  return url.origin;
}
export async function bytesAt(
  gateway: string,
  reference: string,
  limit = 2_000_000,
) {
  referenceSchema.parse(reference);
  const response = await fetch(`${gatewayOrigin(gateway)}/bytes/${reference}`, {
    cache: "no-store",
    credentials: "omit",
    signal: AbortSignal.timeout(35000),
  });
  if (!response.ok)
    throw new Error(
      `Swarm returned HTTP ${response.status}. The object may be propagating or unavailable; try another gateway.`,
    );
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Swarm returned no body.");
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit)
        throw new Error("The catalogue exceeds the supported size limit.");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
export async function readFeed(
  state: RegistryState,
  gateway = DEFAULT_GATEWAY,
) {
  const base = gatewayOrigin(gateway);
  const bee = new Bee(base, { timeout: 35000, endlesslyRetry: false });
  const head = await bee.feed
    .makeReader(state.topic.slice(2), state.publisher.slice(2))
    .downloadReference();
  const reference = head.reference.toHex();
  const bytes = await bytesAt(base, reference);
  const catalogue = catalogueSchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
  if (catalogue.publisher.toLowerCase() !== state.publisher.toLowerCase())
    throw new Error("Catalogue publisher differs from the appointed identity.");
  if (catalogue.catalogueId.toLowerCase() !== state.catalogueId.toLowerCase())
    throw new Error("This feed belongs to a different catalogue.");
  return {
    catalogue,
    reference,
    feedIndex: head.feedIndex.toBigInt().toString(),
    gateway: base,
  };
}
export async function resolveCatalogue(
  registry: string,
  gateway = DEFAULT_GATEWAY,
  rpc?: string,
): Promise<ResolvedCatalogue> {
  const state = await readRegistry(registry, rpc);
  const result = await readFeed(state, gateway);
  // A handoff during the network read must not silently show the retired publisher as current.
  const current = await readRegistry(registry, rpc);
  if (
    current.revision !== state.revision ||
    current.publisher.toLowerCase() !== state.publisher.toLowerCase()
  )
    throw new Error(
      "A handoff happened while reading. Refresh to read the newly appointed steward.",
    );
  return { state: current, ...result, observedAt: new Date().toISOString() };
}
export function readableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out|abort/i.test(message))
    return "The network did not respond in time. Retry or change the connection settings.";
  if (/fetch failed|Failed to fetch/i.test(message))
    return "The network endpoint could not be reached. Retry or choose another gateway or RPC.";
  return message.length < 450
    ? message
    : "The operation could not be verified. Check the connection and configuration, then retry.";
}
