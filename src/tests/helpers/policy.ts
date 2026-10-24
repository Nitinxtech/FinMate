import { analyzePages } from "@/lib/policy/pipeline";
import { sanitizeDocumentText } from "@/lib/policy/sanitize";
import { buildPassages } from "@/lib/policy/retrieval";
import type { Classification, Clause, Extraction, PageText } from "@/lib/policy/types";
import type { QaDocument } from "@/lib/policy/qa";

export type AnalyzedPolicy = {
  doc: { id: string; title: string };
  pages: PageText[];
  clauses: Clause[];
  extraction: Extraction;
  classification: Classification;
};

export function toPages(texts: string[], source: PageText["source"] = "text"): PageText[] {
  return texts.map((text, position) => ({ page: position + 1, text: sanitizeDocumentText(text), source }));
}

export function analyze(texts: string[], title = "Test policy", id = "doc-1"): AnalyzedPolicy {
  const doc = { id, title };
  const pages = toPages(texts);
  return { doc, pages, ...analyzePages(doc, pages) };
}

export function qaDocument(policy: AnalyzedPolicy): QaDocument {
  return { doc: policy.doc, clauses: policy.clauses, extraction: policy.extraction };
}

export function passagesOf(policy: AnalyzedPolicy) {
  return buildPassages(policy.clauses, policy.doc);
}
