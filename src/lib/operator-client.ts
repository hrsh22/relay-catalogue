import type { Config } from "../../scripts/context";
import type { Proposal } from "../../scripts/council";
import type { RegistryState } from "./model";

export type CouncilReceipt = {
  kind: Proposal["kind"];
  hash: string;
  blockNumber: string;
  observedAt: string;
  proposal: Proposal;
  before: RegistryState;
  after: RegistryState;
};

export type OperatorInfo = {
  config: Config;
  availableIdentities: string[];
  mode: "council" | "operator";
  storageError?: string;
  storage: {
    bzz: string;
    xdai: string;
    mode: string;
    observedAt: string;
    batches: { id: string; remainingSeconds: number }[];
  } | null;
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

export function savePublicFile(
  name: string,
  contents: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
