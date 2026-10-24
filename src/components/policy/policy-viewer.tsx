"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Calculator, FileText, MessageSquare, ShieldAlert, ListChecks } from "lucide-react";
import { POLICY_TYPE_LABELS } from "@/components/policy/format";
import { PolicyAsk } from "@/components/policy/policy-ask";
import { PolicyDocument, type ViewerFocus } from "@/components/policy/policy-document";
import { PolicyOverview } from "@/components/policy/policy-overview";
import { PolicyScenario } from "@/components/policy/policy-scenario";
import type { PolicyDocumentSummary } from "@/features/policy/types";
import { POLICY_DISCLAIMER, type Citation, type Clause, type Extraction, type PageText } from "@/lib/policy/types";

type Tab = "overview" | "document" | "ask" | "scenario";

type Props = {
  document: PolicyDocumentSummary;
  pages: PageText[];
  clauses: Clause[];
  extraction: Extraction | null;
  initialPage: number;
  initialClause: string | null;
};

const TABS: Array<{ id: Tab; label: string; icon: typeof FileText }> = [
  { id: "overview", label: "Key terms", icon: ListChecks },
  { id: "document", label: "Document", icon: FileText },
  { id: "ask", label: "Ask", icon: MessageSquare },
  { id: "scenario", label: "What if", icon: Calculator },
];

export function PolicyViewer({ document, pages, clauses, extraction, initialPage, initialClause }: Props) {
  const startingClause = initialClause ? clauses.find((clause) => clause.ref === initialClause && clause.page === initialPage) : undefined;
  const [tab, setTab] = useState<Tab>(initialClause || initialPage > 1 ? "document" : "overview");
  const [focus, setFocus] = useState<ViewerFocus>({
    page: pages.some((page) => page.page === initialPage) ? initialPage : (pages[0]?.page ?? 1),
    clauseRef: initialClause,
    quote: startingClause ? (startingClause.text.split("\n").find((line) => line.trim().length >= 12) ?? null) : null,
  });

  const jump = (citation: Pick<Citation, "page" | "clauseRef" | "quote">) => {
    setFocus({ page: citation.page, clauseRef: citation.clauseRef, quote: citation.quote });
    setTab("document");
  };

  const conflictCount = extraction?.issues.filter((issue) => issue.kind === "conflict").length ?? 0;

  return (
    <div className="space-y-5">
      <Link href="/dashboard/policies" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" /> All policies
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-slate-900">{document.title}</h2>
          <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-white">{POLICY_TYPE_LABELS[document.policyType]}</span>
          {document.classification?.ambiguous ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Could also be {document.classification.runnerUp?.replace("_", " ")}</span>
          ) : null}
        </div>
        <p className="text-sm text-slate-500">
          {document.insurer ?? "Insurer not detected"}
          {document.pageCount ? ` \u00B7 ${document.pageCount} pages` : ""}
          {document.typeConfidence !== null ? ` \u00B7 type confidence ${Math.round(document.typeConfidence * 100)}%` : ""}
        </p>
        {!document.isInsurancePolicy ? (
          <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" /> This document does not look like an insurance policy, so anything shown below may be meaningless.
          </p>
        ) : null}
        {conflictCount > 0 ? (
          <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {conflictCount} conflicting provision{conflictCount === 1 ? "" : "s"} found. See &ldquo;Worth a closer look&rdquo; under Key terms.
          </p>
        ) : null}
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Policy sections">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
                tab === item.id ? "border-cyan-600 text-cyan-800" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon className="size-4" /> {item.label}
            </button>
          );
        })}
      </nav>

      {tab === "overview" ? (extraction ? <PolicyOverview extraction={extraction} onJump={jump} /> : <p className="text-sm text-slate-500">No analysis is available for this policy.</p>) : null}
      {tab === "document" ? (
        <PolicyDocument documentId={document.id} documentTitle={document.title} pages={pages} clauses={clauses} extraction={extraction} focus={focus} onFocus={setFocus} />
      ) : null}
      {tab === "ask" ? <PolicyAsk documentIds={[document.id]} onJump={jump} /> : null}
      {tab === "scenario" ? <PolicyScenario documentId={document.id} policyType={document.policyType} onJump={jump} /> : null}

      <p className="border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">{POLICY_DISCLAIMER}</p>
    </div>
  );
}
