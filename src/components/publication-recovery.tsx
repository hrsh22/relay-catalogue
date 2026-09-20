"use client";

import { useEffect, useRef, useState } from "react";
import type { RegistryState } from "@/lib/model";
import { readableError } from "@/lib/network";
import {
  operatorRequest,
  type OperatorInfo,
  type PendingPublication,
  type PublicationReceipt,
} from "@/lib/operator-client";
import { Button } from "./ui/button";

export function PublicationRecovery({
  info,
  authority,
  blocked,
  onBusyChange,
  onRecovered,
}: {
  info: OperatorInfo;
  authority: RegistryState | null;
  blocked: boolean;
  onBusyChange: (busy: string) => void;
  onRecovered: (receipt: PublicationReceipt) => void;
}) {
  const [pending, setPending] = useState<PendingPublication[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const running = useRef(false);
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  async function act(label: string, operation: () => Promise<void>) {
    if (running.current || blocked) return;
    running.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      running.current = false;
      setBusy("");
    }
  }
  return (
    <details className="proposal-details">
      <summary>Finish an interrupted publication</summary>
      <p className="quiet-note">
        If a correction or incoming catalogue lost its confirmation, recover the
        saved publication. Relay checks the exact signed feed position first. It
        can confirm an update already present or resend only the same saved
        reference, preserving its records and history.
      </p>
      <Button
        variant="outline"
        disabled={blocked || Boolean(busy)}
        onClick={() =>
          act("Finding saved publications", async () => {
            setPending(
              await operatorRequest({ action: "pending-publications" }),
            );
          })
        }
      >
        Find saved publications
      </Button>
      {pending?.length === 0 && (
        <p className="quiet-note">
          No unconfirmed publications are saved for this catalogue.
        </p>
      )}
      {pending?.map((item) => {
        const alias = Object.entries(info.config.publishers).find(
          ([name, address]) =>
            address.toLowerCase() === item.publisher.toLowerCase() &&
            info.availableIdentities.includes(`publisher-${name}`),
        )?.[0];
        const staging =
          authority?.publisher.toLowerCase() !== item.publisher.toLowerCase();
        return (
          <div className="operator-step" key={item.id}>
            <p className="small-label">
              {staging
                ? "SAVED DRAFT FROM ANOTHER PUBLISHER"
                : "APPOINTED STEWARD'S SAVED CORRECTION"}
            </p>
            <p>Prepared {new Date(item.createdAt).toLocaleString()}</p>
            <dl className="proposal-summary">
              <div>
                <dt>Publishing address</dt>
                <dd>
                  <code>{item.publisher}</code>
                </dd>
              </div>
              <div>
                <dt>Saved catalogue</dt>
                <dd>
                  <code>{item.reference}</code>
                </dd>
              </div>
            </dl>
            <Button
              variant="outline"
              disabled={blocked || Boolean(busy) || !authority || !alias}
              onClick={() =>
                act(
                  "Checking and completing the saved publication",
                  async () => {
                    const receipt: PublicationReceipt = await operatorRequest({
                      action: "resume-publication",
                      id: item.id,
                      identity: `publisher-${alias}`,
                      staging,
                    });
                    setPending(
                      (items) =>
                        items?.filter((entry) => entry.id !== item.id) || [],
                    );
                    setNotice(
                      `The saved publication is verified.${receipt.recordingWarnings?.length ? ` ${receipt.recordingWarnings.join(" ")}` : ""}`,
                    );
                    onRecovered(receipt);
                  },
                )
              }
            >
              Recover this saved publication
            </Button>
            {!alias && (
              <p className="quiet-note">
                The matching publisher's key is required to complete this saved
                publication.
              </p>
            )}
          </div>
        );
      })}
      {busy && <p role="status">{busy}</p>}
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
    </details>
  );
}
