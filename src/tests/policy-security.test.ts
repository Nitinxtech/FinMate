import { describe, expect, it, vi } from "vitest";
import { buildPdf, buildScannedPdf } from "./helpers/pdf";
import { PolicyInputError, hasPdfMagic, validatePdfBytes, validateUploadMeta } from "@/lib/policy/file-validation";
import { MAX_FILE_BYTES, MAX_PAGES } from "@/lib/policy/limits";
import { extractPdfPages } from "@/lib/policy/pdf-text";
import { extractSinglePagePdf } from "@/lib/policy/ocr";
import { runOcrStep } from "@/lib/policy/pipeline";
import { quoteAppearsIn, safeFilename, sanitizeDocumentText } from "@/lib/policy/sanitize";
import { healthPolicyA, hiddenCharactersPolicy } from "./fixtures/policies";
import { PDFDocument } from "pdf-lib";

async function rejection(work: () => unknown | Promise<unknown>): Promise<PolicyInputError> {
  try {
    await work();
  } catch (error) {
    return error as PolicyInputError;
  }

  throw new Error("Expected the call to be rejected");
}

describe("upload validation", () => {
  it("accepts a normal PDF", async () => {
    const bytes = await buildPdf({ pages: ["SECTION 1: BENEFITS"] });
    expect(() => validatePdfBytes(bytes)).not.toThrow();
  });

  it("rejects files that are not PDFs even if named .pdf", async () => {
    const fake = new TextEncoder().encode("MZ\u0090\u0000 this is an executable pretending to be a pdf");
    expect(hasPdfMagic(fake)).toBe(false);
    expect((await rejection(() => validatePdfBytes(fake))).code).toBe("not_pdf");
  });

  it("rejects empty and oversized files", async () => {
    expect((await rejection(() => validatePdfBytes(new Uint8Array(0)))).code).toBe("empty");

    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set(new TextEncoder().encode("%PDF-1.7"));
    expect((await rejection(() => validatePdfBytes(big))).code).toBe("too_large");
    expect((await rejection(() => validateUploadMeta({ size: MAX_FILE_BYTES + 1, type: "application/pdf", name: "a.pdf" }))).code).toBe("too_large");
  });

  it("checks the declared type and extension before reading the body", async () => {
    expect((await rejection(() => validateUploadMeta({ size: 10, type: "text/html", name: "policy.html" }))).code).toBe("not_pdf");
    expect(() => validateUploadMeta({ size: 10, type: "application/pdf", name: "policy.pdf" })).not.toThrow();
  });

  it("rejects PDFs carrying JavaScript", async () => {
    const bytes = await buildPdf({ pages: ["hello"], withJavaScript: true });
    const error = await rejection(() => validatePdfBytes(bytes));

    expect(error.code).toBe("active_content");
    expect(error.message).toMatch(/JavaScript/);
  });

  it("rejects PDFs with embedded files", async () => {
    const bytes = await buildPdf({ pages: ["hello"], embedFile: true });
    expect((await rejection(() => validatePdfBytes(bytes))).code).toBe("active_content");
  });

  it("rejects encrypted PDFs with a helpful message", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<< /Encrypt 2 0 R >>\nendobj");
    const error = await rejection(() => validatePdfBytes(bytes));

    expect(error.code).toBe("encrypted");
    expect(error.message).toMatch(/password/i);
  });
});

describe("filename and text hygiene", () => {
  it("never keeps a path, control characters or bidi tricks in a filename", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("C:\\Users\\me\\policy.pdf")).toBe("policy.pdf");
    expect(safeFilename("po\u202Elicy\u0000.pdf")).toBe("policy.pdf");
    expect(safeFilename("")).toBe("policy.pdf");
    expect(safeFilename("a".repeat(500)).length).toBeLessThanOrEqual(120);
  });

  it("strips invisible and bidi-control characters from document text", () => {
    const cleaned = sanitizeDocumentText("pre\u200Bexisting \u202Edisease\u202C\u0007 is not co\u200Bvered");
    expect(cleaned).toBe("preexisting disease is not covered");
  });

  it("lets the grounding check see through hidden characters", () => {
    expect(quoteAppearsIn("pre-existing diseases are excluded", "Pre\u2011existing   Diseases are EXCLUDED for 36 months")).toBe(true);
    expect(quoteAppearsIn("covered in full", "not covered")).toBe(false);
  });
});

