"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Copy,
  FileText,
  Fingerprint,
  KeyRound,
  Library,
  LoaderCircle,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  Sprout,
  Users,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import {
  OperatorPanel,
  type OperatorInfo,
  operatorRequest,
} from "./operator-panel";
import {
  DEFAULT_GATEWAY,
  bytesAt,
  gatewayOrigin,
  readableError,
  resolveCatalogue,
} from "@/lib/network";
import {
  type Catalogue,
  type CatalogueRecord,
  type ResolvedCatalogue,
  addressSchema,
} from "@/lib/model";
import { demoSchema, deploymentAddressSchema, type Demo } from "@/lib/demo";
import { short } from "@/lib/utils";
import { recoveryDocument } from "@/lib/recovery";
import { AgreementText } from "./agreement-text";
import { CorrectionInbox } from "./correction-inbox";
import type { Proposal } from "../../scripts/council";
import type {
  CouncilReceipt,
  StorageReceipt,
  PublicationReceipt,
} from "@/lib/operator-client";

type Tab = "catalogue" | "stewardship" | "handoffs" | "storage";
export function downloadFile(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function date(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
const tabNames: Record<Tab, string> = {
  catalogue: "Catalogue",
  stewardship: "Stewardship",
  handoffs: "Handoff record",
  storage: "Storage",
};
export function RelayApp() {
  const [tab, setTab] = useState<Tab>("catalogue");
  const [demo, setDemo] = useState<Demo | null>(null);
  const [registry, setRegistry] = useState("");
  const [registryInput, setRegistryInput] = useState("");
  const [appliedGateway, setAppliedGateway] = useState(DEFAULT_GATEWAY);
  const [appliedRpc, setAppliedRpc] = useState("");
  const activeConnection = useRef({
    registry: "",
    gateway: DEFAULT_GATEWAY,
    rpc: "",
  });
  const loadId = useRef(0);
  const mounted = useRef(false);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [resolved, setResolved] = useState<ResolvedCatalogue | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [gateway, setGateway] = useState(DEFAULT_GATEWAY),
    [rpc, setRpc] = useState("");
  const [settings, setSettings] = useState(false),
    [operatorOpen, setOperatorOpen] = useState(false);
  const [operator, setOperator] = useState<OperatorInfo | null>(null);
  const [operatorBusy, setOperatorBusy] = useState("");
  const [operatorProposal, setOperatorProposal] = useState<Proposal | null>(
    null,
  );
  const operatorLoadId = useRef(0);
  const [publicationReceipt, setPublicationReceipt] = useState<{
    registry: string;
    receipt: PublicationReceipt;
  } | null>(null);
  const [storageReceipt, setStorageReceipt] = useState<StorageReceipt | null>(
    null,
  );
  const [councilReceipt, setCouncilReceipt] = useState<CouncilReceipt | null>(
    null,
  );
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [query, setQuery] = useState(""),
    [collection, setCollection] = useState("all"),
    [condition, setCondition] = useState("all");
  const [selected, setSelected] = useState<CatalogueRecord | null>(null),
    [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [agreementOpen, setAgreementOpen] = useState(false);
  // Deployment receipts describe one catalogue. They never supply authority
  // or storage observations for a reader-selected registry.
  const deployment =
    demo &&
    demo.registry.toLowerCase() === registry.toLowerCase() &&
    (!resolved ||
      demo.catalogueId.toLowerCase() ===
        resolved.state.catalogueId.toLowerCase())
      ? demo
      : null;
  const matchingAgreement =
    deployment && resolved?.state.agreement === deployment.agreement;
  const activeOperator =
    operator &&
    operator.config.registry?.toLowerCase() === registry.toLowerCase() &&
    (!resolved ||
      operator.config.catalogueId.toLowerCase() ===
        resolved.state.catalogueId.toLowerCase())
      ? operator
      : null;
  const stableIdentifier = registry ? `eip155:100:${registry}` : "";
  const configuredBatch = activeOperator?.config.batchId;
  const operatorBatch = activeOperator?.storage?.batches.find(
    (batch) => batch.id === configuredBatch,
  );
  const storageObservation =
    activeOperator?.storage && operatorBatch
      ? {
          payer: activeOperator.config.payer,
          batchId: operatorBatch.id,
          remainingSeconds: operatorBatch.remainingSeconds,
          observedAt: activeOperator.storage.observedAt,
        }
      : deployment
        ? {
            payer: deployment.payer,
            batchId: deployment.batchId,
            ...deployment.storage,
          }
        : null;
  async function reloadOperator() {
    const requestId = ++operatorLoadId.current;
    const response = await fetch("/api/operator", { cache: "no-store" });
    if (!response.ok)
      throw new Error("The configured operator could not be reached.");
    const info: OperatorInfo = await response.json();
    if (mounted.current && operatorLoadId.current === requestId)
      setOperator(info);
  }
  async function downloadRecovery() {
    if (!resolved) return;
    const snapshot = resolved;
    setRecoveryBusy(true);
    setRecoveryError("");
    try {
      const agreement = new TextDecoder("utf-8", { fatal: true }).decode(
        await bytesAt(snapshot.gateway, snapshot.state.agreement, 256_000),
      );
      const url = URL.createObjectURL(
        new Blob([recoveryDocument(snapshot, agreement)], {
          type: "text/html;charset=utf-8",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "relay-reading-and-recovery-copy.html";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setRecoveryError(
        `The complete copy could not be prepared. ${readableError(error)}`,
      );
    } finally {
      setRecoveryBusy(false);
    }
  }
  async function refresh(
    registryValue = registry,
    gatewayValue = appliedGateway,
    rpcValue = appliedRpc,
    expected?: { reference: string; feedIndex: string; publisher: string },
  ) {
    if (!registryValue) return;
    let address: string, endpoint: string;
    try {
      address = addressSchema.parse(registryValue.trim());
      endpoint = gatewayOrigin(gatewayValue);
    } catch (error) {
      setError(readableError(error));
      setBusy(false);
      return;
    }
    const requestId = ++loadId.current;
    const isCurrent = () => mounted.current && loadId.current === requestId;
    activeConnection.current = {
      registry: address,
      gateway: endpoint,
      rpc: rpcValue,
    };
    setRegistry(address);
    setRegistryInput(address);
    setAppliedGateway(endpoint);
    setAppliedRpc(rpcValue);
    setBusy(true);
    setError("");
    setResolved(null);
    setCatalogue(null);
    setSelected(null);
    setRecoveryError("");
    if (address.toLowerCase() !== registry.toLowerCase()) {
      setCollection("all");
      setCondition("all");
      setQuery("");
    }
    try {
      const result = await resolveCatalogue(
        address,
        endpoint,
        rpcValue || undefined,
      );
      if (!isCurrent()) return;
      if (
        expected &&
        result.state.publisher.toLowerCase() ===
          expected.publisher.toLowerCase() &&
        (BigInt(result.feedIndex) < BigInt(expected.feedIndex) ||
          (result.feedIndex === expected.feedIndex &&
            result.reference !== expected.reference))
      ) {
        throw new Error(
          "Your signed update was stored, but this gateway has not discovered it yet. Refresh shortly; do not republish the correction.",
        );
      }
      setResolved(result);
      setCatalogue(result.catalogue);
    } catch (e) {
      if (isCurrent()) setError(readableError(e));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }
  function refreshAfterOperation(
    operationRegistry: string,
    expected?: { reference: string; feedIndex: string; publisher: string },
  ) {
    const connection = activeConnection.current;
    // A completed operation belongs to the catalogue on which it began. It
    // must not switch a reader who has since opened a different catalogue.
    if (
      !mounted.current ||
      connection.registry.toLowerCase() !== operationRegistry.toLowerCase()
    )
      return;
    setSelected(null);
    void refresh(
      connection.registry,
      connection.gateway,
      connection.rpc,
      expected,
    );
  }
  function publicationCompleted(
    operationRegistry: string,
    receipt: PublicationReceipt,
  ) {
    if (
      mounted.current &&
      activeConnection.current.registry.toLowerCase() ===
        operationRegistry.toLowerCase()
    ) {
      setPublicationReceipt({ registry: operationRegistry, receipt });
    }
    refreshAfterOperation(operationRegistry, receipt);
  }
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const initialLoadId = loadId.current;
    const custom = new URLSearchParams(window.location.search).get("registry");
    // The public network is the only catalogue source. A custom address does
    // not wait for deployment metadata, and no bundled snapshot is read.
    if (custom) {
      setRegistryInput(custom);
      void refresh(custom);
    }
    (async () => {
      try {
        const response = await fetch("/demo.json", {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
          throw new Error(
            "The demonstration deployment is not configured yet.",
          );
        const data: unknown = await response.json();
        if (!active) return;
        const metadata = demoSchema.safeParse(data);
        if (metadata.success) setDemo(metadata.data);
        if (!custom && loadId.current === initialLoadId)
          await refresh(deploymentAddressSchema.parse(data).registry);
      } catch (e) {
        if (active && !custom && loadId.current === initialLoadId) {
          setError(readableError(e));
          setBusy(false);
        }
      }
    })();
    if (["localhost", "127.0.0.1"].includes(window.location.hostname))
      void reloadOperator().catch(() => {});
    return () => {
      active = false;
      mounted.current = false;
      loadId.current++;
      operatorLoadId.current++;
    };
    // Initial endpoints are fixed; connection changes are applied explicitly by the reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const records = useMemo(
    () =>
      (catalogue?.records || []).filter(
        (r) =>
          (collection === "all" || r.collection === collection) &&
          (condition === "all" || r.condition === condition) &&
          `${r.title} ${r.shelfmark} ${r.notes} ${catalogue?.collections.find((c) => c.id === r.collection)?.name || ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [catalogue, query, collection, condition],
  );
  const needsCare =
    catalogue?.records.filter(
      (r) =>
        r.condition === "damaged" ||
        r.condition === "fragile" ||
        r.condition === "missing",
    ).length || 0;
  const currentName =
    deployment && resolved
      ? Object.entries(deployment.publishers)
          .find(
            ([, value]) =>
              value.toLowerCase() === resolved.state.publisher.toLowerCase(),
          )?.[0]
          .toUpperCase()
      : null;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/?registry=${registry}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setSettings(true);
    }
  }
  const go = (next: Tab) => {
    setTab(next);
    setMenu(false);
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to catalogue
      </a>
      <header className="header">
        <a className="brand" href="/" aria-label="Relay home">
          <span className="brand-mark">
            <BookOpen size={23} strokeWidth={1.6} />
          </span>
          <span>
            relay<span className="brand-dot">.</span>
          </span>
        </a>
        <nav
          className={menu ? "navigation navigation-open" : "navigation"}
          aria-label="Main navigation"
        >
          {(Object.keys(tabNames) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => go(t)}
              aria-current={tab === t ? "page" : undefined}
            >
              {tabNames[t]}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <span className="network-pill">
            <i /> On Swarm
          </span>
          <Button
            aria-label="Operator"
            variant="outline"
            size="sm"
            onClick={() => setOperatorOpen(true)}
          >
            <KeyRound size={14} />
            <span>Operator</span>
          </Button>
          <button
            className="mobile-menu"
            aria-label="Toggle menu"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="main">
        <div className="eyebrow page-eyebrow">
          <span>THE COMMON RECORD</span>
          <span className="eyebrow-divider" />
          <span>
            {catalogue
              ? [
                  ...new Set(catalogue.collections.map((item) => item.region)),
                ].join(" + ")
              : "SHARED COLLECTIONS"}
          </span>
        </div>
        <section className="hero">
          <div>
            <p className="eyebrow hero-kicker">
              {catalogue ? `${catalogue.collections.length} COLLECTIONS. ` : ""}
              A CONTINUING RESPONSIBILITY.
            </p>
            <h1>
              {tab === "catalogue" ? (
                <>
                  Kept in common.
                  <br />
                  <em>Carried forward.</em>
                </>
              ) : tab === "stewardship" ? (
                <>
                  A keeper changes.
                  <br />
                  <em>The care continues.</em>
                </>
              ) : tab === "handoffs" ? (
                <>
                  Responsibility,
                  <br />
                  <em>passed on record.</em>
                </>
              ) : (
                <>
                  A living record
                  <br />
                  <em>needs looking after.</em>
                </>
              )}
            </h1>
            <p className="hero-description">
              {tab === "catalogue"
                ? "A shared catalogue of what is held, what needs care, and who will carry the work into its next chapter."
                : tab === "stewardship"
                  ? "Publishing, paying, and choosing a successor are separate responsibilities. Each has a named holder and a way forward."
                  : tab === "handoffs"
                    ? "Follow each appointment from council approval to the incoming keeper's first signed correction. The catalogue link stays the same."
                    : "Swarm storage is renewable, not permanent. Make the next renewal visible before a collection becomes unreachable."}
            </p>
            <div className="hero-actions">
              <Button variant="outline" onClick={copyLink} disabled={!registry}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? "Link copied" : "Copy catalogue link"}
              </Button>
              <button
                className="text-button"
                onClick={() =>
                  go(tab === "catalogue" ? "stewardship" : "catalogue")
                }
              >
                {tab === "catalogue"
                  ? "How stewardship works"
                  : "Return to catalogue"}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
          <div className="continuity-card">
            <div className="eyebrow">
              <span className="tiny-square" /> THE CONTINUITY RECORD
            </div>
            {deployment ? (
              <>
                <div className="keeper-line">
                  <span className="keeper-seal">01</span>
                  <div>
                    <span className="small-label">THE FIRST KEEPER</span>
                    <strong>Steward A</strong>
                    <span>Established the common record</span>
                  </div>
                </div>
                <div className="keeper-line">
                  <span className="keeper-seal">02</span>
                  <div>
                    <span className="small-label">THE NEXT CHAPTER</span>
                    <strong>Steward B</strong>
                    <span>First succession rehearsal</span>
                  </div>
                </div>
                <div className="keeper-line">
                  <span className="keeper-seal keeper-current">03</span>
                  <div>
                    <span className="small-label">
                      {resolved && currentName === "C"
                        ? "CURRENT APPOINTED KEEPER"
                        : "THE CONTINUING LINE"}
                    </span>
                    <strong>Steward C</strong>
                    <span>Second succession rehearsal</span>
                  </div>
                  <Sprout size={24} />
                </div>
              </>
            ) : (
              <>
                <div className="keeper-line">
                  <span className="keeper-seal">
                    <Fingerprint size={22} />
                  </span>
                  <div>
                    <span className="small-label">APPOINTED PUBLISHER</span>
                    <strong>
                      {resolved
                        ? short(resolved.state.publisher)
                        : "Verifying appointment"}
                    </strong>
                    <span>The identity followed by this catalogue</span>
                  </div>
                </div>
                <div className="keeper-line">
                  <span className="keeper-seal">
                    <Users size={22} />
                  </span>
                  <div>
                    <span className="small-label">COUNCIL APPROVAL</span>
                    <strong>
                      {resolved
                        ? `${resolved.state.threshold} of ${resolved.state.owners.length} delegates`
                        : "Verifying council"}
                    </strong>
                    <span>
                      {resolved
                        ? `Succession revision ${resolved.state.revision}`
                        : "Read from the public registry"}
                    </span>
                  </div>
                </div>
              </>
            )}
            <div className="continuity-footer">
              <span>One public identifier.</span>
              <button onClick={() => go("handoffs")}>
                View the record <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        </section>
        <div
          className={`connection-bar ${error ? "connection-error" : ""}`}
          role="status"
        >
          <div>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : resolved ? (
              <ShieldCheck size={17} />
            ) : (
              <CircleHelp size={17} />
            )}
            <span>
              {busy
                ? "Checking the current appointment and Swarm catalogue..."
                : resolved
                  ? `Live catalogue checked at ${new Date(resolved.observedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "The catalogue could not be reached."}
              {error && <small>{error}</small>}
            </span>
          </div>
          <div>
            <button
              onClick={() => refresh()}
              disabled={busy}
              aria-label="Refresh live catalogue"
            >
              <RefreshCw size={15} className={busy ? "spin" : ""} />
              <span>Refresh</span>
            </button>
            <button onClick={() => setSettings(true)}>
              Connection settings
            </button>
          </div>
        </div>
        {publicationReceipt?.registry.toLowerCase() ===
          registry.toLowerCase() && (
          <section className="operator-step" role="status">
            <p className="small-label">PUBLICATION VERIFIED</p>
            <p>
              {publicationReceipt.receipt.staging
                ? "The incoming draft was stored. Council appointment is still a separate action."
                : "Your saved edition was verified on its signed feed. The catalogue display can refresh independently."}
            </p>
            {publicationReceipt.receipt.recordingWarnings?.map(
              (warning, index) => (
                <p className="quiet-note" key={index}>
                  {warning}
                </p>
              ),
            )}
            <Button
              variant="outline"
              onClick={() =>
                downloadFile(
                  "relay-publication-receipt.json",
                  publicationReceipt.receipt,
                )
              }
            >
              <ArrowDownToLine size={15} /> Save publication receipt
            </Button>
          </section>
        )}
        {tab === "catalogue" && (
          <>
            <section className="metrics" aria-label="Catalogue overview">
              <div>
                <Library size={19} />
                <strong>{catalogue?.collections.length ?? "-"}</strong>
                <span>contributing collections</span>
              </div>
              <div>
                <BookOpen size={19} />
                <strong>{catalogue?.records.length ?? "-"}</strong>
                <span>catalogue records</span>
              </div>
              <div>
                <Sprout size={19} />
                <strong>{catalogue ? needsCare : "-"}</strong>
                <span>marked for attention</span>
              </div>
              <div>
                <Users size={19} />
                <strong>
                  {resolved
                    ? `${resolved.state.threshold} of ${resolved.state.owners.length}`
                    : "-"}
                </strong>
                <span>approvals for succession</span>
              </div>
            </section>
            <div className="catalogue-grid">
              <section className="catalogue-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">THE SHARED CATALOGUE</p>
                    <h2>Inside the collections</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() =>
                      catalogue &&
                      downloadFile("relay-catalogue.json", catalogue)
                    }
                    disabled={!catalogue}
                  >
                    <ArrowDownToLine size={15} />
                    Keep a copy
                  </button>
                </div>
                <div className="filters">
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="Search catalogue"
                      placeholder="Find a title, shelfmark, or note"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <div className="filter-selects">
                    <select
                      aria-label="Filter by collection"
                      value={collection}
                      onChange={(e) => setCollection(e.target.value)}
                    >
                      <option value="all">All collections</option>
                      {catalogue?.collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter by condition"
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                    >
                      <option value="all">All conditions</option>
                      {["stable", "fragile", "damaged", "missing"].map((c) => (
                        <option key={c} value={c}>
                          {c[0].toUpperCase() + c.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="record-list">
                  <div className="record-list-head">
                    <span>RECORD / COLLECTION</span>
                    <span>CONDITION</span>
                  </div>
                  {records.map((record, i) => (
                    <button
                      className="record-row"
                      key={record.id}
                      onClick={() => setSelected(record)}
                    >
                      <span className="record-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="record-body">
                        <strong>{record.title}</strong>
                        <span>
                          {
                            catalogue?.collections.find(
                              (c) => c.id === record.collection,
                            )?.name
                          }
                          <i />
                          {record.shelfmark}
                        </span>
                      </span>
                      <span
                        className={`condition condition-${record.condition}`}
                      >
                        <i />
                        {record.condition}
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                  {catalogue && records.length === 0 && (
                    <div className="empty-state">
                      <Search size={25} />
                      <h3>No records match these filters.</h3>
                      <p>Try another title or collection.</p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setQuery("");
                          setCollection("all");
                          setCondition("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    </div>
                  )}
                  {!catalogue && (
                    <div className="empty-state">
                      <BookOpen size={25} />
                      <p>
                        {busy
                          ? "Opening the common record..."
                          : "Retry the connection to open this catalogue."}
                      </p>
                    </div>
                  )}
                </div>
                <p className="quiet-note">
                  {records.length} records shown.
                  {catalogue?.demonstration &&
                    " These are invented demonstration records, not an inventory of actual monastery holdings."}
                </p>
              </section>
              <aside className="catalogue-aside">
                <div className="aside-card keeper-card">
                  <div className="section-icon">
                    <Fingerprint size={22} />
                  </div>
                  <p className="eyebrow">IN SOMEONE'S CARE</p>
                  <h3>
                    {resolved
                      ? currentName
                        ? `Steward ${currentName}`
                        : "Appointed steward"
                      : "Checking the keeper"}
                  </h3>
                  <p>
                    The publishing identity currently followed by this
                    catalogue's public record.
                  </p>
                  {resolved && <code>{short(resolved.state.publisher)}</code>}
                  <div className="aside-rule" />
                  <span className="small-label">APPOINTMENT AUTHORITY</span>
                  <strong className="authority-label">
                    {resolved
                      ? `${resolved.state.threshold}-of-${resolved.state.owners.length} council`
                      : "Council verification pending"}
                  </strong>
                  <button
                    className="text-button"
                    onClick={() => go("stewardship")}
                  >
                    Meet the responsibilities <ArrowRight size={15} />
                  </button>
                  <button
                    className="text-button"
                    disabled={!resolved || busy}
                    onClick={() => setCorrectionOpen(true)}
                  >
                    Review a correction request <FileText size={15} />
                  </button>
                </div>
                <div className="aside-card paper-card">
                  <FileText size={25} strokeWidth={1.4} />
                  <h3>
                    A promise to the
                    <br />
                    <em>next keeper.</em>
                  </h3>
                  <p>
                    Who steps in, who keeps storage paid, and what happens when
                    a key is lost.
                  </p>
                  <button
                    className="text-button"
                    disabled={!resolved || busy}
                    onClick={() => setAgreementOpen(true)}
                  >
                    Read the agreement <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="small-aside">
                  <ShieldCheck size={19} />
                  <p>
                    Read without an account.
                    <br />
                    Verify without the original keeper.
                  </p>
                </div>
              </aside>
            </div>
          </>
        )}
        {tab === "stewardship" && (
          <section className="stewardship-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">SEPARATE KEYS. SHARED RESPONSIBILITY.</p>
                <h2>Who holds what</h2>
              </div>
              <button
                className="text-button"
                disabled={!resolved || busy}
                onClick={() => setAgreementOpen(true)}
              >
                Read the full agreement <ArrowUpRight size={16} />
              </button>
            </div>
            <div className="role-grid">
              {[
                {
                  icon: BookOpen,
                  label: "01 / PUBLISHING",
                  title: "The catalogue steward",
                  body: "Corrects records and signs new catalogue editions. The reader follows only the publisher appointed in the public registry.",
                  limit:
                    "Cannot appoint a successor or spend the node's funds.",
                  address: resolved?.state.publisher,
                },
                {
                  icon: Users,
                  label: "02 / DECIDING",
                  title: "The council",
                  body: resolved
                    ? `${resolved.state.threshold} of ${resolved.state.owners.length} current delegates approve a successor. The same threshold can replace a departing delegate, so the authority can continue too.`
                    : "The public registry identifies the council. Verify it to read the current delegates and required approvals.",
                  limit:
                    "Council membership does not give custody of the Bee node.",
                  address: resolved?.state.council,
                },
                {
                  icon: Sprout,
                  label: "03 / PAYING",
                  title: "The storage custodian",
                  body: "Maintains a funded Bee node, checks the remaining postage, and extends the existing batch before storage lapses.",
                  limit:
                    "Paying for storage does not make this key a publisher.",
                  address: storageObservation?.payer,
                },
              ].map((role) => (
                <article className="role-card" key={role.label}>
                  <role.icon size={26} strokeWidth={1.4} />
                  <p className="eyebrow">{role.label}</p>
                  <h3>{role.title}</h3>
                  <p>{role.body}</p>
                  <div className="role-limit">{role.limit}</div>
                  {role.address && <code>{role.address}</code>}
                </article>
              ))}
            </div>
            <div className="agreement-banner">
              <div>
                <p className="eyebrow">
                  A HUMAN AGREEMENT, WITH A VERIFIABLE PROCEDURE
                </p>
                <h3>
                  {matchingAgreement ? (
                    <>
                      Retirement. Fourteen days unreachable.
                      <br />
                      Or a confirmed compromised key.
                    </>
                  ) : (
                    "The agreement defines when responsibility changes."
                  )}
                </h3>
                <p>
                  {resolved
                    ? `${resolved.state.threshold} current delegates approve the same appointment after documenting the agreed trigger and checking the incoming keeper.`
                    : "Verify the catalogue to read its council approval rule and linked agreement."}
                  {matchingAgreement &&
                    " The recorded handoffs use voluntary retirement."}
                </p>
              </div>
              <Button variant="outline" onClick={() => setOperatorOpen(true)}>
                Prepare a handoff <ArrowRight size={16} />
              </Button>
            </div>
            {deployment && (
              <div className="honesty-note">
                <CircleHelp size={19} />
                <p>
                  <strong>What the rehearsal proves.</strong> Distinct keys
                  really sign, appoint, and publish. The receipts identify Harsh
                  Gupta as the operator of the demonstration identities. Storage
                  uses the configured Bee node and postage batch shared with
                  Folio.
                </p>
              </div>
            )}
          </section>
        )}
        {tab === "handoffs" && (
          <section className="handoffs-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">AN ACTUAL PROCEDURE, REPEATED</p>
                <h2>The line of responsibility</h2>
              </div>
              {deployment && (
                <a className="text-button" href="/evidence.json" download>
                  Download evidence <ArrowDownToLine size={15} />
                </a>
              )}
            </div>
            <div className="handoff-list">
              {deployment?.handoffs.map((handoff, i) => (
                <article className="handoff-item" key={handoff.hash}>
                  <div className="handoff-count">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <span className="eyebrow">
                      RECORDED {date(handoff.observedAt)}
                    </span>
                    <h3>{handoff.title}</h3>
                    <p>{handoff.detail}</p>
                    <div className="address-transition">
                      <code>{short(handoff.from)}</code>
                      <ArrowRight size={17} />
                      <code>{short(handoff.to)}</code>
                    </div>
                    <a
                      className="text-button"
                      href={`https://gnosisscan.io/tx/${handoff.hash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View appointment transaction <ArrowUpRight size={14} />
                    </a>
                  </div>
                  <span className="receipt-badge">
                    <CheckCheck size={16} />
                    Recorded live
                  </span>
                </article>
              ))}
              {!deployment?.handoffs.length && (
                <div className="empty-state">
                  <p>
                    {resolved
                      ? `The registry records succession revision ${resolved.state.revision}. Its current publisher and council are shown in Stewardship.`
                      : "Verify the registry to read its current appointment."}
                  </p>
                  {registry && (
                    <a
                      className="text-button"
                      href={`https://gnosisscan.io/address/${registry}#events`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View this registry's appointment events{" "}
                      <ArrowUpRight size={14} />
                    </a>
                  )}
                </div>
              )}
            </div>
            <div className="recovery-card">
              <div>
                <p className="eyebrow">KEEP THE WAY BACK</p>
                <h3>
                  The app is a doorway.
                  <br />
                  <em>The identifier is yours.</em>
                </h3>
                <p>
                  Keep a readable copy with each library. It includes every
                  catalogue record, the linked agreement and the steps for a
                  handoff. Open or print it without an account or connection.
                </p>
              </div>
              <div>
                <code>
                  {stableIdentifier || "Loading the public identifier..."}
                </code>
                <Button
                  variant="outline"
                  onClick={downloadRecovery}
                  disabled={!resolved || recoveryBusy || busy}
                >
                  {recoveryBusy ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <ArrowDownToLine size={15} />
                  )}
                  {recoveryBusy
                    ? "Preparing complete copy"
                    : "Keep a reading and recovery copy"}
                </Button>
                <p className="muted-copy">
                  A dated HTML document, not a live view. Storage still needs
                  renewal.
                  {!resolved &&
                    " Verify the current catalogue before downloading."}
                </p>
                {recoveryError && <p role="alert">{recoveryError}</p>}
                <button
                  className="text-button"
                  onClick={() =>
                    registry &&
                    downloadFile("relay-recovery.json", {
                      format: "relay.recovery.v1",
                      chainId: 100,
                      registry,
                      stableIdentifier,
                      // Custom RPC URLs can contain provider credentials.
                      // Export a public fallback instead of private settings.
                      rpc: "https://gnosis-rpc.publicnode.com",
                      gateway: resolved?.gateway || appliedGateway,
                      repository: "https://github.com/hrsh22/relay-catalogue",
                      command: `npm run relay -- read --registry ${registry}`,
                      note: "Public recovery information only. No private keys. Storage must still be renewed.",
                    })
                  }
                  disabled={!registry}
                >
                  <ArrowDownToLine size={15} />
                  Public identifiers as JSON
                </button>
              </div>
            </div>
          </section>
        )}
        {tab === "storage" && (
          <section className="storage-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">RENEWABLE STORAGE ON SWARM</p>
                <h2>Time to keep in view</h2>
              </div>
              <Button variant="outline" onClick={() => setOperatorOpen(true)}>
                Manage storage <ArrowRight size={15} />
              </Button>
            </div>
            {storageObservation ? (
              <div className="storage-grid">
                <div className="storage-clock">
                  <Sprout size={30} strokeWidth={1.4} />
                  <p className="eyebrow">ESTIMATED REMAINING AT LAST CHECK</p>
                  <div className="storage-days">
                    {(storageObservation.remainingSeconds / 86400).toFixed(1)}
                    <span>days</span>
                  </div>
                  <p>
                    Observed{" "}
                    {new Date(storageObservation.observedAt).toLocaleString()}.
                    This is a dated node observation; network prices affect
                    remaining time.
                  </p>
                  {matchingAgreement && (
                    <>
                      <div className="storage-track">
                        <i
                          style={{
                            width: `${Math.min(100, (storageObservation.remainingSeconds / (30 * 86400)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="small-label">
                        WORKING TARGET: 30 DAYS IN RESERVE
                      </span>
                    </>
                  )}
                </div>
                <div className="storage-details">
                  <h3>The next renewal has an owner.</h3>
                  <p>
                    {matchingAgreement
                      ? "The storage custodian checks weekly and after each handoff. At fourteen days, obtain a quote. At seven days, escalate to the council and deputy."
                      : "Read this catalogue's linked agreement for the renewal schedule and the custodian's responsibilities."}
                  </p>
                  <dl>
                    <div>
                      <dt>Custodian at observation</dt>
                      <dd>
                        <code>{storageObservation.payer}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Observed postage batch</dt>
                      <dd>
                        <code>{storageObservation.batchId}</code>
                      </dd>
                    </div>
                    {deployment && (
                      <div>
                        <dt>Recorded storage arrangement</dt>
                        <dd>
                          Operator-managed Bee node and postage batch shared
                          with Folio.
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <Sprout size={30} strokeWidth={1.4} />
                <h3>Read the storage arrangement for this catalogue.</h3>
                <p>
                  The linked agreement names who maintains storage and renews
                  postage. Ask that custodian for the batch's latest node
                  observation.
                </p>
                <Button
                  variant="outline"
                  disabled={!resolved || busy}
                  onClick={() => setAgreementOpen(true)}
                >
                  Read this catalogue's agreement <ArrowRight size={15} />
                </Button>
              </div>
            )}
            <div className="honesty-note">
              <CircleHelp size={19} />
              <p>
                <strong>Appointment does not transfer storage.</strong> A
                replacement custodian who loses access to this node needs
                another funded node and batch, plus a retained catalogue copy.
                The reader's registry identifier can remain the same. Network
                prices change lifetime estimates; recurring payment is a human
                responsibility.
              </p>
            </div>
          </section>
        )}
        <footer className="footer">
          <div className="footer-brand">relay.</div>
          <p>A common record. A continuing line of care.</p>
          <div>
            <a
              href="https://github.com/hrsh22/relay-catalogue"
              target="_blank"
              rel="noreferrer"
            >
              Relay reader source <ArrowUpRight size={13} />
            </a>
            <button onClick={() => setSettings(true)}>Public identifier</button>
          </div>
        </footer>
      </main>
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent>
          <DialogTitle>Connection & public identifier</DialogTitle>
          <DialogDescription>
            Read directly from Gnosis and Swarm. You can use another gateway or
            RPC if one is unavailable.
          </DialogDescription>
          <label className="form-label">
            Catalogue registry
            <input
              value={registryInput}
              onChange={(e) => setRegistryInput(e.target.value)}
            />
          </label>
          <label className="form-label">
            Swarm gateway
            <input
              value={gateway}
              onChange={(e) => setGateway(e.target.value)}
            />
          </label>
          <label className="form-label">
            Gnosis RPC <span>(blank uses public fallbacks)</span>
            <input
              value={rpc}
              onChange={(e) => setRpc(e.target.value)}
              placeholder="https://gnosis-rpc.publicnode.com"
            />
          </label>
          <p className="quiet-note">
            This reader trusts the chosen RPC and gateway to return network
            data. It checks the appointment, catalogue identity, and publisher;
            it is not a chain light client.
          </p>
          <Button
            onClick={() => {
              setSettings(false);
              void refresh(registryInput, gateway, rpc);
            }}
            disabled={!addressSchema.safeParse(registryInput.trim()).success}
          >
            Apply & verify <ArrowRight size={15} />
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={operatorOpen}
        onOpenChange={(open) => {
          if (!operatorBusy) setOperatorOpen(open);
        }}
      >
        <DialogContent className="operator-dialog">
          <DialogTitle>Catalogue operator</DialogTitle>
          <DialogDescription>
            {activeOperator
              ? "This desk is configured for the selected registry. Council decisions verify its public authority independently of catalogue retrieval; publishing and renewal use separate credentials."
              : operator
                ? "Verify the catalogue configured for this operator before managing its publishing, council or storage."
                : "Open the configured operator environment to publish corrections, approve handoffs or renew storage."}
          </DialogDescription>
          {councilReceipt?.proposal.registry.toLowerCase() ===
            registry.toLowerCase() && (
            <div className="operator-step" role="status">
              <p className="small-label">COUNCIL TRANSACTION CONFIRMED</p>
              <p>
                The approved change was recorded at block{" "}
                {councilReceipt.blockNumber}. This receipt remains available
                while the catalogue refreshes.
              </p>
              <code>{councilReceipt.hash}</code>
              <Button
                variant="outline"
                onClick={() =>
                  downloadFile("relay-council-receipt.json", councilReceipt)
                }
              >
                <ArrowDownToLine size={15} /> Save transaction receipt
              </Button>
            </div>
          )}
          {storageReceipt &&
            storageReceipt.batchId === activeOperator?.config.batchId && (
              <div className="operator-step" role="status">
                <p className="small-label">STORAGE RENEWAL VERIFIED</p>
                <p>
                  The expected postage increase was observed for batch{" "}
                  <code>{storageReceipt.batchId}</code>. A display or
                  record-saving warning does not require another payment.
                </p>
                {storageReceipt.recordingWarnings.map((warning, index) => (
                  <p className="quiet-note" key={index}>
                    {warning}
                  </p>
                ))}
                <Button
                  variant="outline"
                  onClick={() =>
                    downloadFile("relay-storage-receipt.json", storageReceipt)
                  }
                >
                  <ArrowDownToLine size={15} /> Save storage receipt
                </Button>
              </div>
            )}
          {activeOperator ? (
            <OperatorPanel
              key={registry}
              info={activeOperator}
              current={resolved}
              initialSection={tab === "storage" ? "storage" : "handoff"}
              onChanged={(receipt) => {
                setCouncilReceipt(receipt);
                refreshAfterOperation(registry);
              }}
              onInfoChanged={reloadOperator}
              onPublicationRecovered={(receipt) =>
                publicationCompleted(registry, receipt)
              }
              onStorageRenewed={setStorageReceipt}
              proposal={operatorProposal}
              onProposalChange={setOperatorProposal}
              onBusyChange={setOperatorBusy}
            />
          ) : (
            <div className="operator-instructions">
              {operator?.config.registry && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setOperatorOpen(false);
                    void refresh(operator.config.registry);
                  }}
                >
                  Open the operator's catalogue <ArrowRight size={15} />
                </Button>
              )}
              <div className="instruction-step">
                <span>01</span>
                <p>
                  From the Relay folder, start your configured local operator.
                </p>
              </div>
              <code>npm run operator:start</code>
              <div className="instruction-step">
                <span>02</span>
                <p>
                  Open the local app. Ctrl-C in the terminal ends the session.
                  No always-on connection is required.
                </p>
              </div>
              <Button asChild>
                <a
                  href="http://127.0.0.1:3002"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open local operator <ArrowUpRight size={15} />
                </a>
              </Button>
              <a
                className="text-button"
                href={
                  "https://github.com/hrsh22/relay-catalogue/blob/main/docs/OPERATIONS.md"
                }
                target="_blank"
                rel="noreferrer"
              >
                Setup and recovery instructions <ArrowUpRight size={14} />
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AgreementDialog
        open={agreementOpen}
        onOpenChange={setAgreementOpen}
        current={resolved}
      />
      <Dialog
        open={correctionOpen}
        onOpenChange={(open) => {
          if (!correctionBusy) setCorrectionOpen(open);
        }}
      >
        <DialogContent className="operator-dialog">
          <DialogTitle>Corrections from the contributing libraries</DialogTitle>
          <DialogDescription>
            Open a saved correction request, compare it with the current
            catalogue and let the appointed steward publish the reviewed change.
          </DialogDescription>
          {resolved ? (
            <CorrectionInbox
              key={`${registry}:${resolved.reference}`}
              current={resolved}
              operator={activeOperator}
              onBusyChange={setCorrectionBusy}
              onPublished={(receipt) => {
                if (
                  activeConnection.current.registry.toLowerCase() ===
                  registry.toLowerCase()
                )
                  setCorrectionOpen(false);
                publicationCompleted(registry, receipt);
              }}
            />
          ) : (
            <p>Verify the current catalogue before reviewing a correction.</p>
          )}
        </DialogContent>
      </Dialog>
      <RecordDialog
        record={selected}
        catalogue={catalogue}
        current={resolved}
        operator={activeOperator}
        onClose={() => setSelected(null)}
        onPublished={(receipt) => {
          publicationCompleted(registry, receipt);
        }}
      />
    </div>
  );
}
function AgreementDialog({
  open,
  onOpenChange,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: ResolvedCatalogue | null;
}) {
  const [document, setDocument] = useState<{
    catalogue: ResolvedCatalogue;
    text: string;
  } | null>(null);
  const [failure, setFailure] = useState<{
    catalogue: ResolvedCatalogue;
    message: string;
  } | null>(null);
  useEffect(() => {
    if (!open || !current) return;
    let active = true;
    setDocument(null);
    setFailure(null);
    const selected = current;
    void (async () => {
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          await bytesAt(selected.gateway, selected.state.agreement, 256_000),
        );
        if (!text.trim()) throw new Error("The linked agreement is empty.");
        if (active) setDocument({ catalogue: selected, text });
      } catch (error) {
        if (active)
          setFailure({ catalogue: selected, message: readableError(error) });
      }
    })();
    return () => {
      active = false;
    };
  }, [open, current]);
  const text = document?.catalogue === current ? document?.text : null;
  const error = failure?.catalogue === current ? failure?.message : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="agreement-dialog">
        <DialogTitle>The catalogue's stewardship agreement</DialogTitle>
        <DialogDescription>
          Read from Swarm using the agreement reference held in this catalogue's
          verified registry.
        </DialogDescription>
        {current && (
          <p className="quiet-note">
            <code>{current.state.agreement}</code>
          </p>
        )}
        {!current ? (
          <p>Verify the catalogue to read its linked agreement.</p>
        ) : error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : text ? (
          <AgreementText text={text} />
        ) : (
          <p role="status">Retrieving the agreement from Swarm...</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
function RecordDialog({
  record,
  catalogue,
  current,
  operator,
  onClose,
  onPublished,
}: {
  record: CatalogueRecord | null;
  catalogue: Catalogue | null;
  current: ResolvedCatalogue | null;
  operator: OperatorInfo | null;
  onClose: () => void;
  onPublished: (receipt: PublicationReceipt) => void;
}) {
  const [draft, setDraft] = useState<CatalogueRecord | null>(record),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setDraft(record);
    setReason("");
    setError("");
  }, [record]);
  const alias =
    current && operator && operator.mode !== "council"
      ? Object.entries(operator.config.publishers).find(
          ([key, address]) =>
            operator.availableIdentities.includes(`publisher-${key}`) &&
            address.toLowerCase() === current.state.publisher.toLowerCase(),
        )?.[0]
      : null;
  async function save() {
    if (!draft || !catalogue || !reason.trim()) {
      setError("Add the reason for this correction.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!alias || !current) {
        downloadFile(`relay-correction-${draft.id}.json`, {
          format: "relay.correction.v1",
          catalogueId: catalogue.catalogueId,
          sourceReference: current?.reference || null,
          record: draft,
          reason: reason.trim(),
          preparedAt: new Date().toISOString(),
          note: "This is an unsigned correction request, not a published catalogue update.",
        });
        onClose();
        return;
      }
      const next = {
        ...catalogue,
        revision: catalogue.revision + 1,
        previous: current.reference,
        updatedAt: new Date().toISOString(),
        change: reason.trim(),
        records: catalogue.records.map((r) =>
          r.id === draft.id
            ? { ...draft, updatedAt: new Date().toISOString() }
            : r,
        ),
      };
      const receipt = await operatorRequest({
        action: "publish",
        identity: `publisher-${alias}`,
        catalogue: next,
      });
      onPublished(receipt);
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={Boolean(record)}
      onOpenChange={(open) => !open && !busy && onClose()}
    >
      <DialogContent>
        <DialogTitle>{record?.title || "Catalogue record"}</DialogTitle>
        <DialogDescription>
          {record?.shelfmark} /{" "}
          {
            catalogue?.collections.find((c) => c.id === record?.collection)
              ?.name
          }
        </DialogDescription>
        {draft && (
          <>
            <label className="form-label">
              Record title
              <input
                value={draft.title}
                maxLength={180}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <div className="form-columns">
              <label className="form-label">
                Material
                <input
                  value={draft.material}
                  maxLength={100}
                  onChange={(e) =>
                    setDraft({ ...draft, material: e.target.value })
                  }
                />
              </label>
              <label className="form-label">
                Folio count
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step="1"
                  value={draft.folios}
                  onChange={(e) =>
                    setDraft({ ...draft, folios: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <div className="form-columns">
              <label className="form-label">
                Condition
                <select
                  value={draft.condition}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      condition: e.target.value as CatalogueRecord["condition"],
                    })
                  }
                >
                  {["stable", "fragile", "damaged", "missing"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Photography
                <select
                  value={draft.photographed}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      photographed: e.target
                        .value as CatalogueRecord["photographed"],
                    })
                  }
                >
                  {["complete", "partial", "not-started"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="form-label">
              Keeper's notes
              <textarea
                rows={3}
                value={draft.notes}
                maxLength={2500}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
            <label className="form-label">
              Reason for correction
              <textarea
                rows={2}
                value={reason}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What changed, and how was it checked?"
              />
            </label>
            <p className="quiet-note">
              {alias
                ? "The current steward's key will sign a new Swarm edition. Previous editions remain public."
                : "Download an unsigned correction request for the steward. This does not publish a change."}
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button onClick={save} disabled={busy}>
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : alias ? (
                <Check size={16} />
              ) : (
                <ArrowDownToLine size={16} />
              )}
              {busy
                ? "Verifying publication..."
                : alias
                  ? "Publish correction"
                  : "Download correction request"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
