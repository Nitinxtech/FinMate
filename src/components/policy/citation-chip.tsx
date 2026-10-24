"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { citationLabel, viewerHref } from "@/components/policy/format";
import type { Citation } from "@/lib/policy/types";

type Props = {
  citation: Pick<Citation, "page" | "clauseRef" | "quote" | "documentId" | "documentTitle">;
  // When provided the chip jumps within the current viewer; otherwise it links to the viewer for that document.
  onJump?: (citation: Props["citation"]) => void;
  showDocument?: boolean;
};

const chipClass =
  "inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800";

export function CitationChip({ citation, onJump, showDocument = false }: Props) {
  const label = `${showDocument ? `${citation.documentTitle}: ` : ""}${citationLabel(citation)}`;
  const content = (
    <>
      <FileText className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </>
  );

  if (onJump) {
    return (
      <button type="button" className={chipClass} title={`Show in document: "${citation.quote}"`} onClick={() => onJump(citation)}>
        {content}
      </button>
    );
  }

  return (
    <Link href={viewerHref(citation.documentId, citation)} className={chipClass} title={`Open in document: "${citation.quote}"`}>
      {content}
    </Link>
  );
}

export function BasisBadge({ basis }: { basis: "explicit" | "interpretation" | "assumption" | "not_located" }) {
  const styles = {
    explicit: "border-emerald-200 bg-emerald-50 text-emerald-700",
    interpretation: "border-amber-200 bg-amber-50 text-amber-700",
    assumption: "border-sky-200 bg-sky-50 text-sky-700",
    not_located: "border-slate-300 bg-slate-100 text-slate-600",
  } as const;
  const labels = {
    explicit: "Stated in the policy",
    interpretation: "Interpretation",
    assumption: "Assumption",
    not_located: "Not located",
  } as const;

  return <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${styles[basis]}`}>{labels[basis]}</span>;
}
