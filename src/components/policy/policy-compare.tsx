"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, TriangleAlert } from "lucide-react";
import { CitationChip } from "@/components/policy/citation-chip";
import { POLICY_TYPE_LABELS } from "@/components/policy/format";
import { PolicyAsk } from "@/components/policy/policy-ask";
import { Card, CardContent } from "@/components/ui/card";
import type { Comparison } from "@/lib/policy/compare";
import { FACT_CATEGORIES, FACT_CATEGORY_LABELS, type FactCategory } from "@/lib/policy/types";

export function PolicyCompare({ comparison }: { comparison: Comparison }) {
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const documentIds = comparison.documents.map((document) => document.id);

  const grouped = useMemo(
    () =>
      FACT_CATEGORIES.map((category) => ({
        category,
        rows: comparison.rows.filter((row) => row.category === category && (!onlyDifferences || row.differs)),
      })).filter((group) => group.rows.length > 0),
    [comparison.rows, onlyDifferences],
  );

  return (
    <div className="space-y-5">
      <Link href="/dashboard/policies" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" /> All policies
      </Link>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">Side-by-side comparison</h2>
        {comparison.summary.map((line) => (
          <p key={line} className="text-sm text-slate-600">
            {line}
          </p>
        ))}
        {comparison.warnings.map((warning) => (
          <p key={warning} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {warning}
          </p>
        ))}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={onlyDifferences} onChange={(event) => setOnlyDifferences(event.target.checked)} /> Show only terms that differ
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-48 border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Term</th>
              {comparison.documents.map((document) => (
                <th key={document.id} className="border-b border-slate-200 px-3 py-2 align-top">
                  <p className="font-semibold text-slate-900">{document.title}</p>
                  <p className="text-xs font-normal text-slate-500">
                    {POLICY_TYPE_LABELS[document.policyType]}
                    {document.insurer ? ` \u00B7 ${document.insurer}` : ""}
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          {grouped.map((group) => (
            <tbody key={group.category}>
              <tr>
                <td colSpan={comparison.documents.length + 1} className="bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {FACT_CATEGORY_LABELS[group.category as FactCategory]}
                </td>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.key} className={row.differs ? "bg-amber-50/40" : ""}>
                  <th scope="row" className="border-b border-slate-100 px-3 py-2 align-top text-sm font-medium text-slate-800">
                    {row.label}
                    {row.differs ? <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">differs</span> : null}
                  </th>
                  {row.cells.map((cell, column) => (
                    <td key={column} className="border-b border-slate-100 px-3 py-2 align-top">
                      {cell.status === "not_located" ? (
                        <span className="text-xs italic text-slate-400">Not located in this document</span>
                      ) : (
                        <ul className="space-y-1.5">
                          {cell.items.map((item, index) => (
                            <li key={index}>
                              <p className="text-slate-900">{item.text}</p>
                              <CitationChip citation={item.citation} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Ask across these policies</h3>
          <PolicyAsk
            documentIds={documentIds}
            showDocumentNames
            examples={["What is the waiting period for pre-existing diseases in each policy?", "How do the claim notification rules differ?", "What happens if I cancel?"]}
          />
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
        <Info className="mt-0.5 size-3.5 shrink-0" /> {comparison.disclaimer}
      </p>
    </div>
  );
}
