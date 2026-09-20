"use client";
import { useState } from "react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import type { Config } from "../../scripts/context";
import type { Proposal } from "../../scripts/council";
import type { StorageQuote } from "../../scripts/storage";
import type { ResolvedCatalogue } from "@/lib/model";
import { readableError } from "@/lib/network";
import { short } from "@/lib/utils";
import { Button } from "./ui/button";

export type OperatorInfo = {
  config: Config;
  storage: {
    bzz: string;
    xdai: string;
    mode: string;
    observedAt: string;
    batches: { id: string; remainingSeconds: number }[];
  };
};
export async function operatorRequest(body: unknown) {
  const response = await fetch("/api/operator", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Operation failed.");
  return result;
}
export function OperatorPanel({
  info,
  current,
  onChanged,
}: {
  info: OperatorInfo;
  current: ResolvedCatalogue | null;
  onChanged: () => void;
}) {
  const [section, setSection] = useState<"handoff" | "storage">("handoff");
  const [incoming, setIncoming] = useState(""),
    [checkpoint, setCheckpoint] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null),
    [delegate, setDelegate] = useState("1");
  const [days, setDays] = useState("1"),
    [quote, setQuote] = useState<StorageQuote | null>(null);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const aliases = Object.entries(info.config.publishers).filter(
    ([, address]) =>
      address.toLowerCase() !== current?.state.publisher.toLowerCase(),
  );
  async function act(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="operator-panel">
      <div className="operator-tabs">
        <button
          aria-pressed={section === "handoff"}
          onClick={() => setSection("handoff")}
        >
          Handoff
        </button>
        <button
          aria-pressed={section === "storage"}
          onClick={() => setSection("storage")}
        >
          Renew storage
        </button>
      </div>
      <div className="operator-node">
        <span className="status-dot" />
        {info.storage.mode} node connected
        <span>{Number(info.storage.bzz).toFixed(4)} xBZZ</span>
      </div>
      {section === "handoff" ? (
        <>
          {!current && (
            <p className="form-error">
              Verify the current catalogue before preparing a handoff.
            </p>
          )}
          <label className="form-label">
            Incoming demo steward
            <select
              value={incoming}
              disabled={Boolean(busy)}
              onChange={(e) => {
                setIncoming(e.target.value);
                setCheckpoint("");
                setProposal(null);
              }}
            >
              <option value="">Choose a distinct publishing identity</option>
              {aliases.map(([key, address]) => (
                <option key={key} value={key}>
                  Steward {key.toUpperCase()} - {short(address, 4)}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            disabled={!incoming || !current || Boolean(busy)}
            onClick={() =>
              act("Staging the incoming catalogue", async () => {
                const catalogue = {
                  ...current!.catalogue,
                  publisher: info.config.publishers[incoming],
                  revision: 0,
                  previous: null,
                  updatedAt: new Date().toISOString(),
                  change:
                    "Incoming steward stages a catalogue copy for a voluntary handoff.",
                };
                const result = await operatorRequest({
                  action: "stage",
                  identity: `publisher-${incoming}`,
                  catalogue,
                });
                setCheckpoint(result.reference);
                setNotice(
                  "Incoming feed published and read back. The appointment has not changed.",
                );
              })
            }
          >
            {checkpoint ? <Check size={15} /> : <ArrowRight size={15} />}Stage
            incoming feed
          </Button>
          {checkpoint && (
            <div className="operator-step">
              <p className="small-label">VERIFIED INCOMING CHECKPOINT</p>
              <code>{checkpoint}</code>
              <Button
                disabled={Boolean(busy) || Boolean(proposal)}
                onClick={() =>
                  act("Preparing the appointment", async () => {
                    setProposal(
                      await operatorRequest({
                        action: "propose",
                        incoming: info.config.publishers[incoming],
                        checkpoint,
                        agreement: current!.state.agreement,
                      }),
                    );
                  })
                }
              >
                Prepare council proposal
              </Button>
            </div>
          )}
          {proposal && (
            <div className="operator-step">
              <h3>Review the appointment</h3>
              <dl className="proposal-summary">
                <div>
                  <dt>Incoming address</dt>
                  <dd>{info.config.publishers[incoming]}</dd>
                </div>
                <div>
                  <dt>Safe transaction</dt>
                  <dd>{proposal.safeTxHash}</dd>
                </div>
                <div>
                  <dt>Approvals collected</dt>
                  <dd>
                    {proposal.signatures.length} / {current?.state.threshold}
                  </dd>
                </div>
              </dl>
              <label className="form-label">
                Council signing identity
                <select
                  value={delegate}
                  disabled={Boolean(busy)}
                  onChange={(e) => setDelegate(e.target.value)}
                >
                  {Object.entries(info.config.councilOwners)
                    .filter(([, address]) =>
                      current?.state.owners.some(
                        (a) => a.toLowerCase() === address.toLowerCase(),
                      ),
                    )
                    .map(([key, address]) => (
                      <option key={key} value={key}>
                        Delegate {key} - {short(address, 4)}
                      </option>
                    ))}
                </select>
              </label>
              <div className="button-row">
                <Button
                  variant="outline"
                  disabled={
                    Boolean(busy) ||
                    proposal.signatures.some(
                      (s) =>
                        s.signer.toLowerCase() ===
                        info.config.councilOwners[delegate]?.toLowerCase(),
                    )
                  }
                  onClick={() =>
                    act("Signing the reviewed proposal", async () =>
                      setProposal(
                        await operatorRequest({
                          action: "approve",
                          proposal,
                          identity: `council-${delegate}`,
                        }),
                      ),
                    )
                  }
                >
                  Approve with delegate {delegate}
                </Button>
                <Button
                  disabled={
                    Boolean(busy) ||
                    proposal.signatures.length < (current?.state.threshold || 2)
                  }
                  onClick={() =>
                    act("Executing and verifying the appointment", async () => {
                      const result = await operatorRequest({
                        action: "execute",
                        proposal,
                      });
                      setProposal(null);
                      setCheckpoint("");
                      setNotice(
                        `Appointment verified. Transaction ${result.hash}`,
                      );
                      onChanged();
                    })
                  }
                >
                  Execute appointment
                </Button>
              </div>
              <p className="quiet-note">
                Execution spends network gas from the configured executor,
                capped at 0.0001 xDAI per transaction. The incoming feed becomes
                authoritative only after this succeeds.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="quiet-note">
            Extend the currently selected batch. Storage does not transfer to
            the new publishing identity.
          </p>
          <label className="form-label">
            Additional days
            <input
              type="number"
              step="0.125"
              min="0.125"
              max="365"
              value={days}
              onChange={(e) => {
                setDays(e.target.value);
                setQuote(null);
              }}
            />
          </label>
          <Button
            variant="outline"
            disabled={Boolean(busy)}
            onClick={() =>
              act("Getting a current postage quote", async () =>
                setQuote(
                  await operatorRequest({
                    action: "quote",
                    days: Number(days),
                  }),
                ),
              )
            }
          >
            Get renewal quote
          </Button>
          {quote && (
            <div className="operator-step">
              <p className="small-label">EXISTING BATCH</p>
              <code>{quote.batchId}</code>
              <h3>{Number(quote.bzz).toFixed(6)} xBZZ</h3>
              <p>
                Estimated cost for {quote.days} additional days. Gnosis gas is
                additional. Quote expires{" "}
                {new Date(quote.expiresAt).toLocaleTimeString()}.
              </p>
              <Button
                disabled={Boolean(busy)}
                onClick={() =>
                  act("Renewing and checking the batch", async () => {
                    await operatorRequest({
                      action: "renew",
                      quoteId: quote.id,
                    });
                    setQuote(null);
                    setNotice(
                      "The existing batch's increased balance was verified. See the live receipt in the local evidence folder.",
                    );
                  })
                }
              >
                Confirm & renew existing batch
              </Button>
            </div>
          )}
        </>
      )}
      {busy && (
        <p className="operator-progress" role="status">
          <LoaderCircle size={16} className="spin" />
          {busy}...
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
