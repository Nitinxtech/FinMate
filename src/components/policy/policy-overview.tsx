"use client";

import { AlertTriangle, CircleHelp, GitCompareArrows, Info, ScanText, SearchX } from "lucide-react";
import { BasisBadge, CitationChip } from "@/components/policy/citation-chip";
import { Card, CardContent } from "@/components/ui/card";
import { FACT_CATEGORIES, FACT_CATEGORY_LABELS, type Citation, type Extraction, type Fact, type FactCategory } from "@/lib/policy/types";

type Props = {
  extraction: Extraction;
  onJump: (citation: Citation) => void;
};

const ISSUE_STYLES = {
  conflict: { icon: GitCompareArrows, className: "border-rose-200 bg-rose-50 text-rose-900", label: "Conflicting provisions" },
  ambiguity: { icon: CircleHelp, className: "border-amber-200 bg-amber-50 text-amber-900", label: "Ambiguous wording" },
  quality: { icon: ScanText, className: "border-orange-200 bg-orange-50 text-orange-900", label: "Reading quality" },
  limitation: { icon: Info, className: "border-slate-200 bg-slate-50 text-slate-700", label: "Scope of this review" },
} as const;

function FactRow({ fact, onJump }: { fact: Fact; onJump: Props["onJump"] }) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{fact.label}</p>
          {fact.value ? <p className="text-sm font-semibold text-cyan-800">{fact.value}</p> : <p className="text-xs text-slate-500">Mentioned, no figure stated here</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <BasisBadge basis="explicit" />
          <CitationChip citation={fact.citation} onJump={onJump} />
        </div>
      </div>
      <blockquote className="mt-2 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-600">&ldquo;{fact.citation.quote}&rdquo;</blockquote>
      {fact.hedges.length > 0 ? <p className="mt-1.5 text-[11px] text-amber-700">Note: {fact.hedges.join("; ")}</p> : null}
    </li>
  );
}

export function PolicyOverview({ extraction, onJump }: Props) {
  const byCategory = new Map<FactCategory, Fact[]>();
  for (const fact of extraction.facts) {
    byCategory.set(fact.category, [...(byCategory.get(fact.category) ?? []), fact]);
  }

  const reviewable = extraction.issues.filter((issue) => issue.kind !== "limitation");
  const limitation = extraction.issues.find((issue) => issue.kind === "limitation");

  return (
    <div className="space-y-5">
      {reviewable.length > 0 ? (
        <section aria-label="Things to review" className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">Worth a closer look</h3>
          {reviewable.map((issue, index) => {
            const style = ISSUE_STYLES[issue.kind];
            const Icon = style.icon;
            return (
              <div key={`${issue.kind}-${index}`} className={`rounded-xl border p-3 text-sm ${style.className}`}>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                  <Icon className="size-3.5" /> {style.label}
                </p>
                <p>{issue.message}</p>
                {issue.citations.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {issue.citations.map((citation) => (
                      <CitationChip key={`${citation.page}-${citation.clauseRef}-${citation.quote.slice(0, 20)}`} citation={citation} onJump={onJump} />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      {FACT_CATEGORIES.map((category) => {
        const facts = byCategory.get(category) ?? [];
        if (facts.length === 0) {
          return null;
        }

        return (
          <section key={category} aria-label={FACT_CATEGORY_LABELS[category]}>
            <h3 className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-900">
              {FACT_CATEGORY_LABELS[category]}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{facts.length}</span>
            </h3>
            <ul className="space-y-2">
              {facts.map((fact) => (
                <FactRow key={fact.id} fact={fact} onJump={onJump} />
              ))}
            </ul>
          </section>
        );
      })}

      {extraction.notLocated.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <SearchX className="size-4 text-slate-500" /> Not located in this document
            </h3>
            <ul className="space-y-1.5 text-sm text-slate-600">
              {extraction.notLocated.map((item) => (
                <li key={item.category}>
                  <span className="font-medium text-slate-800">{FACT_CATEGORY_LABELS[item.category]}:</span> {item.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {limitation ? (
        <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-slate-400" /> {limitation.message}
        </p>
      ) : null}
    </div>
  );
}
