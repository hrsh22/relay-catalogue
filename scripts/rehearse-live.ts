import assert from "node:assert/strict";
import path from "node:path";
import { access, readFile } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import {
  config,
  evidence,
  json,
  readKey,
  ROOT,
  RPC,
  RUNTIME,
  save,
} from "./context";
import { readRegistry } from "../src/lib/chain";
import { resolveCatalogue } from "../src/lib/network";
import { catalogueSchema, type Catalogue } from "../src/lib/model";
import { nextEdition, publishCatalogue } from "./publish";
import {
  approveProposal,
  councilSdk,
  executeProposal,
  prepareAppointment,
  prepareReplacement,
  validateProposal,
  type Proposal,
} from "./council";
import { executeStorageQuote, quoteStorage, storageStatus } from "./storage";

const c = await config();
if (!c.registry || !c.council)
  throw new Error("Deploy Relay before the live rehearsal.");
const key = (name: string) => path.join(RUNTIME, "private", `${name}.key`);
async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
async function memo<T>(name: string, run: () => Promise<T>): Promise<T> {
  const file = path.join(RUNTIME, `${name}.json`);
  if (await exists(file)) return JSON.parse(await readFile(file, "utf8"));
  console.log("START", name);
  const result = await run();
  await save(file, result);
  console.log("DONE", name);
  return result;
}
async function readPublic(expectedReference?: string) {
  let last: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      const result = await resolveCatalogue(c.registry!);
      if (expectedReference && result.reference !== expectedReference)
        throw new Error(
          "Gateway has not resolved the expected publication yet.",
        );
      return result;
    } catch (error) {
      last = error;
      console.log("Public gateway read pending; retry", i + 1);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw last;
}
async function publication(
  name: string,
  catalogue: Catalogue,
  identity: string,
  staging = false,
  retired = false,
) {
  return memo(name, async () => ({
    ...(await publishCatalogue(catalogue, key(identity), {
      staging,
      allowRetired: retired,
    })),
    catalogue,
  }));
}
async function retire(identity: string, successor: string) {
  return memo(`${identity}-retirement`, async () => {
    const account = privateKeyToAccount(await readKey(key(identity)));
    const message = `Relay voluntary retirement rehearsal. Registry ${c.registry}. Outgoing ${account.address}. Incoming ${successor}. This is a test-key rehearsal operated by Harsh Gupta, not independent human custody.`;
    const result = {
      message,
      signer: account.address,
      signature: await account.signMessage({ message }),
      observedAt: new Date().toISOString(),
    };
    await evidence("retirement-notice", result);
    return result;
  });
}
async function appointment(
  name: string,
  incoming: string,
  checkpoint: string,
  agreement: string,
  delegates: string[],
) {
  return memo(name, async () => {
    let proposal = await prepareAppointment(
      incoming,
      c.topic,
      checkpoint,
      agreement,
    );
    proposal = await approveProposal(proposal, key(delegates[0]));
    const one = await validateProposal(proposal);
    let oneValid = false;
    try {
      oneValid = await one.sdk.isValidTransaction(one.tx, { from: c.executor });
    } catch {}
    assert.equal(oneValid, false);
    await evidence("one-signature-rejected", {
      kind: "live-eth-call",
      publicChainTransactionSent: false,
      registry: c.registry,
      safeTxHash: proposal.safeTxHash,
      approvals: proposal.signatures,
      result: "Safe simulation rejected one signature",
      observedAt: new Date().toISOString(),
    });
    proposal = await approveProposal(proposal, key(delegates[1]));
    const record = await executeProposal(
      proposal,
      key("executor"),
      100000000000000n,
    );
    const tx = await councilSdk(c);
    let replayValid = false;
    try {
      replayValid = await tx.isValidTransaction(one.tx, { from: c.executor });
    } catch {}
    assert.equal(replayValid, false);
    return record;
  });
}

const initial = await memo("read-a", () => readPublic());
assert.equal(
  initial.state.publisher.toLowerCase(),
  c.publishers.a.toLowerCase(),
);
const editionA = nextEdition(
  initial.catalogue,
  initial.reference,
  "Steward A checks the first collection and confirms its photographed inventory.",
);
editionA.records[0].photographed = "complete";
editionA.records[0].notes =
  "Original steward A checked this example record before voluntary retirement.";
const a1 = await publication("a-correction", editionA, "publisher-a");
await retire("publisher-a", c.publishers.b);
const catalogueB: Catalogue = {
  ...structuredClone(a1.catalogue),
  publisher: c.publishers.b,
  revision: 0,
  previous: null,
  updatedAt: new Date().toISOString(),
  change:
    "Incoming steward B verifies and stages the catalogue after A's voluntary retirement.",
};
const b0 = await publication("b-staged", catalogueB, "publisher-b", true);
const ab = await appointment(
  "handoff-a-b",
  c.publishers.b,
  b0.reference,
  initial.state.agreement,
  ["council-1", "council-2"],
);
const observedB = await memo("read-b-incoming", () => readPublic(b0.reference));
assert.equal(
  observedB.state.publisher.toLowerCase(),
  c.publishers.b.toLowerCase(),
);
const editionB = nextEdition(
  b0.catalogue,
  b0.reference,
  "Steward B corrects the Pin valley condition after appointment.",
);
editionB.records.find((r) => r.id === "pin-1")!.condition = "fragile";
editionB.records.find((r) => r.id === "pin-1")!.notes =
  "Successor B's live correction: the example item was located and is fragile, rather than missing.";
const b1 = await publication("b-correction", editionB, "publisher-b");

const retiredA = nextEdition(
  a1.catalogue,
  a1.reference,
  "Retired publisher test: this old feed is no longer authoritative.",
);
retiredA.records[0].title =
  "Retired publisher test - must not appear in the authoritative catalogue";
