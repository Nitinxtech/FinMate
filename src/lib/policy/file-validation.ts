import { createHash } from "node:crypto";
import { MAX_FILE_BYTES } from "@/lib/policy/limits";

export class PolicyInputError extends Error {
  constructor(
    message: string,
    readonly code:
      | "too_large"
      | "empty"
      | "not_pdf"
      | "active_content"
      | "encrypted"
      | "bad_url"
      | "blocked_url"
      | "download_failed"
      | "too_many_pages"
      | "unreadable"
      | "rate_limited"
      | "not_found",
    readonly status = 400,
  ) {
    super(message);
    this.name = "PolicyInputError";
  }
}

// PDF names that run code, launch programs or smuggle files. Heuristic byte scan: defence in depth only,
// because this module never executes document content.
const ACTIVE_CONTENT_MARKERS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\/JavaScript\b/, label: "JavaScript" },
  { pattern: /\/JS\s*[(<\[]/, label: "JavaScript" },
  { pattern: /\/Launch\b/, label: "launch action" },
  { pattern: /\/EmbeddedFile\b/, label: "embedded file" },
  { pattern: /\/RichMedia\b/, label: "rich media" },
  { pattern: /\/XFA\b/, label: "XFA form" },
  { pattern: /\/SubmitForm\b/, label: "form submission" },
  { pattern: /\/ImportData\b/, label: "data import" },
];

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function hasPdfMagic(bytes: Uint8Array): boolean {
  // The spec allows a little leading junk, but real PDFs open with the header within the first 1 KB.
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

export function validatePdfBytes(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) {
    throw new PolicyInputError("The file is empty.", "empty");
  }

  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new PolicyInputError(
      `The file is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MB. Please upload a smaller PDF.`,
      "too_large",
      413,
    );
  }

  if (!hasPdfMagic(bytes)) {
    throw new PolicyInputError("The file is not a valid PDF.", "not_pdf", 415);
  }

  const text = Buffer.from(bytes).toString("latin1");

  if (/\/Encrypt\b/.test(text)) {
    throw new PolicyInputError(
      "This PDF is password-protected or encrypted. Please remove the protection and upload it again.",
      "encrypted",
    );
  }

  for (const marker of ACTIVE_CONTENT_MARKERS) {
    if (marker.pattern.test(text)) {
      throw new PolicyInputError(
        `This PDF contains active or embedded content (${marker.label}) and was rejected for safety.`,
        "active_content",
      );
    }
  }
}

export function validateUploadMeta(file: { size: number; type: string; name: string }): void {
  if (file.size === 0) {
    throw new PolicyInputError("The file is empty.", "empty");
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new PolicyInputError(
      `The file is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MB. Please upload a smaller PDF.`,
      "too_large",
      413,
    );
  }

  const declaredPdf = file.type === "application/pdf" || file.type === "application/x-pdf";
  if (!declaredPdf && !/\.pdf$/i.test(file.name)) {
    throw new PolicyInputError("Only PDF files are supported.", "not_pdf", 415);
  }
}
