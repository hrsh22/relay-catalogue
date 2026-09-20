"use client";

import { useId, useMemo, useState } from "react";
import type { Catalogue } from "@/lib/model";
import { AgreementText } from "./agreement-text";
import { Button } from "./ui/button";

const PAGE_SIZE = 25;
const photography = {
  complete: "Complete",
  partial: "Partial",
  "not-started": "Not started",
} as const;

export function IncomingPublication({
  publication,
}: {
  publication: {
    catalogue: Catalogue;
    reference: string;
    gateway: string;
    agreementText: string;
  };
}) {
  const titleId = useId();
  const recordsId = useId();
  const { catalogue, reference } = publication;
  const [view, setView] = useState({ reference, query: "", page: 0 });
  // A newly reviewed checkpoint starts with its full first page, even before
  // effects could run. Approvals of the same checkpoint retain the reader's place.
  const query = view.reference === reference ? view.query : "";
  const requestedPage = view.reference === reference ? view.page : 0;
  const libraries = useMemo(
    () =>
      new Map(catalogue.collections.map((library) => [library.id, library])),
    [catalogue.collections],
  );
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalogue.records.filter((record) => {
      const library = libraries.get(record.collection);
      return `${record.title} ${record.shelfmark} ${library?.name || ""} ${library?.region || ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [catalogue.records, libraries, query]);
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  const start = page * PAGE_SIZE;
  const records = matches.slice(start, start + PAGE_SIZE);

  return (
    <section
      className="incoming-publication agreement-prose"
      aria-labelledby={titleId}
      style={{ overflowWrap: "anywhere" }}
    >
      <p className="eyebrow">PUBLIC DRAFT - NOT APPOINTED YET</p>
      <h3 id={titleId}>{catalogue.title}</h3>
      <p>{catalogue.description}</p>
      <p>
        <strong>{catalogue.collections.length.toLocaleString("en")}</strong>{" "}
        {catalogue.collections.length === 1 ? "collection" : "collections"}
        {" · "}
        <strong>{catalogue.records.length.toLocaleString("en")}</strong>{" "}
        {catalogue.records.length === 1 ? "record" : "records"}
      </p>
      {catalogue.demonstration && (
        <p className="operator-notice">
          <strong>Demonstration catalogue.</strong> These are invented records
          for the rehearsal, not evidence of actual library holdings.
        </p>
      )}
      <p>
        This is the starting catalogue retrieved from the incoming steward's
        signed feed for this proposal. Read its records and agreement before
        approving. The current steward remains appointed until the council's
        transaction succeeds.
      </p>
      <label className="form-label">
        Find a title, shelfmark or library
        <input
          type="search"
          value={query}
          placeholder="Search the incoming catalogue"
          aria-controls={recordsId}
          onChange={(event) =>
            setView({ reference, query: event.target.value, page: 0 })
          }
        />
      </label>
      <p role="status" aria-live="polite">
        {matches.length
          ? `Showing ${start + 1}-${start + records.length} of ${matches.length.toLocaleString("en")} ${query.trim() ? "matching " : ""}records.`
          : catalogue.records.length
            ? "No records match this search. Try another title, shelfmark or library."
            : "This proposed catalogue contains no records."}
      </p>
      <div id={recordsId} className="record-list" role="list">
        {records.map((record) => {
          const library = libraries.get(record.collection);
          return (
            <article
              className="proposal-action"
              role="listitem"
              key={record.id}
            >
              <p className="small-label">{record.shelfmark}</p>
              <h4>{record.title}</h4>
              <p>
                <strong>Library:</strong>{" "}
                {library?.name || "Library name unavailable"}
                {library?.region ? ` (${library.region})` : ""}
              </p>
              <p>
                <strong>Condition:</strong> {record.condition}
                {" · "}
                <strong>Photography:</strong> {photography[record.photographed]}
              </p>
              <p>
                <strong>Folios:</strong> {record.folios.toLocaleString("en")}
                {" · "}
                <strong>Material:</strong> {record.material}
              </p>
              <p>
                <strong>Notes:</strong> {record.notes || "No notes recorded."}
              </p>
            </article>
          );
        })}
      </div>
      {matches.length > PAGE_SIZE && (
        <nav className="button-row" aria-label="Incoming catalogue pages">
          <Button
            type="button"
            variant="outline"
            disabled={page === 0}
            onClick={() => setView({ reference, query, page: page - 1 })}
          >
            Previous 25
          </Button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page + 1 === pages}
            onClick={() => setView({ reference, query, page: page + 1 })}
          >
            Next 25
          </Button>
        </nav>
      )}
      {query && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setView({ reference, query: "", page: 0 })}
        >
          Clear search
        </Button>
      )}
      <details className="proposal-details">
        <summary>Read the agreement linked by this proposal</summary>
        <AgreementText text={publication.agreementText} />
      </details>
      <details className="proposal-details">
        <summary>Public retrieval details</summary>
        <dl>
          <dt>Incoming catalogue reference</dt>
          <dd>
            <code>{reference}</code>
          </dd>
          <dt>Retrieved through</dt>
          <dd>
            <code>{publication.gateway}</code>
          </dd>
        </dl>
      </details>
    </section>
  );
}
