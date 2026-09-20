export type Demo = {
  registry: string;
  council: string;
  catalogueId: string;
  payer: string;
  batchId: string;
  publishers: Record<string, string>;
  councilOwners: Record<string, string>;
  agreement: string;
  stableIdentifier: string;
  repository: string;
  storage: { observedAt: string; remainingSeconds: number; usage: number };
  handoffs: {
    title: string;
    from: string;
    to: string;
    hash: string;
    observedAt: string;
    reference: string;
    detail: string;
  }[];
};
