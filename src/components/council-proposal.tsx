"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  FileText,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import type { Proposal, ProposalReview } from "../../scripts/council";
import type { ResolvedCatalogue } from "@/lib/model";
import {
  operatorRequest,
  savePublicFile,
  type OperatorInfo,
  type CouncilReceipt,
} from "@/lib/operator-client";
import { proposalDocument } from "@/lib/proposal-document";
import { readableError } from "@/lib/network";
import { Button } from "./ui/button";
import { IncomingPublication } from "./incoming-publication";

export function CouncilProposal({
  info,
  current,
  proposal,
  onChange,
  onExecuted,
  blocked = false,
  onBusyChange,
}: {
  info: OperatorInfo;
  current: ResolvedCatalogue | null;
  proposal: Proposal | null;
  onChange: (proposal: Proposal | null) => void;
  onExecuted: (receipt: CouncilReceipt) => void;
  blocked?: boolean;
  onBusyChange: (busy: string) => void;
}) {
  const [review, setReview] = useState<ProposalReview | null>(null);
  const [work, setBusy] = useState("");
  const [checking, setChecking] = useState(false);
  const busy =
    work || (checking ? "Verifying the public transaction and approvals" : "");
  const [error, setError] = useState("");
  const [delegate, setDelegate] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const mounted = useRef(true);
  const running = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    let active = true;
    setReview(null);
    setConfirmed(false);
    setError("");
    setChecking(Boolean(proposal));
    if (!proposal) return;
    void operatorRequest({ action: "review-proposal", proposal })
      .then((value: ProposalReview) => {
        if (active) setReview(value);
      })
      .catch((cause) => {
        if (active) setError(readableError(cause));
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [proposal, current]);
  const eligible = Object.entries(info.config.councilOwners).filter(
    ([alias, address]) =>
      info.availableIdentities.includes(`council-${alias}`) &&
      review?.state.owners.some(
        (owner) => owner.toLowerCase() === address.toLowerCase(),
      ) &&
      !review.approvals.some(
        (signer) => signer.toLowerCase() === address.toLowerCase(),
      ),
  );
  const selected = eligible.some(([alias]) => alias === delegate)
    ? delegate
    : eligible[0]?.[0] || "";
  async function act(label: string, work: () => Promise<void>) {
    if (running.current || blocked || checking) return;
    running.current = true;
    setBusy(label);
    setError("");
    try {
      await work();
    } catch (cause) {
      if (mounted.current) setError(readableError(cause));
    } finally {
      running.current = false;
      if (mounted.current) setBusy("");
    }
  }
  const state = review?.state;
  const action = review?.appointment || review?.replacement;
  return (
    <section className="council-workbench">
      <div className="workbench-heading">
        <div>
          <p className="eyebrow">PASS THE PROPOSAL, KEEP YOUR KEY</p>
          <h3>Council review</h3>
        </div>
        <ShieldCheck size={24} />
      </div>
      <p className="quiet-note">
        Each delegate opens the same proposal on their own computer, checks its
        actual transaction, adds their approval and passes the file onward. The
        final executor sends the approved transaction.
      </p>
      <label className="form-label">
        Open a proposal from another delegate
        <input
          type="file"
          accept="application/json,.json"
          disabled={blocked || Boolean(busy)}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void act("Checking the imported proposal", async () => {
              if (file.size > 256_000)
                throw new Error(
                  "Choose a proposal JSON file smaller than 256 KB.",
                );
              const candidate: unknown = JSON.parse(await file.text());
              const verified: ProposalReview = await operatorRequest({
                action: "review-proposal",
                proposal: candidate,
              });
              if (mounted.current) onChange(verified.proposal);
            });
          }}
        />
      </label>
      {proposal && (
        <div className="button-row">
          <Button
            variant="outline"
            onClick={() =>
              savePublicFile(
                `relay-proposal-${proposal.safeTxHash.slice(2, 14)}.json`,
                JSON.stringify(proposal, null, 2) + "\n",
              )
            }
          >
            <ArrowDownToLine size={15} /> Save current proposal file
          </Button>
          <Button
            variant="outline"
            disabled={blocked || Boolean(busy)}
            onClick={() => onChange({ ...proposal })}
          >
            Verify again
          </Button>
          <p className="quiet-note">
            Your collected approvals remain available to save if a fresh network
            review fails. Every holder must recheck the proposal before using
            it.
          </p>
        </div>
      )}
      {busy && (
        <p role="status" className="operator-busy">
          <LoaderCircle size={15} className="spin" />
          {busy}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {review && state && action && (
        <>
          <div className="proposal-action">
            <p className="small-label">
              {review.appointment
                ? "CHANGE THE CATALOGUE STEWARD"
                : "REPLACE A COUNCIL DELEGATE"}
            </p>
            <dl className="proposal-summary">
              <div>
                <dt>Responsibility leaves</dt>
                <dd>
                  <code>{action.outgoing}</code>
                </dd>
              </div>
              <div>
                <dt>Responsibility passes to</dt>
                <dd>
                  <code>{action.incoming}</code>
                </dd>
              </div>
              <div>
                <dt>Approvals required</dt>
                <dd>
                  {state.threshold} of {state.owners.length} current delegates
                </dd>
              </div>
              <div>
                <dt>Verified approvals</dt>
                <dd>
                  {review.approvals.length} of {state.threshold}
                  {review.approvals.map((signer) => (
                    <code className="approval-address" key={signer}>
                      {signer}
                    </code>
                  ))}
                </dd>
              </div>
              <div>
                <dt>Catalogue stays at</dt>
                <dd>
                  <code>{review.proposal.registry}</code>
                </dd>
              </div>
            </dl>
          </div>
          {review.proposal.context && (
            <div className="decision-note">
              <p className="small-label">SHARED DECISION NOTE</p>
              <strong>{review.proposal.context.trigger}</strong>
              <p>{review.proposal.context.note}</p>
              <p className="quiet-note">
                This supporting note is unsigned. Confirm it with the committee;
                the Safe approvals authorize the transaction shown below.
              </p>
            </div>
          )}
          <details className="proposal-details">
            <summary>Inspect the exact public transaction</summary>
            <dl className="proposal-summary">
              <div>
                <dt>Council</dt>
                <dd>
                  <code>{review.proposal.council}</code>
                </dd>
              </div>
              <div>
                <dt>Safe transaction hash</dt>
                <dd>
                  <code>{review.proposal.safeTxHash}</code>
                </dd>
              </div>
              <div>
                <dt>Council transaction number</dt>
                <dd>{review.nonce}</dd>
              </div>
              {review.appointment && (
                <>
                  <div>
                    <dt>Expected succession revision</dt>
                    <dd>{review.appointment.expectedRevision}</dd>
                  </div>
                  <div>
                    <dt>Incoming feed topic</dt>
                    <dd>
                      <code>{review.appointment.topic}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Verified incoming catalogue</dt>
                    <dd>
                      <code>{review.appointment.checkpoint}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Linked agreement</dt>
                    <dd>
                      <code>{review.appointment.agreement}</code>
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </details>
          <div className="button-row">
            <Button
              variant="outline"
              onClick={() =>
                savePublicFile(
                  "relay-council-review.html",
                  proposalDocument(review),
                  "text/html;charset=utf-8",
                )
              }
            >
              <FileText size={15} />
              Save readable review
            </Button>
          </div>
          {review.incomingPublication && (
            <details className="proposal-details">
              <summary>Read the incoming catalogue and its agreement</summary>
              <IncomingPublication publication={review.incomingPublication} />
            </details>
          )}
          <label className="review-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={blocked || Boolean(busy)}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              I have checked the intended successor or delegate, the committee's
              decision and the exact transaction.
            </span>
          </label>
          {eligible.length > 0 && (
            <label className="form-label">
              Your signing identity on this computer
              <select
                value={selected}
                disabled={blocked || Boolean(busy)}
                onChange={(event) => setDelegate(event.target.value)}
              >
                {eligible.map(([alias, address]) => (
                  <option key={alias} value={alias}>
                    Delegate {alias} - {address}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="button-row">
            <Button
              variant="outline"
              disabled={blocked || Boolean(busy) || !selected || !confirmed}
              onClick={() =>
                act("Adding your approval", async () => {
                  const next: Proposal = await operatorRequest({
                    action: "approve",
                    proposal: review.proposal,
                    identity: `council-${selected}`,
                  });
                  if (mounted.current) onChange(next);
                })
              }
            >
              <Check size={15} />
              Add my approval
            </Button>
            <Button
              disabled={
                blocked ||
                Boolean(busy) ||
                !confirmed ||
                !info.availableIdentities.includes("executor") ||
                review.approvals.length < state.threshold
              }
              onClick={() =>
                act(
                  "Sending and verifying the approved transaction",
                  async () => {
                    const receipt: CouncilReceipt = await operatorRequest({
                      action: "execute",
                      proposal: review.proposal,
                    });
                    if (mounted.current) {
                      onChange(null);
                      onExecuted(receipt);
                    }
                  },
                )
              }
            >
              Record approved handoff
            </Button>
          </div>
          {!selected && (
            <p className="quiet-note">
              There is no remaining approval to add with the council keys
              installed here. Save this proposal and pass it to another current
              delegate or the executor.
            </p>
          )}
          <p className="quiet-note">
            Approving signs the transaction without spending gas. Recording it
            spends the configured executor's gas, capped at 0.0001 xDAI. Every
            action rechecks the council, nonce and incoming catalogue.
          </p>
        </>
      )}
    </section>
  );
}
