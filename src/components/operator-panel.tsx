"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  LoaderCircle,
  Users,
} from "lucide-react";
import type { Proposal } from "../../scripts/council";
import type { StorageQuote } from "../../scripts/storage";
import {
  addressSchema,
  referenceSchema,
  type RegistryState,
  type ResolvedCatalogue,
} from "@/lib/model";
import { readableError } from "@/lib/network";
import {
  operatorRequest,
  savePublicFile,
  type OperatorInfo,
  type CouncilReceipt,
} from "@/lib/operator-client";
import { short } from "@/lib/utils";
import { CouncilProposal } from "./council-proposal";
import { Button } from "./ui/button";
export { operatorRequest, type OperatorInfo } from "@/lib/operator-client";

export function OperatorPanel({
  info,
  current,
  onChanged,
  onInfoChanged,
  proposal,
  onProposalChange: setProposal,
  onBusyChange,
  initialSection = "handoff",
}: {
  info: OperatorInfo;
  current: ResolvedCatalogue | null;
  onChanged: (receipt: CouncilReceipt) => void;
  onInfoChanged: () => Promise<void>;
  proposal: Proposal | null;
  onProposalChange: (proposal: Proposal | null) => void;
  onBusyChange: (busy: string) => void;
  initialSection?: "handoff" | "storage";
}) {
  const [section, setSection] = useState(initialSection);
  const [kind, setKind] = useState<"appoint" | "replace-councillor">("appoint");
  const [incoming, setIncoming] = useState("external");
  const [externalAddress, setExternalAddress] = useState("");
  const [checkpoint, setCheckpoint] = useState("");
  const [incomingTopic, setIncomingTopic] = useState("");
  const [incomingAgreement, setIncomingAgreement] = useState("");
  const [outgoingDelegate, setOutgoingDelegate] = useState("");
  const [newDelegate, setNewDelegate] = useState("");
  const [trigger, setTrigger] = useState<
    "retirement" | "unreachable" | "compromised"
  >("retirement");
  const [decision, setDecision] = useState("");
  const [authority, setAuthority] = useState<RegistryState | null>(null);
  const [authorityError, setAuthorityError] = useState("");
  const [authorityRefresh, setAuthorityRefresh] = useState(0);
  const [days, setDays] = useState("7");
  const [quote, setQuote] = useState<StorageQuote | null>(null);
  const [work, setBusy] = useState("");
  const [councilBusy, setCouncilBusy] = useState("");
  const busy = work || councilBusy;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const running = useRef(false);
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    let active = true;
    setAuthority(null);
    setAuthorityError("");
    // Council authority must remain readable when the outgoing feed is lost.
    void operatorRequest({ action: "registry-state" })
      .then((state: RegistryState) => {
        if (active) setAuthority(state);
      })
      .catch((cause) => {
        if (active) setAuthorityError(readableError(cause));
      });
    return () => {
      active = false;
    };
  }, [info.config.registry, authorityRefresh]);
  const nodeReady = info.mode !== "council" && Boolean(info.storage);
  const aliases = Object.entries(info.config.publishers).filter(
    ([alias, address]) =>
      info.availableIdentities.includes(`publisher-${alias}`) &&
      address.toLowerCase() !== authority?.publisher.toLowerCase(),
  );
  const incomingAddress =
    incoming === "external"
      ? externalAddress
      : info.config.publishers[incoming];
  const selectedOutgoing = authority?.owners.includes(outgoingDelegate)
    ? outgoingDelegate
    : authority?.owners[0] || "";
  async function act(label: string, work: () => Promise<void>) {
    if (running.current || councilBusy) return;
    running.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      running.current = false;
      setBusy("");
    }
  }
  return (
    <div className="operator-panel">
      <div className="operator-tabs">
        <button
          aria-pressed={section === "handoff"}
          disabled={Boolean(busy)}
          onClick={() => setSection("handoff")}
        >
          Council & handoffs
        </button>
        <button
          aria-pressed={section === "storage"}
          disabled={Boolean(busy)}
          onClick={() => setSection("storage")}
        >
          Renew storage
        </button>
      </div>
      <div className="operator-node">
        <Users size={16} />
        <span>
          {info.mode === "council"
            ? "Independent council session"
            : "Configured operator"}
        </span>
        <span>
          {
            info.availableIdentities.filter((alias) =>
              alias.startsWith("council-"),
            ).length
          }{" "}
          council key(s) installed here
        </span>
      </div>
      {section === "handoff" ? (
        <>
          <button
            className="text-button"
            onClick={() =>
              savePublicFile(
                "relay-public-configuration.json",
                JSON.stringify(info.config, null, 2) + "\n",
              )
            }
          >
            <ArrowDownToLine size={14} />
            Download public setup for another holder
          </button>
          <p className="quiet-note">
            The setup file contains public addresses only. Each holder installs
            their own key and opens the council desk with{" "}
            <code>npm run council:start</code>. A council delegate does not need
            the storage node.
          </p>
          <CouncilProposal
            info={info}
            current={current}
            proposal={proposal}
            onChange={setProposal}
            blocked={Boolean(work)}
            onBusyChange={setCouncilBusy}
            onExecuted={(receipt) => {
              setProposal(null);
              setCheckpoint("");
              setAuthorityRefresh((value) => value + 1);
              onChanged(receipt);
            }}
          />
          {!current && (
            <p className="quiet-note">
              The outgoing catalogue has not been resolved. Council review uses
              the registry and the incoming steward's feed, so an unavailable
              outgoing feed does not prevent a handoff.
            </p>
          )}
          {authorityError && (
            <p role="alert" className="form-error">
              {authorityError}{" "}
              <button
                className="text-button"
                disabled={Boolean(busy)}
                onClick={() => setAuthorityRefresh((value) => value + 1)}
              >
                Retry council authority
              </button>
            </p>
          )}
          <details className="prepare-handoff" open={!proposal}>
            <summary>Prepare a new council decision</summary>
            <label className="form-label">
              What is changing?
              <select
                value={kind}
                disabled={Boolean(busy)}
                onChange={(event) => {
                  setKind(event.target.value as typeof kind);
                  setProposal(null);
                }}
              >
                <option value="appoint">The catalogue steward</option>
                <option value="replace-councillor">A council delegate</option>
              </select>
            </label>
            {kind === "appoint" ? (
              <>
                <label className="form-label">
                  Incoming steward
                  <select
                    value={incoming}
                    disabled={Boolean(busy)}
                    onChange={(event) => {
                      setIncoming(event.target.value);
                      setCheckpoint("");
                      setProposal(null);
                    }}
                  >
                    <option value="external">
                      A steward with their own publishing key
                    </option>
                    {aliases.map(([alias, address]) => (
                      <option value={alias} key={alias}>
                        Configured steward {alias.toUpperCase()} -{" "}
                        {short(address, 4)}
                      </option>
                    ))}
                  </select>
                </label>
                {incoming === "external" ? (
                  <>
                    <p className="quiet-note">
                      Ask the incoming steward for their public publishing
                      address and starting catalogue reference. Their private
                      key stays with them. The proposal checks that their signed
                      feed opens the correct catalogue.
                    </p>
                    <label className="form-label">
                      Incoming public address
                      <input
                        value={externalAddress}
                        disabled={Boolean(busy)}
                        placeholder="0x..."
                        onChange={(event) => {
                          setExternalAddress(event.target.value.trim());
                          setProposal(null);
                        }}
                      />
                    </label>
                    <label className="form-label">
                      Starting catalogue reference
                      <input
                        value={checkpoint}
                        disabled={Boolean(busy)}
                        placeholder="The Swarm reference supplied by the incoming steward"
                        onChange={(event) => {
                          setCheckpoint(event.target.value.trim());
                          setProposal(null);
                        }}
                      />
                    </label>
                    <details>
                      <summary>Incoming feed uses a different topic</summary>
                      <label className="form-label">
                        Feed topic
                        <input
                          value={incomingTopic}
                          disabled={Boolean(busy)}
                          placeholder={authority?.topic || "0x..."}
                          onChange={(event) => {
                            setIncomingTopic(event.target.value.trim());
                            setProposal(null);
                          }}
                        />
                      </label>
                    </details>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    disabled={
                      !current || !incoming || !nodeReady || Boolean(busy)
                    }
                    onClick={() =>
                      act(
                        "Publishing the incoming starting catalogue",
                        async () => {
                          if (!current) return;
                          const catalogue = {
                            ...current.catalogue,
                            publisher: info.config.publishers[incoming],
                            revision: 0,
                            previous: null,
                            updatedAt: new Date().toISOString(),
                            change:
                              "The incoming steward prepares the retained catalogue for council review.",
                          };
                          const result = await operatorRequest({
                            action: "stage",
                            identity: `publisher-${incoming}`,
                            catalogue,
                          });
                          setCheckpoint(result.reference);
                          setProposal(null);
                          setNotice(
                            "The incoming feed has been read back. The appointed steward has not changed.",
                          );
                        },
                      )
                    }
                  >
                    {checkpoint ? (
                      <Check size={15} />
                    ) : (
                      <ArrowRight size={15} />
                    )}
                    Prepare the incoming catalogue
                  </Button>
                )}
                <label className="form-label">
                  Reason the committee is beginning a handoff
                  <select
                    value={trigger}
                    disabled={Boolean(busy)}
                    onChange={(event) => {
                      setTrigger(event.target.value as typeof trigger);
                      setProposal(null);
                    }}
                  >
                    <option value="retirement">
                      The steward has given retirement notice
                    </option>
                    <option value="unreachable">
                      The agreed period without contact has passed
                    </option>
                    <option value="compromised">
                      The publishing key is lost or compromised
                    </option>
                  </select>
                </label>
                <label className="form-label">
                  Public decision note
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={decision}
                    disabled={Boolean(busy)}
                    placeholder="Record what the committee checked and why responsibility is changing."
                    onChange={(event) => {
                      setDecision(event.target.value);
                      setProposal(null);
                    }}
                  />
                </label>
                <p className="quiet-note">
                  This note travels with the proposal for human review. The
                  signatures authorize the exact appointment transaction; they
                  do not authenticate this supporting note.
                </p>
                <details className="proposal-details">
                  <summary>The committee has adopted a new agreement</summary>
                  <p className="quiet-note">
                    Leave this empty to retain the current agreement. If the
                    committee has published a replacement, enter its Swarm
                    reference. Each delegate can read the exact document in the
                    proposal review before approving its adoption.
                  </p>
                  <label className="form-label">
                    Replacement agreement reference
                    <input
                      value={incomingAgreement}
                      placeholder={authority?.agreement || "Swarm reference"}
                      disabled={Boolean(busy)}
                      onChange={(event) => {
                        setIncomingAgreement(event.target.value.trim());
                        setProposal(null);
                      }}
                    />
                  </label>
                </details>
                <Button
                  disabled={
                    !authority ||
                    Boolean(busy) ||
                    decision.trim().length < 10 ||
                    !addressSchema.safeParse(incomingAddress).success ||
                    !referenceSchema.safeParse(checkpoint).success ||
                    !referenceSchema.safeParse(
                      incomingAgreement || authority?.agreement,
                    ).success
                  }
                  onClick={() =>
                    act(
                      "Verifying the incoming feed and preparing the decision",
                      async () => {
                        if (!authority) return;
                        setProposal(
                          await operatorRequest({
                            action: "propose",
                            incoming: incomingAddress,
                            checkpoint,
                            agreement: incomingAgreement || authority.agreement,
                            ...(incoming === "external" && incomingTopic
                              ? { topic: incomingTopic }
                              : {}),
                            context: { trigger, note: decision.trim() },
                          }),
                        );
                      },
                    )
                  }
                >
                  Prepare council proposal <ArrowRight size={15} />
                </Button>
              </>
            ) : (
              <>
                <p className="quiet-note">
                  The current council approves the replacement under its
                  existing threshold. The publishing identity and public
                  catalogue address stay the same.
                </p>
                <label className="form-label">
                  Departing delegate
                  <select
                    value={selectedOutgoing}
                    disabled={Boolean(busy)}
                    onChange={(event) => {
                      setOutgoingDelegate(event.target.value);
                      setProposal(null);
                    }}
                  >
                    {authority?.owners.map((owner) => (
                      <option key={owner}>{owner}</option>
                    ))}
                  </select>
                </label>
                <label className="form-label">
                  Incoming delegate's public address
                  <input
                    value={newDelegate}
                    disabled={Boolean(busy)}
                    placeholder="0x..."
                    onChange={(event) => {
                      setNewDelegate(event.target.value.trim());
                      setProposal(null);
                    }}
                  />
                </label>
                <Button
                  disabled={
                    !authority ||
                    Boolean(busy) ||
                    !addressSchema.safeParse(newDelegate).success
                  }
                  onClick={() =>
                    act("Preparing the delegate replacement", async () => {
                      setProposal(
                        await operatorRequest({
                          action: "replace-councillor",
                          outgoing: selectedOutgoing,
                          incoming: newDelegate,
                        }),
                      );
                    })
                  }
                >
                  Prepare delegate replacement <ArrowRight size={15} />
                </Button>
              </>
            )}
          </details>
        </>
      ) : (
        <>
          {info.storage ? (
            <div className="operator-step">
              <p className="small-label">CURRENT NODE OBSERVATION</p>
              <h3>{Number(info.storage.bzz).toFixed(4)} xBZZ</h3>
              <p>
                Checked {new Date(info.storage.observedAt).toLocaleString()}
              </p>
              {info.storage.batches
                .filter((batch) => batch.id === info.config.batchId)
                .map((batch) => (
                  <p key={batch.id}>
                    {(batch.remainingSeconds / 86400).toFixed(1)} days estimated
                    at this observation
                  </p>
                ))}
            </div>
          ) : (
            <p className="quiet-note">
              {info.mode === "council"
                ? "Storage renewal belongs to the node custodian. This independent council session can review, approve and record appointments without that node."
                : info.storageError ||
                  "Request a fresh node observation before reviewing renewal."}
            </p>
          )}
          <Button
            variant="outline"
            disabled={Boolean(busy)}
            onClick={() =>
              act("Refreshing the node observation", onInfoChanged)
            }
          >
            Refresh observation
          </Button>
          {info.mode !== "council" && (
            <>
              <p className="quiet-note">
                Extend the existing postage batch. Its ownership remains with
                the storage custodian after a publishing handoff.
              </p>
              <label className="form-label">
                Additional days
                <input
                  type="number"
                  step="0.125"
                  min="0.125"
                  max="365"
                  value={days}
                  disabled={Boolean(busy)}
                  onChange={(event) => {
                    setDays(event.target.value);
                    setQuote(null);
                  }}
                />
              </label>
              <Button
                variant="outline"
                disabled={Boolean(busy) || !nodeReady}
                onClick={() =>
                  act("Getting a current postage quote", async () => {
                    setQuote(
                      await operatorRequest({
                        action: "quote",
                        days: Number(days),
                      }),
                    );
                  })
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
                    Reviewed spend for approximately {quote.days} additional
                    days. Network gas is additional. Quote expires{" "}
                    {new Date(quote.expiresAt).toLocaleTimeString()}.
                  </p>
                  <Button
                    disabled={Boolean(busy)}
                    onClick={() =>
                      act("Renewing the existing batch", async () => {
                        const reviewed = quote;
                        setQuote(null);
                        const result = await operatorRequest({
                          action: "renew",
                          quoteId: reviewed.id,
                        });
                        setNotice(
                          `Renewal recorded for the same batch ${result.batchId}.`,
                        );
                        await onInfoChanged();
                      })
                    }
                  >
                    Confirm the reviewed renewal
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
      {work && (
        <p className="operator-busy" role="status">
          <LoaderCircle size={16} className="spin" />
          {work}
        </p>
      )}
      {notice && (
        <p className="operator-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