await publication("a-retired-test", retiredA, "publisher-a", false, true);
const retirementCheck = await memo("retired-key-ignored", async () => {
  const resolved = await readPublic(b1.reference);
  assert.equal(
    resolved.state.publisher.toLowerCase(),
    c.publishers.b.toLowerCase(),
  );
  assert.equal(resolved.reference, b1.reference);
  assert(
    !resolved.catalogue.records.some((r) =>
      r.title.startsWith("Retired publisher test"),
    ),
  );
  const result = {
    kind: "live-reader-check",
    stableIdentifier: `eip155:100:${c.registry}`,
    retiredPublisher: c.publishers.a,
    activePublisher: resolved.state.publisher,
    reference: resolved.reference,
    result:
      "Retired A's later publication did not change the authoritative catalogue",
    observedAt: resolved.observedAt,
  };
  await evidence("retired-key-ignored", result);
  return result;
});

const replacement = await memo("council-replacement", async () => {
  let proposal = await prepareReplacement(
    c.councilOwners["1"],
    c.councilOwners["4"],
  );
  proposal = await approveProposal(proposal, key("council-2"));
  proposal = await approveProposal(proposal, key("council-3"));
  const result = await executeProposal(
    proposal,
    key("executor"),
    100000000000000n,
  );
  assert(
    !result.after.owners.some(
      (a) => a.toLowerCase() === c.councilOwners["1"].toLowerCase(),
    ),
  );
  assert(
    result.after.owners.some(
      (a) => a.toLowerCase() === c.councilOwners["4"].toLowerCase(),
    ),
  );
  assert.equal(result.after.threshold, 2);
  return result;
});
await retire("publisher-b", c.publishers.c);
const catalogueC: Catalogue = {
  ...structuredClone(b1.catalogue),
  publisher: c.publishers.c,
  revision: 0,
  previous: null,
  updatedAt: new Date().toISOString(),
  change:
    "Incoming steward C stages the catalogue after B's voluntary retirement.",
};
const c0 = await publication("c-staged", catalogueC, "publisher-c", true);
const bc = await appointment(
  "handoff-b-c",
  c.publishers.c,
  c0.reference,
  initial.state.agreement,
  ["council-2", "council-4"],
);
const editionC = nextEdition(
  c0.catalogue,
  c0.reference,
  "Steward C completes the photography status for the Upper Spiti keeper's register.",
);
editionC.records.find((r) => r.id === "spiti-2")!.photographed = "complete";
editionC.records.find((r) => r.id === "spiti-2")!.notes =
  "Second successor C's live correction: example photography is now complete.";
const c1 = await publication("c-correction", editionC, "publisher-c");
const final = await memo("read-c-final", () => readPublic(c1.reference));
assert.equal(final.reference, c1.reference);
assert.equal(final.state.publisher.toLowerCase(), c.publishers.c.toLowerCase());
assert.equal(final.state.revision, "2");
await memo("renew-existing-batch", async () => {
  const quote = await quoteStorage("renew", 1);
  console.log("Renewal quote xBZZ:", quote.bzz);
  if (BigInt(quote.plur) > 1200000000000000n)
    throw new Error("Live rehearsal renewal exceeds 0.12 xBZZ budget.");
  return executeStorageQuote(quote, 1200000000000000n);
});
const storage = await storageStatus();
const batch = storage.batches.find((b) => b.id === c.batchId)!;
await save(
  path.join(ROOT, "public", "catalogue-snapshot.json"),
  final.catalogue,
);
await save(path.join(ROOT, "public", "demo.json"), {
  registry: c.registry,
  council: c.council,
  catalogueId: c.catalogueId,
  payer: c.payer,
  batchId: c.batchId,
  publishers: c.publishers,
  councilOwners: c.councilOwners,
  agreement: final.state.agreement,
  stableIdentifier: `eip155:100:${c.registry}`,
  repository: "https://github.com/hrsh22/relay-catalogue",
  storage: {
    observedAt: storage.observedAt,
    remainingSeconds: batch.remainingSeconds,
    usage: batch.usage,
  },
  handoffs: [
    {
      title: "Steward A to steward B",
      from: c.publishers.a,
      to: c.publishers.b,
      hash: ab.hash,
      observedAt: ab.observedAt,
      reference: b1.reference,
      detail:
        "Two council delegates approved B. B published a real condition correction. A's later publication to the retired feed did not change this catalogue.",
    },
    {
      title: "Steward B to steward C",
      from: c.publishers.b,
      to: c.publishers.c,
      hash: bc.hash,
      observedAt: bc.observedAt,
      reference: c1.reference,
      detail:
        "The council replaced a delegate, then approved C without A's or B's publishing key. C published a photography correction through the same public identifier.",
    },
  ],
});
await evidence("rehearsal-summary", {
  kind: "live-rehearsal-summary",
  observedAt: new Date().toISOString(),
  stableIdentifier: `eip155:100:${c.registry}`,
  initialReference: initial.reference,
  finalReference: final.reference,
  finalState: final.state,
  checks: [
    "A -> B handoff",
    "B publishes correction",
    "Retired A update ignored",
    "Council delegate replaced",
    "B -> C handoff",
    "C publishes correction",
    "Existing batch renewed",
  ],
  custody:
    "All dedicated test keys operated by Harsh on one laptop. This is a real multi-identity protocol rehearsal, not independent human custody.",
});
console.log(
  "LIVE REHEARSAL COMPLETE",
  json({
    registry: c.registry,
    currentPublisher: final.state.publisher,
    reference: final.reference,
    remainingDays: batch.remainingSeconds / 86400,
  }),
);
