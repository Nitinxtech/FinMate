import type { Issue, PageText } from "@/lib/policy/types";

// Text addressed to an AI system rather than to a policyholder. Real policy wording never contains these.
const INSTRUCTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier|preceding)\s+(?:instructions?|prompts?|rules?|context)/i,
  /disregard\s+(?:all\s+|any\s+|the\s+)?(?:(?:previous|prior|above|earlier|preceding|your)\s+)+(?:instructions?|prompts?|rules?)/i,
  // "You are now covered" is ordinary policy wording; only role reassignment is suspicious.
  /\byou\s+are\s+now\s+(?:an?\s+|the\s+)?(?:[\w']+\s+){0,2}(?:ai|assistant|chatbot|language model|llm|bot|claims officer|underwriter)\b/i,
  /\bact\s+as\s+(?:an?\s+|the\s+)?(?:[\w']+\s+){0,2}(?:ai|assistant|chatbot|language model|llm|bot|claims officer)\b/i,
  /^\s*(?:system|assistant|developer)\s*:/i,
  /reveal\s+(?:your\s+|the\s+)?(?:hidden\s+|system\s+|secret\s+)?(?:instructions?|prompts?)/i,
  /(?:new|updated)\s+instructions?\s*:/i,
  /do\s+not\s+(?:tell|inform|warn|mention)\s+(?:the\s+)?user/i,
  /\{\s*"(?:answer|claims|status|role)"\s*:/i,
  /<\/?(?:system|assistant|instructions?|prompt)>/i,
  /\bprompt\s+injection\b/i,
];

export function looksLikeInstruction(line: string): boolean {
  return INSTRUCTION_PATTERNS.some((pattern) => pattern.test(line));
}

export type QuarantineResult = {
  pages: PageText[];
  flaggedPages: number[];
  flaggedLines: number;
};

// Pages shown to the user keep their original text; only the copy used for analysis is filtered.
export function quarantineInstructions(pages: PageText[]): QuarantineResult {
  const flaggedPages = new Set<number>();
  let flaggedLines = 0;

  const cleaned = pages.map((page) => {
    const kept: string[] = [];
    for (const line of page.text.split("\n")) {
      if (looksLikeInstruction(line)) {
        flaggedPages.add(page.page);
        flaggedLines += 1;
      } else {
        kept.push(line);
      }
    }

    return { ...page, text: kept.join("\n") };
  });

  return { pages: cleaned, flaggedPages: [...flaggedPages].sort((a, b) => a - b), flaggedLines };
}

export function quarantineIssue(result: QuarantineResult): Issue | null {
  if (result.flaggedLines === 0) {
    return null;
  }

  return {
    kind: "quality",
    severity: "warning",
    message: `Page${result.flaggedPages.length === 1 ? "" : "s"} ${result.flaggedPages.join(", ")} contain${result.flaggedPages.length === 1 ? "s" : ""} text that looks like instructions aimed at an AI system (for example "ignore previous instructions"). That text was treated as ordinary document text, ignored for analysis, and never followed. Treat this document with caution.`,
    citations: [],
  };
}
