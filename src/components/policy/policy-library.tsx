"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp, Link2, Loader2, ScanText, Trash2, Columns2, ShieldCheck } from "lucide-react";
import { POLICY_TYPE_LABELS, STATUS_STYLES, readError } from "@/components/policy/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PolicyDocumentSummary } from "@/features/policy/types";
import { MAX_COMPARE_DOCUMENTS, MAX_FILE_BYTES } from "@/lib/policy/limits";

const MAX_MB = MAX_FILE_BYTES / (1024 * 1024);

type Props = { initialDocuments: PolicyDocumentSummary[] };

export function PolicyLibrary({ initialDocuments }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [documents, setDocuments] = useState(initialDocuments);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  function upsert(document: PolicyDocumentSummary) {
    setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
  }

  // The server does one short step per call; keep calling until it reports a final state.
  async function processUntilDone(first: PolicyDocumentSummary) {
    let current = first;
    upsert(current);

    for (let step = 0; step < 60 && (current.status === "uploaded" || current.status === "processing"); step += 1) {
      const response = await fetch(`/api/policies/${current.id}/process`, { method: "POST" });
      if (!response.ok) {
        throw new Error(await readError(response, "Processing could not continue."));
      }

      current = ((await response.json()) as { document: PolicyDocumentSummary }).document;
      upsert(current);
      setBusy(
        current.ocr.total > 0
          ? `Reading scanned pages (${current.ocr.done} of ${current.ocr.total})...`
          : "Reading the document...",
      );
    }

    return current;
  }

  async function submit(send: () => Promise<Response>) {
    setError(null);
    setBusy("Uploading securely...");

    try {
      const response = await send();
      if (!response.ok) {
        throw new Error(await readError(response, "The upload failed."));
      }

      const created = ((await response.json()) as { document: PolicyDocumentSummary }).document;
      const finished = await processUntilDone(created);

      if (finished.status === "failed") {
        setError(finished.statusDetail ?? "This document could not be processed.");
      } else {
        router.push(`/dashboard/policies/${finished.id}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) {
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setError(`That file is larger than ${MAX_MB} MB.`);
      return;
    }

    const body = new FormData();
    body.set("file", file);
    await submit(() => fetch("/api/policies", { method: "POST", body }));
    if (fileInput.current) {
      fileInput.current.value = "";
    }
  }

  async function remove(id: string) {
    setError(null);
    const response = await fetch(`/api/policies/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setError(await readError(response, "The policy could not be deleted."));
      return;
    }

    setDocuments((current) => current.filter((item) => item.id !== id));
    setSelected((current) => current.filter((item) => item !== id));
  }

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : current.length < MAX_COMPARE_DOCUMENTS ? [...current, id] : current,
    );
  }

  const ready = documents.filter((document) => document.status === "ready");

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Add an insurance policy</h2>
            <p className="text-sm text-slate-500">
              Upload a PDF (up to {MAX_MB} MB, 80 pages) or paste a direct link to one. Scanned documents are read with OCR.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-800">
                <FileUp className="size-4 text-cyan-700" /> Upload a PDF
              </p>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                disabled={busy !== null}
                onChange={(event) => void onFile(event.target.files?.[0])}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:opacity-90 disabled:opacity-50"
              />
            </div>

            <form
              className="rounded-xl border border-slate-200 bg-white p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit(() => fetch("/api/policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }));
              }}
            >
              <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-800">
                <Link2 className="size-4 text-cyan-700" /> Or use a link
              </p>
              <div className="flex gap-2">
                <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://insurer.com/policy.pdf" disabled={busy !== null} inputMode="url" />
                <Button type="submit" disabled={busy !== null || url.trim().length === 0}>
                  Fetch
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Must be a public https link that opens a PDF directly. Links to pages, logins or private networks are refused.</p>
            </form>
          </div>

          {busy ? (
            <p className="flex items-center gap-2 rounded-lg bg-cyan-50 px-3 py-2 text-sm text-cyan-800" role="status">
              <Loader2 className="size-4 animate-spin" /> {busy}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              {error}
            </p>
          ) : null}

          <p className="flex items-start gap-2 text-xs text-slate-500">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            Your file is stored privately, visible only to you, and the original PDF is deleted as soon as it has been read (at most 24 hours later). The extracted text stays until you delete the policy.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Your policies</h2>
        {ready.length >= 2 ? (
          <Link
            href={`/dashboard/policies/compare?ids=${selected.join(",")}`}
            aria-disabled={selected.length < 2}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
              selected.length >= 2 ? "bg-cyan-600 text-white hover:opacity-90" : "pointer-events-none bg-slate-100 text-slate-400"
            }`}
          >
            <Columns2 className="size-4" /> Compare selected ({selected.length})
          </Link>
        ) : null}
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500">No policies yet. Add one above to get started.</CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {documents.map((document) => {
            const status = STATUS_STYLES[document.status];
            return (
              <li key={document.id}>
                <Card className={selected.includes(document.id) ? "border-cyan-400 ring-2 ring-cyan-100" : ""}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{document.title}</p>
                        <p className="truncate text-xs text-slate-500">{document.insurer ?? "Insurer not detected"}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
                    </div>

                    {document.status === "ready" ? (
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{POLICY_TYPE_LABELS[document.policyType]}</span>
                        {document.pageCount ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{document.pageCount} pages</span> : null}
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{document.factCount} terms found</span>
                        {document.issueCount > 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">{document.issueCount} to review</span> : null}
                        {!document.isInsurancePolicy ? <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-800">Does not look like a policy</span> : null}
                      </div>
                    ) : null}

                    {document.status === "processing" && document.ocr.total > 0 ? (
                      <p className="flex items-center gap-1.5 text-xs text-slate-600">
                        <ScanText className="size-3.5" /> OCR {document.ocr.done}/{document.ocr.total} pages
                      </p>
                    ) : null}
                    {document.status === "failed" && document.statusDetail ? <p className="text-xs text-rose-700">{document.statusDetail}</p> : null}

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {document.status === "ready" ? (
                          <>
                            <Link href={`/dashboard/policies/${document.id}`} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
                              Open
                            </Link>
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                              <input type="checkbox" checked={selected.includes(document.id)} onChange={() => toggle(document.id)} className="size-3.5" />
                              Compare
                            </label>
                          </>
                        ) : document.status === "processing" || document.status === "uploaded" ? (
                          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void processUntilDone(document).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Processing failed."))}>
                            Resume
                          </Button>
                        ) : null}
                      </div>
                      <button type="button" onClick={() => void remove(document.id)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-700" aria-label={`Delete ${document.title}`}>
                        <Trash2 className="size-3.5" /> Delete
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
