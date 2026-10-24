"use client";

import { useState } from "react";
import { AlertTriangle, CircleHelp, HelpCircle, Loader2, SendHorizontal, TriangleAlert } from "lucide-react";
import { BasisBadge, CitationChip } from "@/components/policy/citation-chip";
import { readError } from "@/components/policy/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MAX_QUESTION_CHARS } from "@/lib/policy/limits";
import type { PolicyAnswer } from "@/lib/policy/qa";
import type { Citation } from "@/lib/policy/types";

type Props = {
  documentIds: string[];
  examples?: string[];
  onJump?: (citation: Citation) => void;
  showDocumentNames?: boolean;
};

const DEFAULT_EXAMPLES = [
  "What is the waiting period for pre-existing diseases?",
  "What is not covered?",
  "How do I make a claim and how soon must I inform the insurer?",
  "Can I cancel and get a refund?",
];

const STATUS_COPY = {
  answered: { label: "Answer found in the document", className: "bg-emerald-50 text-emerald-800" },
  partial: { label: "Partly answered from the document", className: "bg-amber-50 text-amber-800" },
  not_located: { label: "Not located in the document", className: "bg-slate-100 text-slate-700" },
} as const;

export function PolicyAsk({ documentIds, examples = DEFAULT_EXAMPLES, onJump, showDocumentNames = false }: Props) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ asked: string; result: PolicyAnswer } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 5) {
      setError("Please ask a slightly longer question.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/policies/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({ question: trimmed, documentIds }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, "The question could not be answered."));
      }

      setAnswer({ asked: trimmed, result: ((await response.json()) as { answer: PolicyAnswer }).answer });
    } catch (caught) {
      setError(caught instanceof DOMException && caught.name === "TimeoutError" ? "That took too long. Please try again." : caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const result = answer?.result;

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <div className="flex gap-2">
          <Input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={MAX_QUESTION_CHARS} placeholder="Ask about this policy in your own words..." disabled={loading} />
          <Button type="submit" disabled={loading} aria-label="Ask">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              disabled={loading}
              onClick={() => {
                setQuestion(example);
                void ask(example);
              }}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      </form>

      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">&ldquo;{answer?.asked}&rdquo;</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COPY[result.status].className}`}>{STATUS_COPY[result.status].label}</span>
            </div>

            <p className="text-sm leading-relaxed text-slate-900">{result.answer}</p>
            {result.mode === "extractive" ? (
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <HelpCircle className="size-3.5" /> The AI summary was unavailable, so only the document&apos;s own words are shown.
              </p>
            ) : null}

            {result.claims.length > 0 ? (
              <ul className="space-y-2">
                {result.claims.map((claim, index) => (
                  <li key={index} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <BasisBadge basis={claim.basis} />
                      {!claim.verified && claim.basis === "interpretation" ? <span className="text-[10px] text-slate-500">no exact quote found</span> : null}
                    </div>
                    <p className="text-sm text-slate-800">{claim.text}</p>
                    {claim.sources.length > 0 ? (
                      <div className="mt-2 space-y-1.5">
                        {claim.sources.map((source, sourceIndex) => (
                          <div key={sourceIndex}>
                            <CitationChip citation={source} onJump={onJump} showDocument={showDocumentNames} />
                            <blockquote className="mt-1 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-600">&ldquo;{source.quote}&rdquo;</blockquote>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {result.notLocated.length > 0 ? (
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <CircleHelp className="size-3.5" /> Could not be located
                </p>
                {result.notLocated.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            ) : null}

            {result.ambiguities.length > 0 || result.flags.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                  <TriangleAlert className="size-3.5" /> Ambiguity or conflict
                </p>
                <ul className="list-disc space-y-1 pl-4">
                  {result.ambiguities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                  {result.flags.map((flag) => (
                    <li key={flag.message}>{flag.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result.relatedTerms.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">In plain words</p>
                {result.relatedTerms.map((term) => (
                  <div key={term.term} className="rounded-lg bg-cyan-50/60 p-2.5 text-xs text-slate-700">
                    <p className="font-semibold text-slate-900">{term.term}</p>
                    <p>{term.plain}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">General explanation, not a policy term</p>
                    {term.policyDefinition ? (
                      <div className="mt-1.5 rounded-md bg-emerald-50 p-2 text-emerald-900">
                        <p>Your policy&apos;s own definition applies instead:</p>
                        <CitationChip citation={term.policyDefinition} onJump={onJump} showDocument={showDocumentNames} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <p className="flex items-start gap-2 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-slate-400" /> {result.disclaimer}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
