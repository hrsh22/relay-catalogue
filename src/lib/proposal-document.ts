import type { ProposalReview } from "../../scripts/council";

const entities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escape = (value: unknown) =>
  String(value).replace(/[&<>"']/g, (character) => entities[character]!);

/** A printable record of a validated review, never an approval or live proof. */
export function proposalDocument(review: ProposalReview): string {
  const { proposal, state } = review;
  const appointment =
    proposal.kind === "appoint" ? review.appointment : undefined;
  const replacement =
    proposal.kind === "replace-councillor" ? review.replacement : undefined;
  const action = appointment || replacement;
  if (!action)
    throw new Error(
      "The decoded council action is missing. Review the proposal before making a copy.",
    );
  const title = appointment
    ? "Pass on the catalogue."
    : "Pass on a council seat.";
  const actionName = appointment
    ? "Appoint the next catalogue steward"
    : "Replace one council delegate";
  const verifiedApprovals = review.approvals.length;
  const triggerLabels = {
    retirement: "The current holder is retiring",
    unreachable: "The holder cannot be reached",
    compromised: "A lost or compromised key has been reported",
  };
  const context = proposal.context
    ? `<p><strong>Reported trigger:</strong> ${escape(triggerLabels[proposal.context.trigger])}</p><p class="preserve">${escape(proposal.context.note)}</p>`
    : "<p>No supporting trigger note accompanies this proposal. Agree and record the reason through the libraries' normal process before approving it.</p>";
  const technical = appointment
    ? `<dt>Expected succession revision</dt><dd>${escape(appointment.expectedRevision)}</dd><dt>Incoming feed topic</dt><dd><code>${escape(appointment.topic)}</code></dd><dt>Incoming catalogue checkpoint</dt><dd><code>${escape(appointment.checkpoint)}</code></dd><dt>Linked stewardship agreement</dt><dd><code>${escape(appointment.agreement)}</code></dd>`
    : `<dt>Succession revision at the observed block</dt><dd>${escape(state.revision)}</dd><dt>Appointed publisher, unchanged by this action</dt><dd><code>${escape(state.publisher)}</code></dd>`;
  const effect = appointment
    ? "The stable catalogue identifier will follow the incoming steward's feed after the appointment succeeds. The outgoing key can still sign its old feed, and earlier public data remains public. This appointment does not transfer the Bee node, its postage batch, funds or storage custody."
    : "One delegate address is replaced while the council's approval threshold is retained. The departing key will no longer count as a current council delegate after execution. This does not appoint a new catalogue publisher or transfer storage custody.";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escape(actionName)} - Relay council review</title>
<style>
:root{color-scheme:light;--paper:#f7f5ec;--ink:#203c30;--muted:#596b5a;--line:#c8d0c0}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.65 Georgia,serif}main{max-width:940px;margin:auto;padding:38px 28px 64px}header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:18px;gap:24px}.brand{font-size:31px}.eyebrow,dt,.step{font:11px/1.5 "Trebuchet MS",sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}.intro{padding:42px 0 24px}h1{font-size:clamp(2.5rem,7vw,4.6rem);line-height:1.06;letter-spacing:-.03em;margin:14px 0 24px}h2{font-size:1.7rem;font-weight:normal;line-height:1.2}h3{font-size:1.1rem}p{margin:12px 0}.muted{color:var(--muted);font-size:.86em}.notice{background:#e5eadc;padding:20px 24px;border-left:4px solid #55774e;margin:20px 0}.notice p:first-child{margin-top:0}.notice p:last-child{margin-bottom:0}section{border-top:1px solid var(--line);margin-top:30px;padding-top:16px}.roles{display:grid;grid-template-columns:1fr 1fr;gap:24px}.roles>div{padding:18px;background:#eeeee1}.roles p{font-size:14px}.preserve{white-space:pre-wrap;overflow-wrap:anywhere}dt{margin-top:16px}dd{margin:4px 0;overflow-wrap:anywhere}code,pre{font:12px/1.7 monospace;overflow-wrap:anywhere;white-space:pre-wrap}ol,ul{padding-left:24px}li{margin:14px 0}details{margin-top:24px}summary{cursor:pointer;font-size:15px}summary:focus-visible{outline:2px solid var(--ink);outline-offset:4px}.json{background:#eceee4;padding:18px}footer{margin-top:36px;padding-top:18px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}@media(max-width:560px){main{padding:24px 20px 40px}.roles{grid-template-columns:1fr;gap:12px}.intro{padding-top:24px}header .eyebrow{font-size:9px}}@media print{body{background:white;color:black;font-size:11pt}main{max-width:none;padding:0}header{padding-bottom:10px}.intro{padding-top:20px}h1{font-size:32pt}.notice,.roles>div,.json{background:none}.roles,li{break-inside:avoid}h2,h3{break-after:avoid}details{display:block}.json{font-size:8pt}}
</style></head>
<body><main>
<header><span class="brand">Relay</span><span class="eyebrow">For the council's own records</span></header>
<div class="intro"><p class="eyebrow">A council proposal, ready for independent review</p><h1>${escape(title)}</h1><p>${escape(actionName)}.</p><p class="muted">Proposal prepared ${escape(proposal.createdAt)}. Registry state was read at Gnosis block ${escape(state.blockNumber)}.</p></div>
<div class="notice"><p><strong>This is a recorded review, not an approval.</strong></p><p>It opens without Relay, an account or a connection. It cannot show later approvals, a later appointment or a changed transaction nonce. Import the public proposal JSON into your own operator and verify it again before signing or executing.</p></div>
<section><p class="eyebrow">The action decoded from the transaction</p><h2>What the council would change</h2>
<div class="roles"><div><p class="eyebrow">${appointment ? "Outgoing steward" : "Departing delegate"}</p><code>${escape(action.outgoing)}</code></div><div><p class="eyebrow">${appointment ? "Incoming steward" : "Incoming delegate"}</p><code>${escape(action.incoming)}</code></div></div><p>${escape(effect)}</p>
<p><strong>${verifiedApprovals} verified ${verifiedApprovals === 1 ? "approval" : "approvals"} recorded; ${state.threshold} required from ${state.owners.length} current delegates.</strong> These counts describe the review used to create this copy, not a fresh network check.</p>
</section>
<section><h2>The reason the libraries were given</h2>${context}<p class="muted">This is unsigned supporting context. Neither this note nor the proposal's descriptive text is included in the Safe transaction hash. Confirm the human reason separately; the signatures authorize only the transaction identified below. A note cannot prove retirement, incapacity or compromise.</p></section>
<section><h2>Review it independently, then pass it on</h2><ol>
<li>Keep this document with the exported public proposal JSON. Read the stewardship agreement and confirm the reported trigger through the libraries' own contacts. Do not exchange private keys.</li>
<li>On your own configured operator, import that JSON and run the proposal review. Compare the registry, council, outgoing and incoming addresses, exact action and transaction hash with this document. ${appointment ? "Read the incoming catalogue and linked agreement before approving the appointment." : "Confirm the incoming delegate's public address through a separate contact channel before approving their council seat."}</li>
<li>Use only the council key you control to approve. Export the newly approved JSON and pass it to the next delegate. A second person must check the same transaction independently; this document is not a substitute for their signature.</li>
<li>When the required current delegates have approved, an executor reviews and submits the same proposal. The executor pays network gas and cannot supply missing council approvals. A changed nonce or appointment requires a new review.</li>
<li>After execution, read the same public catalogue identifier again. ${appointment ? "Verify the incoming steward's first correction and keep a new recovery copy." : "Check the updated council addresses and retain the transaction receipt."} Ask the storage custodian for a fresh postage check; this council action does not renew storage.</li>
</ol></section>
<section><h2>The public details being approved</h2><dl>
<dt>Stable catalogue identifier</dt><dd><code>eip155:100:${escape(state.registry)}</code></dd>
<dt>Catalogue identity</dt><dd><code>${escape(state.catalogueId)}</code></dd>
<dt>Council Safe</dt><dd><code>${escape(state.council)}</code></dd>
<dt>Safe transaction nonce</dt><dd>${escape(review.nonce)}</dd>
<dt>Safe transaction hash</dt><dd><code>${escape(proposal.safeTxHash)}</code></dd>
<dt>Transaction target</dt><dd><code>${escape(proposal.transaction.to)}</code></dd>
<dt>Value transferred by the proposed call, in wei</dt><dd>${escape(proposal.transaction.value)}. Network gas is paid separately.</dd>
${technical}
<dt>Current council delegates at the observed block</dt><dd>${state.owners.map((owner) => `<code>${escape(owner)}</code>`).join("<br>")}</dd>
<dt>Verified approval signers in this review</dt><dd>${review.approvals.length ? review.approvals.map((signer) => `<code>${escape(signer)}</code>`).join("<br>") : "No approvals collected yet."}</dd>
</dl></section>
<section><h2>The public proposal captured for this review</h2><p class="muted">This is the JSON captured for this review, including any public signatures. Use the exported JSON file when passing approvals between delegates. It contains no private signing key. Import and validate it again before taking action.</p><details open><summary>Complete proposal JSON</summary><pre class="json">${escape(JSON.stringify(proposal, null, 2))}</pre></details></section>
<footer>This document records a decoded review, not independent proof of blockchain state or a transfer of custody. Each holder keeps control of their own credentials. The libraries' agreement and the current network state remain the basis for action.</footer>
</main></body></html>`;
}
