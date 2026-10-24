import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PolicyClauseRow, PolicyDocumentRow } from "@/types/database";
import { buildPdf, buildScannedPdf } from "./helpers/pdf";
import { healthPolicyA, promptInjectionPolicy } from "./fixtures/policies";

// An in-memory stand-in for the repository, so the real orchestration runs without a database.
const store = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
  pages: new Map<string, Map<number, { page: number; text: string; source: "text" | "ocr" }>>(),
  clauses: new Map<string, unknown[]>(),
  files: new Map<string, Uint8Array>(),
  log: [] as string[],
  failInsert: false,
}));

vi.mock("@/features/policy/repository", async () => {
  const actual = await vi.importActual<typeof import("@/features/policy/repository")>("@/features/policy/repository");
  const row = (id: string) => store.documents.get(id) as unknown as PolicyDocumentRow | undefined;

  return {
    ...actual,
    insertDocument: vi.fn(async (_s: unknown, values: Record<string, unknown>) => {
      if (store.failInsert) throw new Error("db down");
      const created = { page_count: null, status_detail: null, pending_ocr_pages: [], ocr_total: 0, policy_type: "other", type_confidence: null, is_insurance_policy: true, classification: {}, insurer: null, extraction: {}, created_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z", source_url: null, ...values };
      store.documents.set(String(values.id), created);
      return created as unknown as PolicyDocumentRow;
    }),
    requireDocument: vi.fn(async (_s: unknown, userId: string, id: string) => {
      const found = row(id);
      if (!found || found.user_id !== userId) {
        const { PolicyInputError } = await import("@/lib/policy/file-validation");
        throw new PolicyInputError("That policy was not found.", "not_found", 404);
      }
      return { ...found };
    }),
    getDocument: vi.fn(async (_s: unknown, userId: string, id: string) => {
      const found = row(id);
      return found && found.user_id === userId ? { ...found } : null;
    }),
    claimForProcessing: vi.fn(async (_s: unknown, userId: string, id: string) => {
      const found = row(id);
      if (!found || found.user_id !== userId || found.status !== "uploaded") return null;
      found.status = "processing";
      return { ...found };
    }),
    updateDocument: vi.fn(async (_s: unknown, userId: string, id: string, patch: Record<string, unknown>) => {
      const found = row(id);
      if (!found || found.user_id !== userId) throw new Error("not found");
      Object.assign(found, patch);
      return { ...found };
    }),
    savePages: vi.fn(async (_s: unknown, _u: string, id: string, pages: Array<{ page: number; text: string; source: "text" | "ocr" }>) => {
      const bucket = store.pages.get(id) ?? new Map();
      pages.forEach((page) => bucket.set(page.page, page));
      store.pages.set(id, bucket);
    }),
    loadPages: vi.fn(async (_s: unknown, _u: string, id: string) => [...(store.pages.get(id)?.values() ?? [])].sort((a, b) => a.page - b.page)),
    replaceClauses: vi.fn(async (_s: unknown, _u: string, id: string, clauses: unknown[]) => {
      store.clauses.set(id, clauses);
    }),
    loadClauses: vi.fn(async (_s: unknown, _u: string, id: string) => (store.clauses.get(id) ?? []) as PolicyClauseRow[]),
    uploadTemporaryFile: vi.fn(async (_s: unknown, path: string, bytes: Uint8Array) => {
      store.files.set(path, bytes);
      store.log.push(`upload ${path}`);
    }),
    downloadTemporaryFile: vi.fn(async (_s: unknown, path: string) => {
      const bytes = store.files.get(path);
      if (!bytes) throw new Error("missing file");
      return bytes;
    }),
    removeTemporaryFile: vi.fn(async (_s: unknown, path: string | null) => {
      if (path) {
        store.files.delete(path);
        store.log.push(`remove ${path}`);
      }
    }),
  };
});

import { ingestPdf, processStep, loadBundle } from "@/features/policy/service";
import { PolicyInputError } from "@/lib/policy/file-validation";
import type { OcrProvider } from "@/lib/policy/ocr";

const supabase = {} as never;
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";

const upload = (bytes: Uint8Array, filename = "My Policy.pdf", userId = alice) =>
  ingestPdf({ supabase, userId, bytes, filename, sourceKind: "upload" });

async function runToCompletion(id: string, userId = alice, ocr?: OcrProvider, maxSteps = 30) {
  for (let step = 0; step < maxSteps; step += 1) {
    const summary = await processStep({ supabase, userId, id, ocr });
    if (summary.status === "ready" || summary.status === "failed") {
      return { summary, steps: step + 1 };
    }
  }
  throw new Error("Processing did not finish");
}

beforeEach(() => {
  store.documents.clear();
  store.pages.clear();
  store.clauses.clear();
  store.files.clear();
  store.log.length = 0;
  store.failInsert = false;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("upload", () => {
  it("stores the working copy under ids only, never the user's filename", async () => {
    const bytes = await buildPdf({ pages: healthPolicyA });
    const summary = await upload(bytes, "../../etc/passwd<script>.pdf");

    const [path] = [...store.files.keys()];
    expect(path).toBe(`${alice}/${summary.id}.pdf`);
    expect(path).not.toMatch(/passwd|script|\.\./);
    expect(summary.originalFilename).not.toMatch(/[\\/<>]/);
    expect(summary.status).toBe("uploaded");
    expect(summary.hasTemporaryFile).toBe(true);
    expect(summary.fileExpiresAt).not.toBeNull();
  });

  it("rejects unsafe files before anything is stored", async () => {
    const hostile = await buildPdf({ pages: ["hello"], withJavaScript: true });

    await expect(upload(hostile)).rejects.toMatchObject({ code: "active_content" });
    await expect(upload(new TextEncoder().encode("not a pdf"))).rejects.toMatchObject({ code: "not_pdf" });
    expect(store.files.size).toBe(0);
    expect(store.documents.size).toBe(0);
  });

  it("removes the stored file if the database insert fails", async () => {
    store.failInsert = true;
    const bytes = await buildPdf({ pages: healthPolicyA });

    await expect(upload(bytes)).rejects.toThrow("db down");
    expect(store.files.size).toBe(0);
  });
});

describe("processing a text PDF", () => {
  it("finishes in one step, saves pages and clauses, and deletes the temporary file", async () => {
    const summary = await upload(await buildPdf({ pages: healthPolicyA }));
    const { summary: done, steps } = await runToCompletion(summary.id);

    expect(steps).toBe(1);
    expect(done.status).toBe("ready");
    expect(done.policyType).toBe("health");
    expect(done.pageCount).toBe(6);
    expect(done.factCount).toBeGreaterThan(20);
    expect(done.hasTemporaryFile).toBe(false);
    expect(done.fileExpiresAt).toBeNull();
    expect(store.files.size).toBe(0);
    expect(store.pages.get(summary.id)?.size).toBe(6);
    expect((store.clauses.get(summary.id) ?? []).length).toBeGreaterThan(20);
  });

  it("serves the viewer bundle with page text and clause references", async () => {
    const summary = await upload(await buildPdf({ pages: healthPolicyA }));
    await runToCompletion(summary.id);
    const bundle = await loadBundle(supabase, alice, summary.id);

    expect(bundle.pages[2].text).toContain("Room Rent");
    expect(bundle.clauses.some((clause) => clause.ref === "2.5" && clause.page === 3)).toBe(true);
    expect(bundle.extraction?.facts.some((fact) => fact.category === "waiting_period")).toBe(true);
  });

  it("does not reprocess a policy that is already ready", async () => {
    const summary = await upload(await buildPdf({ pages: healthPolicyA }));
    await runToCompletion(summary.id);
    const removalsBefore = store.log.filter((line) => line.startsWith("remove")).length;

    const again = await processStep({ supabase, userId: alice, id: summary.id });
    expect(again.status).toBe("ready");
    expect(store.log.filter((line) => line.startsWith("remove")).length).toBe(removalsBefore);
  });

  it("quarantines planted instructions and tells the user", async () => {
    const summary = await upload(await buildPdf({ pages: promptInjectionPolicy }));
    await runToCompletion(summary.id);
    const bundle = await loadBundle(supabase, alice, summary.id);

    expect(JSON.stringify(bundle.clauses)).not.toMatch(/IGNORE ALL PREVIOUS/i);
    expect(bundle.extraction?.issues.some((issue) => /instructions aimed at an AI/i.test(issue.message))).toBe(true);
    // The viewer still shows the genuine page text so the user can see what the document contained.
    expect(bundle.pages[1].text).toMatch(/IGNORE ALL PREVIOUS/i);
  });
});

describe("OCR for scanned PDFs", () => {
  const page = (n: number) => `SECTION ${n}: EXCLUSIONS\n${n}.1 Cosmetic surgery is not covered under this policy.\nSum Insured: INR 5,00,000 per policy year`;

  it("reads scanned pages in small steps and marks them as OCR", async () => {
    const calls: number[] = [];
    const provider: OcrProvider = { ocrPage: async (_bytes, p) => { calls.push(p); return page(p); } };
    const summary = await upload(await buildScannedPdf(7));

    const first = await processStep({ supabase, userId: alice, id: summary.id, ocr: provider });
    expect(first.status).toBe("processing");
    expect(first.ocr).toEqual({ done: 0, total: 7 });
    expect(store.files.size).toBe(1);

    const { summary: done, steps } = await runToCompletion(summary.id, alice, provider);
    expect(steps).toBe(3);
    expect(calls.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(done.status).toBe("ready");
    expect(store.files.size).toBe(0);

    const bundle = await loadBundle(supabase, alice, summary.id);
    expect(bundle.pages.every((p) => p.source === "ocr")).toBe(true);
    expect(bundle.extraction?.issues.some((issue) => issue.kind === "quality" && /OCR/.test(issue.message))).toBe(true);
  });

  it("finishes even when some pages cannot be read, and says which are unreadable", async () => {
    const provider: OcrProvider = { ocrPage: async (_bytes, p) => { if (p === 2) throw new Error("timeout"); return page(p); } };
    const summary = await upload(await buildScannedPdf(3));
    const { summary: done } = await runToCompletion(summary.id, alice, provider);
    const bundle = await loadBundle(supabase, alice, summary.id);

    expect(done.status).toBe("ready");
    expect(bundle.extraction?.issues.some((issue) => /No readable text was found on page 2/.test(issue.message))).toBe(true);
  });

  it("caps how many scanned pages are sent to OCR", async () => {
    const calls: number[] = [];
    const provider: OcrProvider = { ocrPage: async (_bytes, p) => { calls.push(p); return page(p); } };
    const summary = await upload(await buildScannedPdf(34));
    const first = await processStep({ supabase, userId: alice, id: summary.id, ocr: provider });

    expect(first.ocr.total).toBe(30);
    expect(first.statusDetail).toMatch(/Only the first 30 scanned pages/);
    await runToCompletion(summary.id, alice, provider);
    expect(calls).toHaveLength(30);
  });
});

describe("failure handling", () => {
  it("marks a corrupt file failed with a clear message and deletes the working copy", async () => {
    const broken = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF");
    const summary = await upload(broken);
    const { summary: done } = await runToCompletion(summary.id);

    expect(done.status).toBe("failed");
    expect(done.statusDetail).toMatch(/could not be read/i);
    expect(done.hasTemporaryFile).toBe(false);
    expect(store.files.size).toBe(0);
  });

  it("never exposes internal error text to the user", async () => {
    const summary = await upload(await buildPdf({ pages: healthPolicyA }));
    store.files.clear();
    const { summary: done } = await runToCompletion(summary.id);

    expect(done.status).toBe("failed");
    expect(done.statusDetail).not.toMatch(/missing file|stack|supabase|ECONN/i);
  });

  it("lets only one of two overlapping requests start processing", async () => {
    const summary = await upload(await buildPdf({ pages: healthPolicyA }));
    const [a, b] = await Promise.all([
      processStep({ supabase, userId: alice, id: summary.id }),
      processStep({ supabase, userId: alice, id: summary.id }),
    ]);

    expect([a.status, b.status].filter((status) => status === "ready")).toHaveLength(1);
    expect(store.pages.get(summary.id)?.size).toBe(6);
  });
});

describe("access control", () => {
  it("does not let another user process, read or learn about a policy", async () => {
    const summary = await upload(await buildPdf({ pages: healthPolicyA }), "mine.pdf", alice);
    await runToCompletion(summary.id);

    await expect(processStep({ supabase, userId: bob, id: summary.id })).rejects.toBeInstanceOf(PolicyInputError);
    await expect(loadBundle(supabase, bob, summary.id)).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(loadBundle(supabase, bob, "33333333-3333-4333-8333-333333333333")).rejects.toMatchObject({ code: "not_found" });
  });
});