describe("PDF text extraction", () => {
  it("returns text page by page with the layout needed for clauses", async () => {
    const bytes = await buildPdf({ pages: healthPolicyA.slice(0, 3) });
    const result = await extractPdfPages(bytes);

    expect(result.pageCount).toBe(3);
    expect(result.pages[2].page).toBe(3);
    expect(result.pages[2].text).toContain("2.5 Room Rent");
    expect(result.pages[2].source).toBe("text");
    expect(result.ocrPages).toEqual([]);
  });

  it("flags pages without a text layer as needing OCR", async () => {
    const bytes = await buildScannedPdf(3);
    const result = await extractPdfPages(bytes);

    expect(result.pageCount).toBe(3);
    expect(result.ocrPages).toEqual([1, 2, 3]);
  });

  it("only sends the unreadable pages of a mixed document to OCR", async () => {
    const doc = await PDFDocument.create();
    const text = await buildPdf({ pages: ["SECTION 1: BENEFITS 1.1 We will pay hospital expenses for the insured person."] });
    const [textPage] = await doc.copyPages(await PDFDocument.load(text), [0]);
    doc.addPage(textPage);
    doc.addPage([595, 842]);
    const result = await extractPdfPages(await doc.save({ useObjectStreams: false }));

    expect(result.ocrPages).toEqual([2]);
  });

  it("refuses documents with more pages than the limit", async () => {
    const bytes = await buildPdf({ pages: Array.from({ length: MAX_PAGES + 1 }, (_, index) => `Page ${index + 1} of text content for the policy`) });
    expect((await rejection(() => extractPdfPages(bytes))).code).toBe("too_many_pages");
  });

  it("reports damaged files cleanly instead of crashing", async () => {
    const broken = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF");
    expect((await rejection(() => extractPdfPages(broken))).code).toBe("unreadable");
  });

  it("removes hidden characters from extracted text", async () => {
    const bytes = await buildPdf({ pages: hiddenCharactersPolicy });
    const result = await extractPdfPages(bytes);
    expect(result.pages[0].text).not.toMatch(/[\u200B\u202E]/);
  });
});

describe("OCR fallback", () => {
  it("builds a one-page PDF so a scan page can be sent on its own", async () => {
    const bytes = await buildPdf({ pages: ["page one text", "page two text", "page three text"] });
    const single = await extractSinglePagePdf(bytes, 2);

    const reread = await extractPdfPages(single);
    expect(reread.pageCount).toBe(1);
    expect(reread.pages[0].text).toContain("page two");
  });

  it("OCRs in small batches, marks results as OCR, and keeps going if a page fails", async () => {
    const provider = {
      ocrPage: vi.fn(async (_bytes: Uint8Array, page: number) => {
        if (page === 2) throw new Error("model timeout");
        return `SECTION ${page}: EXCLUSIONS\n${page}.1 Cosmetic surgery is not covered.`;
      }),
    };

    const step = await runOcrStep({ pdfBytes: new Uint8Array(1), pending: [1, 2, 3, 4, 5], provider, batchSize: 3 });

    expect(provider.ocrPage).toHaveBeenCalledTimes(3);
    expect(step.done.map((page) => page.page)).toEqual([1, 3]);
    expect(step.done.every((page) => page.source === "ocr")).toBe(true);
    expect(step.failed).toEqual([2]);
    expect(step.remaining).toEqual([4, 5]);
  });
});
