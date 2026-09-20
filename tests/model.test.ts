import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { catalogueSchema, distinctIdentities } from "../src/lib/model";
import { gatewayOrigin, bytesAt } from "../src/lib/network";
const sample = JSON.parse(
  await readFile(
    new URL("../public/sample-catalogue.json", import.meta.url),
    "utf8",
  ),
);
test("catalogue format retains seven collections and stable record identifiers", () => {
  const parsed = catalogueSchema.parse(sample);
  assert.equal(parsed.collections.length, 7);
  assert.equal(parsed.records.length, 21);
});
test("records cannot silently refer to a missing collection", () => {
  const value = structuredClone(sample);
  value.records[0].collection = "does-not-exist";
  assert.equal(catalogueSchema.safeParse(value).success, false);
});
test("duplicate record and collection identities are rejected", () => {
  const value = structuredClone(sample);
  value.records.push(value.records[0]);
  assert.equal(catalogueSchema.safeParse(value).success, false);
  value.records.pop();
  value.collections.push(value.collections[0]);
  assert.equal(catalogueSchema.safeParse(value).success, false);
});
test("unknown fields cannot smuggle another interpretation of the catalogue", () => {
  assert.equal(
    catalogueSchema.safeParse({ ...sample, redirect: "https://example.com" })
      .success,
    false,
  );
});
test("a reused paying or council key cannot count as separation", () => {
  const a = "0x" + "11".repeat(20),
    b = "0x" + "22".repeat(20),
    c = "0x" + "33".repeat(20);
  assert.doesNotThrow(() => distinctIdentities(a, b, [c]));
  assert.throws(() => distinctIdentities(a, a, [c]));
  assert.throws(() => distinctIdentities(a, b, [a]));
  assert.throws(() => distinctIdentities(a, b, [c, c]));
});
test("gateway configuration rejects embedded credentials and URL paths", () => {
  assert.equal(gatewayOrigin("http://127.0.0.1:1633"), "http://127.0.0.1:1633");
  assert.throws(() => gatewayOrigin("https://user:pass@example.com"));
  assert.throws(() => gatewayOrigin("https://example.com/path"));
  assert.throws(() => gatewayOrigin("http://example.com"));
});
test("invalid content addresses fail before a network request", async () => {
  await assert.rejects(bytesAt("https://example.com", "../../secrets"));
});
test("negative folio counts and invalid condition labels cannot be published", () => {
  const value = structuredClone(sample);
  value.records[0].folios = -1;
  assert.equal(catalogueSchema.safeParse(value).success, false);
  value.records[0].folios = 10;
  value.records[0].condition = "guaranteed-preserved";
  assert.equal(catalogueSchema.safeParse(value).success, false);
});
