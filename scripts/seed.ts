import path from "node:path";
import { catalogueSchema } from "../src/lib/model";
import { config, ROOT, save } from "./context";

const c = await config();
const collections = [
  { id: "nubra", name: "Nubra study collection", region: "Ladakh" },
  { id: "indus", name: "Upper Indus collection", region: "Ladakh" },
  { id: "sham", name: "Western valley collection", region: "Ladakh" },
  { id: "zanskar", name: "Zanskar study collection", region: "Ladakh" },
  { id: "pin", name: "Pin valley collection", region: "Spiti" },
  { id: "spiti", name: "Upper Spiti collection", region: "Spiti" },
  { id: "lingti", name: "Lingti study collection", region: "Spiti" },
];
const titles = [
  "Seasonal inventory",
  "Keeper's register",
  "Conservation notes",
];
const updatedAt = new Date().toISOString();
const records = collections.flatMap((collection, i) =>
  titles.map((title, j) => ({
    id: `${collection.id}-${j + 1}`,
    collection: collection.id,
    title: `${title}, volume ${i + 1}`,
    shelfmark: `${collection.id.toUpperCase()} / ${String(j + 1).padStart(3, "0")}`,
    material: j === 1 ? "Paper, cloth binding" : "Loose paper folios",
    folios: 32 + i * 9 + j * 14,
    condition: (
      [
        "stable",
        "fragile",
        "damaged",
        "stable",
        "missing",
        "stable",
        "fragile",
      ] as const
    )[(i + j) % 7],
    photographed: (["complete", "partial", "not-started"] as const)[
      (i + j) % 3
    ],
    notes:
      j === 0
        ? "Illustrative inventory entry. Confirm counts at the next physical inspection."
        : j === 1
          ? "Demonstration record for practising catalogue corrections and handoffs."
          : "Example conservation note; no historical provenance is claimed.",
    updatedAt,
  })),
);
const catalogue = catalogueSchema.parse({
  format: "relay.catalogue.v1",
  catalogueId: c.catalogueId,
  title: "The seven collections",
  description:
    "A shared catalogue for the next keeper. Invented records for a live succession rehearsal across seven example library collections.",
  demonstration: true,
  publisher: c.initialPublisher,
  revision: 0,
  updatedAt,
  previous: null,
  change: "Original steward A establishes the shared demonstration catalogue.",
  collections,
  records,
});
await save(path.join(ROOT, ".runtime", "catalogue-a.json"), catalogue);
await save(path.join(ROOT, "public", "sample-catalogue.json"), catalogue);
console.log(
  "Prepared",
  records.length,
  "clearly marked demonstration records across",
  collections.length,
  "collections.",
);
