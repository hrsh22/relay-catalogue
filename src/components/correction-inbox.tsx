"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileInput, LoaderCircle } from "lucide-react";
import {
  MAX_CORRECTION_BYTES,
  correctionEdition,
  parseCorrectionRequest,
  reviewCorrection,
  type CorrectionRequest,
} from "@/lib/corrections";
import type { ResolvedCatalogue } from "@/lib/model";
import { readableError } from "@/lib/network";
import { Button } from "./ui/button";
import {
  operatorRequest,
  type OperatorInfo,
  type PublicationReceipt,
} from "@/lib/operator-client";

export function CorrectionInbox({
  current,
  operator,
  onPublished,
  onBusyChange,
}: {
  current: ResolvedCatalogue;
  operator?: OperatorInfo | null;
  onPublished: (receipt: PublicationReceipt) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [request, setRequest] = useState<CorrectionRequest | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const importSequence = useRef(0);
  const publicationLock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  const context = [
    current.state.registry.toLowerCase(),
    current.state.catalogueId.toLowerCase(),
    current.state.publisher.toLowerCase(),
    current.state.revision,
    current.reference,
  ].join(":");
  const latestContext = useRef(context);
  useEffect(() => {
    latestContext.current = context;
    importSequence.current += 1;
    setRequest(null);
    setFilename("");
    setError("");
    setNotice("");
    if (input.current) input.current.value = "";
    return () => {
      importSequence.current += 1;
      latestContext.current = "";
    };
  }, [context]);

  const review = useMemo(() => {
    if (!request) return null;
    try {
      return { value: reviewCorrection(request, current), error: "" };
    } catch (cause) {
      return { value: null, error: readableError(cause) };
    }
  }, [request, current]);
  const matchesOperator =
    operator?.config.registry?.toLowerCase() ===
      current.state.registry.toLowerCase() &&
    operator?.config.catalogueId.toLowerCase() ===
      current.state.catalogueId.toLowerCase();
  const alias = matchesOperator
    ? Object.entries(operator!.config.publishers).find(
        ([, address]) =>
          address.toLowerCase() === current.state.publisher.toLowerCase(),
      )?.[0]
    : undefined;
  const canPublish = Boolean(
    alias &&
    operator?.mode !== "council" &&
    operator?.availableIdentities.includes(`publisher-${alias}`),
  );

  async function importRequest(file: File) {
    const sequence = ++importSequence.current;
    const sourceContext = context;
    setRequest(null);
    setFilename("");
    setError("");
    setNotice("");
    try {
      if (file.size > MAX_CORRECTION_BYTES)
        throw new Error("Choose a correction request of 32 KiB or smaller.");
      const parsed = parseCorrectionRequest(await file.text());
      if (
        sequence !== importSequence.current ||
        sourceContext !== latestContext.current
      )
        return;
      reviewCorrection(parsed, current);
      setRequest(parsed);
      setFilename(file.name);
    } catch (cause) {
      if (
        sequence === importSequence.current &&
        sourceContext === latestContext.current
      )
        setError(readableError(cause));
    }
  }

  async function publishReviewed() {
    if (!request || !canPublish || !alias || publicationLock.current) return;
    publicationLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const sourceContext = context;
    try {
      const catalogue = correctionEdition(
        request,
        current,
        new Date().toISOString(),
      );
      const receipt = await operatorRequest({
        action: "publish",
        identity: `publisher-${alias}`,
        catalogue,
      });
      if (sourceContext !== latestContext.current) return;
      setRequest(null);
      setFilename("");
      if (input.current) input.current.value = "";
      setNotice(
        "The reviewed correction was published. Refreshing the public catalogue.",
      );
      onPublished(receipt);
    } catch (cause) {
      if (sourceContext === latestContext.current)
        setError(readableError(cause));
    } finally {
      publicationLock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="correction-inbox">
      <p className="eyebrow">FROM THE CONTRIBUTING LIBRARIES</p>
      <h3>Review a correction request</h3>
      <p className="quiet-note">
        Open the JSON request a contributor downloaded from the catalogue.
        Compare every change before the appointed steward signs a new edition.
        Importing a request changes nothing.
      </p>
      <label className="form-label">
        Correction request file
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importRequest(file);
          }}
        />
        <span>
          One request, up to 32 KiB. No keys or passwords are requested.
        </span>
      </label>
      {(error || review?.error) && (
        <p className="form-error" role="alert">
          {error || review?.error}
        </p>
      )}
      {review?.value && (
        <div className="operator-step">
          <p className="small-label">PROPOSED CHANGES</p>
          <h3>{review.value.before.title}</h3>
          <dl className="proposal-summary">
            <div>
              <dt>Request file</dt>
              <dd>{filename}</dd>
            </div>
            <div>
              <dt>Record identity</dt>
              <dd>
                {request!.record.id} / {review.value.before.shelfmark}
              </dd>
            </div>
            <div>
              <dt>Prepared by the contributor's device</dt>
              <dd>
                <time dateTime={request!.preparedAt}>
                  {request!.preparedAt}
                </time>
              </dd>
            </div>
            <div>
              <dt>Verified source edition</dt>
              <dd>
                <code>{request!.sourceReference}</code>
              </dd>
            </div>
            <div>
              <dt>Reason supplied with the request</dt>
              <dd style={{ whiteSpace: "pre-wrap" }}>{request!.reason}</dd>
            </div>
          </dl>
          <p className="quiet-note">
            This request is unsigned. Its date and explanation are supplied by
            the contributor, not proof of their identity or of the record's
            historical accuracy. Verify the change through the libraries' usual
            contact method.
          </p>
          <div className="correction-differences">
            {review.value.changes.map((change) => (
              <section className="operator-step" key={change.field}>
                <h4>{change.label}</h4>
                <dl className="proposal-summary form-columns">
                  <div>
                    <dt>Current catalogue</dt>
                    <dd style={{ whiteSpace: "pre-wrap" }}>
                      {change.before || "No text supplied"}
                    </dd>
                  </div>
                  <div>
                    <dt>Proposed correction</dt>
                    <dd style={{ whiteSpace: "pre-wrap" }}>
                      {change.after || "No text supplied"}
                    </dd>
                  </div>
                </dl>
              </section>
            ))}
          </div>
          <p className="quiet-note">
            Only these record fields and this record's update time will change.
            Other records stay as they are. The reason is recorded in the new
            edition, and previous editions remain public.
          </p>
          {!canPublish && (
            <p className="quiet-note">
              Review is available here. To publish, open the operator configured
              with the currently appointed steward's signing key and import this
              same request.
            </p>
          )}
          <div className="button-row">
            <Button onClick={publishReviewed} disabled={!canPublish || busy}>
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}
              {busy
                ? "Publishing reviewed correction..."
                : "Publish reviewed correction"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setRequest(null);
                setFilename("");
                setError("");
                if (input.current) input.current.value = "";
              }}
            >
              <FileInput size={16} /> Discard request
            </Button>
          </div>
        </div>
      )}
      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
