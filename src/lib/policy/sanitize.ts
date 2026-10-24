import { MAX_PAGE_CHARS } from "@/lib/policy/limits";

// Bidi overrides/isolates, zero-width characters, BOM and soft hyphen can hide or reorder text.
const INVISIBLE_AND_BIDI = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export function sanitizeDocumentText(raw: string): string {
  const cleaned = raw
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE_AND_BIDI, "")
    .replace(CONTROL_CHARS, " ")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned.length > MAX_PAGE_CHARS ? cleaned.slice(0, MAX_PAGE_CHARS) : cleaned;
}

// Used to verify that a quoted passage genuinely appears in a source page.
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(INVISIBLE_AND_BIDI, "")
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201F\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteAppearsIn(quote: string, source: string): boolean {
  const normalizedQuote = normalizeForMatch(quote);
  if (normalizedQuote.length < 12) {
    return false;
  }

  return normalizeForMatch(source).includes(normalizedQuote);
}

export function safeFilename(raw: string | null | undefined): string {
  const base = (raw ?? "policy.pdf").split(/[\\/]/).pop() ?? "policy.pdf";
  const cleaned = base
    .normalize("NFKC")
    .replace(INVISIBLE_AND_BIDI, "")
    .replace(/[\u0000-\u001F\u007F<>:"|?*]/g, "")
    .trim();

  return (cleaned || "policy.pdf").slice(0, 120);
}

export function titleFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
  return (withoutExtension || "Insurance policy").slice(0, 120);
}
