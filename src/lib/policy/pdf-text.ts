import { extractText, getDocumentProxy } from "unpdf";
import { PolicyInputError } from "@/lib/policy/file-validation";
import { MAX_PAGES, MIN_TEXT_CHARS_PER_PAGE } from "@/lib/policy/limits";
import { sanitizeDocumentText } from "@/lib/policy/sanitize";
import type { PageText } from "@/lib/policy/types";

const PARSE_TIMEOUT_MS = 30_000;

export type PdfExtraction = {
  pageCount: number;
  pages: PageText[];
  // Pages with too little or unreadable text; these need OCR.
  ocrPages: number[];
};

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PolicyInputError(message, "unreadable")), ms);
  });

  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export function looksGarbled(text: string): boolean {
  const visible = text.replace(/\s/g, "");
  if (visible.length < MIN_TEXT_CHARS_PER_PAGE) {
    return false;
  }

  const letters = visible.match(/\p{L}/gu)?.length ?? 0;
  return letters / visible.length < 0.45;
}

export function pageNeedsOcr(text: string): boolean {
  return text.replace(/\s/g, "").length < MIN_TEXT_CHARS_PER_PAGE || looksGarbled(text);
}

export async function extractPdfPages(bytes: Uint8Array): Promise<PdfExtraction> {
  try {
    // pdf.js may take ownership of the buffer, and never evaluates font programs as code.
    const pdf = await withTimeout(
      getDocumentProxy(new Uint8Array(bytes), { isEvalSupported: false, disableFontFace: true } as never),
      PARSE_TIMEOUT_MS,
      "The PDF took too long to open.",
    );

    if (pdf.numPages > MAX_PAGES) {
      throw new PolicyInputError(
        `This PDF has ${pdf.numPages} pages. The limit is ${MAX_PAGES} pages per policy.`,
        "too_many_pages",
      );
    }

    const result = await withTimeout(
      extractText(pdf, { mergePages: false }),
      PARSE_TIMEOUT_MS,
      "The PDF took too long to read.",
    );

    const pages: PageText[] = result.text.map((raw, position) => ({
      page: position + 1,
      text: sanitizeDocumentText(raw),
      source: "text" as const,
    }));

    return {
      pageCount: pages.length,
      pages,
      ocrPages: pages.filter((page) => pageNeedsOcr(page.text)).map((page) => page.page),
    };
  } catch (error) {
    if (error instanceof PolicyInputError) {
      throw error;
    }

    throw new PolicyInputError(
      "This PDF could not be read. It may be damaged or in an unsupported format.",
      "unreadable",
    );
  }
}
