import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { recoveryDocument } from "../src/lib/recovery";
import { catalogueSchema, type ResolvedCatalogue } from "../src/lib/model";

const catalogue = catalogueSchema.parse(
  JSON.parse(
    await readFile(
      new URL("../public/sample-catalogue.json", import.meta.url),
      "utf8",
    ),
  ),
);
const sample: ResolvedCatalogue = {
  catalogue,
  state: {
    chainId: 100,
    registry: `0x${"11".repeat(20)}`,
    council: `0x${"22".repeat(20)}`,
    catalogueId: catalogue.catalogueId as `0x${string}`,
    publisher: catalogue.publisher as `0x${string}`,
    topic: `0x${"33".repeat(32)}`,
    checkpoint: "44".repeat(32),
    agreement: "55".repeat(32),
    revision: "2",
    blockNumber: "48347000",
    owners: [
      `0x${"66".repeat(20)}`,
      `0x${"77".repeat(20)}`,
      `0x${"88".repeat(20)}`,
    ],
    threshold: 2,
  },
  reference: "99".repeat(32),
  feedIndex: "2",
  gateway: "https://api.gateway.ethswarm.org",
  observedAt: "2026-09-20T10:00:00.000Z",
};

test("recovery copy retains every record, observed authority and published agreement without external assets", () => {
  const html = recoveryDocument(
    sample,
    "The libraries' published agreement.\nStorage needs renewal.",
  );
  for (const record of catalogue.records) assert(html.includes(record.id));
  for (const collection of catalogue.collections)
    assert(html.includes(collection.name));
  assert(html.includes(sample.state.registry));
  assert(html.includes(sample.state.agreement));
  assert(html.includes(sample.observedAt));
  assert(html.includes("Storage needs renewal."));
  assert(html.includes("A dated reading copy, not a live catalogue."));
  assert(html.includes("Appointment does not transfer a batch."));
  assert(!/<(?:script|iframe|img|link)\b/i.test(html));
});

test("public record and agreement text cannot inject executable HTML into the downloaded file", () => {
  const malicious = structuredClone(sample);
  malicious.catalogue.records[0].title = '<img src=x onerror="alert(1)">';
  const html = recoveryDocument(
    malicious,
    '</pre><script>alert("agreement")</script>',
  );
  assert(!html.includes("<img src=x"));
  assert(!html.includes("<script>"));
  assert(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert(html.includes("&lt;/pre&gt;&lt;script&gt;"));
  assert(html.includes("default-src 'none'"));
});

test("a recovery copy cannot silently omit the linked agreement or accept corrupt catalogue data", () => {
  assert.throws(() => recoveryDocument(sample, "  "), /agreement is empty/);
  assert.throws(
    () => recoveryDocument(sample, "x".repeat(256_001)),
    /supported size/,
  );
  const corrupt = structuredClone(sample);
  corrupt.catalogue.records[0].collection = "absent";
  assert.throws(() => recoveryDocument(corrupt, "Agreement"));
});

test("handoff instructions reflect a three-approval council instead of assuming the demonstration threshold", () => {
  const unanimous = structuredClone(sample);
  unanimous.state.threshold = 3;
  const html = recoveryDocument(
    unanimous,
    "The current agreement requires all three delegates.",
  );
  assert(
    html.includes("At least 3 current council delegates independently approve"),
  );
  assert(html.includes("3 of 3 current delegates"));
  assert(!html.includes("Two current council delegates"));
});
