import {
  catalogueSchema,
  referenceSchema,
  type ResolvedCatalogue,
} from "./model";

function escape(value: unknown) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

/** A self-contained, script-free reading copy for the libraries' own custody. */
export function recoveryDocument(
  resolved: ResolvedCatalogue,
  agreement: string,
) {
  const catalogue = catalogueSchema.parse(resolved.catalogue);
  referenceSchema.parse(resolved.reference);
  referenceSchema.parse(resolved.state.agreement);
  if (!agreement.trim() || agreement.length > 256_000)
    throw new Error("The agreement is empty or exceeds the supported size.");
  const stableIdentifier = `eip155:100:${resolved.state.registry}`;
  const rows = catalogue.collections
    .map((collection) => {
      const records = catalogue.records.filter(
        (record) => record.collection === collection.id,
      );
      return `<section><h2>${escape(collection.name)}</h2><p class="muted">${escape(collection.region)} · ${records.length} records</p>${records
        .map(
          (record) => `<article>
      <p class="eyebrow">${escape(record.shelfmark)} · ${escape(record.id)}</p>
      <h3>${escape(record.title)}</h3>
      <p>${escape(record.material)} · ${record.folios} folios · Condition: ${escape(record.condition)} · Photographed: ${escape(record.photographed)}</p>
      <p class="preserve">${escape(record.notes)}</p><p class="muted">Record updated ${escape(record.updatedAt)}</p>
    </article>`,
        )
        .join("")}</section>`;
    })
    .join("");
  const json = JSON.stringify(catalogue, null, 2);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escape(catalogue.title)} - Relay recovery copy</title>
<style>body{margin:0;background:#f7f5ec;color:#203c30;font:17px/1.65 Georgia,serif}main{max-width:880px;margin:auto;padding:48px 24px}h1{font-size:clamp(2.2rem,6vw,3.8rem);line-height:1.12;margin:.35em 0}h2{font-size:1.8rem}h3{font-size:1.3rem;margin:.25em 0}section{border-top:1px solid #b8c2b5;margin-top:36px;padding-top:16px}article{border-top:1px solid #d6dcd0;padding:18px 0;break-inside:avoid}.eyebrow{font:12px/1.5 sans-serif;letter-spacing:.08em;text-transform:uppercase}.muted{font-size:.85em;color:#536456}.notice{background:#e4eadc;padding:20px;border-left:4px solid #426744}code,pre{font:13px/1.65 monospace;overflow-wrap:anywhere;white-space:pre-wrap}.preserve{white-space:pre-wrap}dt{font-weight:bold;margin-top:12px}dd{margin:0;overflow-wrap:anywhere}a{color:inherit}li{margin:12px 0}details{margin-top:24px}@media print{body{background:white;color:black}main{padding:0}details{display:block}h2,h3{break-after:avoid}.notice{border:1px solid #999}}</style></head>
<body><main><p class="eyebrow">RELAY · KEEP WITH THE LIBRARIES</p><h1>${escape(catalogue.title)}</h1>
<p>${escape(catalogue.description)}</p>
<div class="notice"><strong>A dated reading copy, not a live catalogue.</strong><br>Observed through the public network at ${escape(resolved.observedAt)}. This file opens without Relay, an account or an internet connection. It cannot renew storage, appoint a steward, or tell you whether a later correction or handoff occurred.${catalogue.demonstration ? " These are invented demonstration records; no library has adopted this arrangement." : ""}</div>
<section><h2>If the keeper stops answering</h2><ol>
<li>Keep this complete file in more than one library. It contains ${catalogue.records.length} records and the agreement read from the public registry's Swarm reference. Do not place private keys in it.</li>
<li>Contact the council delegates through the libraries' own contact register. Read the agreement below together and record which retirement, unavailability or compromise condition applies.</li>
<li>The incoming steward checks this copy against the current network catalogue, creates their own publishing key, and stages their starting catalogue. At least ${resolved.state.threshold} current council delegates independently approve the same appointment, matching the observed council approval rule below. Any funded executor can send those approvals; the original publisher's permission and this website are not required.</li>
<li>Check the unchanged public identifier after appointment and verify a correction from the incoming steward. The outgoing key can still publish to its old feed; it does not control the current catalogue.</li>
<li>Ask the storage custodian for a fresh postage check immediately. Storage is a subscription. Appointment does not transfer a batch. If the original node is lost, a new custodian needs a funded node and must republish retained data before all copies disappear.</li>
</ol><p>If fewer than the required council keys survive, there is no master recovery password. The libraries must agree on a new identifier and tell readers. This copy contains public addresses, not people's contact details or private keys.</p></section>
<section><h2>The way back</h2><dl>
<dt>Public catalogue identifier</dt><dd><code>${escape(stableIdentifier)}</code></dd>
<dt>Appointed publisher at observation</dt><dd><code>${escape(resolved.state.publisher)}</code></dd>
<dt>Council approval rule</dt><dd>${resolved.state.threshold} of ${resolved.state.owners.length} current delegates</dd>
<dt>Current delegate addresses at observation</dt><dd>${resolved.state.owners.map((owner) => `<code>${escape(owner)}</code>`).join("<br>")}</dd>
<dt>Succession revision / feed index</dt><dd>${escape(resolved.state.revision)} / ${escape(resolved.feedIndex)}</dd>
<dt>Catalogue content reference</dt><dd><code>${escape(resolved.reference)}</code></dd>
<dt>Agreement content reference</dt><dd><code>${escape(resolved.state.agreement)}</code></dd>
</dl><p>When online, another copy of Relay can follow this same registry. A technical helper can use the open source reader:</p><pre>npm ci
npm run relay -- read --registry ${escape(resolved.state.registry)}</pre><p>Reader source and operating instructions: <a href="https://github.com/hrsh22/relay-catalogue">github.com/hrsh22/relay-catalogue</a>. Public RPC and Swarm gateways are still availability and trust dependencies; this file is not an independent blockchain proof.</p></section>
${rows}
<section><h2>The linked stewardship agreement</h2><p class="muted">Retrieved from Swarm using the agreement reference held in the observed registry. The text below is preserved as published.</p><pre>${escape(agreement)}</pre></section>
<section><h2>Catalogue data for a new keeper</h2><p>The full versioned catalogue is retained below, so a technical helper can restore the same records rather than retype them. This is public data, not a signing key.</p><details open><summary>Complete catalogue JSON</summary><pre>${escape(json)}</pre></details></section>
</main></body></html>`;
}
