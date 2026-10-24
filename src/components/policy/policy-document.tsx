"use client";

import { BookOpen, ChevronLeft, ChevronRight, ScanText } from "lucide-react";
import { useMemo } from "react";
import { CitationChip } from "@/components/policy/citation-chip";
import { splitForHighlight } from "@/components/policy/highlight";
import { Card, CardContent } from "@/components/ui/card";
import { findGlossaryTerms } from "@/lib/policy/glossary";
import type { Citation, Clause, Extraction, PageText } from "@/lib/policy/types";

export type ViewerFocus = { page: number; quote: string | null; clauseRef: string | null };

type Props = {
  documentId: string;
  documentTitle: string;
  pages: PageText[];
  clauses: Clause[];
  extraction: Extraction | null;
  focus: ViewerFocus;
  onFocus: (focus: ViewerFocus) => void;
};

export function PolicyDocument({ documentTitle, pages, clauses, extraction, focus, onFocus }: Props) {
  const current = pages.find((page) => page.page === focus.page) ?? pages[0];
  const pageClauses = useMemo(() => clauses.filter((clause) => clause.page === current?.page), [clauses, current?.page]);
  const segments = useMemo(() => splitForHighlight(current?.text ?? "", focus.quote), [current?.text, focus.quote]);
  const terms = useMemo(() => findGlossaryTerms(current?.text ?? "", 8), [current?.text]);

  if (!current) {
    return <p className="text-sm text-slate-500">This document has no readable pages.</p>;
  }

  const definitions = (extraction?.facts ?? []).filter((fact) => fact.category === "definition");
  const position = pages.findIndex((page) => page.page === current.page);
  const go = (offset: number) => {
    const next = pages[position + offset];
    if (next) {
      onFocus({ page: next.page, quote: null, clauseRef: null });
    }
  };

  const jumpToClause = (clause: Clause) =>
    onFocus({ page: clause.page, clauseRef: clause.ref, quote: clause.text.split("\n").find((line) => line.trim().length >= 12) ?? clause.text.slice(0, 80) });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => go(-1)} disabled={position <= 0} className="rounded-md border border-slate-200 p-1.5 disabled:opacity-40" aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </button>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              Page
              <select
                value={current.page}
                onChange={(event) => onFocus({ page: Number(event.target.value), quote: null, clauseRef: null })}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
              >
                {pages.map((page) => (
                  <option key={page.page} value={page.page}>
                    {page.page}
                  </option>
                ))}
              </select>
              of {pages.length}
            </label>
            <button type="button" onClick={() => go(1)} disabled={position >= pages.length - 1} className="rounded-md border border-slate-200 p-1.5 disabled:opacity-40" aria-label="Next page">
              <ChevronRight className="size-4" />
            </button>
          </div>
          {current.source === "ocr" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-800">
              <ScanText className="size-3.5" /> Read by OCR, may contain errors
            </span>
          ) : null}
        </div>

        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">
              {documentTitle} &middot; page {current.page}
            </p>
            {/* Document text is rendered as plain text by React; it is never interpreted as markup or executed. */}
            <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-slate-800">
              {current.text.length === 0 ? "No readable text was found on this page." : segments.map((segment, index) => (segment.highlight ? <mark key={index} className="rounded bg-amber-200 px-0.5">{segment.text}</mark> : <span key={index}>{segment.text}</span>))}
            </pre>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card>
          <CardContent className="space-y-2 p-3">
            <h3 className="text-sm font-semibold text-slate-900">Clauses on this page</h3>
            {pageClauses.length === 0 ? (
              <p className="text-xs text-slate-500">No numbered clauses were detected on this page.</p>
            ) : (
              <ul className="max-h-60 space-y-1 overflow-auto">
                {pageClauses.map((clause) => (
                  <li key={clause.index}>
                    <button
                      type="button"
                      onClick={() => jumpToClause(clause)}
                      className={`w-full rounded-md px-2 py-1 text-left text-xs transition hover:bg-slate-100 ${focus.clauseRef && clause.ref === focus.clauseRef ? "bg-cyan-50 font-medium text-cyan-900" : "text-slate-700"}`}
                    >
                      <span className="font-semibold">{clause.ref ?? "\u2014"}</span> {clause.heading ?? clause.text.slice(0, 48)}
                      {clause.continued ? <span className="text-slate-400"> (continued)</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <BookOpen className="size-4 text-cyan-700" /> Plain-language guide
            </h3>
            {terms.length === 0 ? (
              <p className="text-xs text-slate-500">No common insurance terms were found on this page.</p>
            ) : (
              <ul className="space-y-3">
                {terms.map((term) => {
                  const own = definitions.find((fact) => term.pattern.test(fact.label));
                  return (
                    <li key={term.term} className="text-xs">
                      <p className="font-semibold text-slate-900">{term.term}</p>
                      <p className="text-slate-600">{term.plain}</p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">General explanation, not a policy term</p>
                      {own ? (
                        <div className="mt-1.5 rounded-md bg-emerald-50 p-2 text-emerald-900">
                          <p className="font-medium">Your policy defines it as:</p>
                          <p>{own.value}</p>
                          <div className="mt-1">
                            <CitationChip citation={own.citation as Citation} onJump={(citation) => onFocus({ page: citation.page, quote: citation.quote, clauseRef: citation.clauseRef })} />
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
