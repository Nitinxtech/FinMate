import { classifyPolicy } from "@/lib/policy/classify";
import { segmentClauses } from "@/lib/policy/clauses";
import { extractPolicyFacts } from "@/lib/policy/extraction";
import { quarantineInstructions, quarantineIssue } from "@/lib/policy/injection";
import { OCR_PAGES_PER_STEP } from "@/lib/policy/limits";
import type { OcrProvider } from "@/lib/policy/ocr";
import { pageNeedsOcr } from "@/lib/policy/pdf-text";
import type { Classification, Clause, DocumentMeta, Extraction, PageText } from "@/lib/policy/types";

export type Analysis = {
  clauses: Clause[];
  classification: Classification;
  extraction: Extraction;
};

export function analyzePages(doc: DocumentMeta, pages: PageText[]): Analysis {
  // Everything downstream reads the filtered copy, so planted instructions cannot become facts or passages.
  const quarantine = quarantineInstructions(pages);
  const clauses = segmentClauses(quarantine.pages);
  const extraction = extractPolicyFacts({ doc, pages: quarantine.pages, clauses });

  const warning = quarantineIssue(quarantine);
  if (warning) {
    extraction.issues.unshift(warning);
  }

  return {
    clauses,
    classification: classifyPolicy(quarantine.pages),
    extraction,
  };
}

export type OcrStepResult = {
  done: PageText[];
  failed: number[];
  remaining: number[];
};

// Runs a small batch per call so each request stays short and resumable.
export async function runOcrStep(args: {
  pdfBytes: Uint8Array;
  pending: number[];
  provider: OcrProvider;
  batchSize?: number;
}): Promise<OcrStepResult> {
  const batch = args.pending.slice(0, args.batchSize ?? OCR_PAGES_PER_STEP);
  const outcomes = await Promise.all(
    batch.map(async (page) => {
      try {
        const text = await args.provider.ocrPage(args.pdfBytes, page);
        return { page, text };
      } catch (error) {
        console.error(`[policy-ocr] page ${page} failed:`, error instanceof Error ? error.message : error);
        return { page, text: null as string | null };
      }
    }),
  );

  const done: PageText[] = outcomes
    .filter((outcome): outcome is { page: number; text: string } => outcome.text !== null)
    .map((outcome) => ({ page: outcome.page, text: outcome.text, source: "ocr" as const }));

  return {
    done,
    failed: outcomes.filter((outcome) => outcome.text === null).map((outcome) => outcome.page),
    remaining: args.pending.slice(batch.length),
  };
}

export function stillUnreadable(pages: PageText[]): number[] {
  return pages.filter((page) => pageNeedsOcr(page.text)).map((page) => page.page);
}
