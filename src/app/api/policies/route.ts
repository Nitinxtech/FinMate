import type { NextRequest } from "next/server";
import { z } from "zod";
import { handlePolicyRequest, json } from "@/features/policy/http";
import { listDocuments, summarize } from "@/features/policy/repository";
import { ingestPdf, purgeOwnExpired } from "@/features/policy/service";
import { PolicyInputError, validateUploadMeta } from "@/lib/policy/file-validation";
import { MAX_FILE_BYTES, MAX_URL_LENGTH } from "@/lib/policy/limits";
import { fetchPublicPdf } from "@/lib/policy/url-guard";

const urlBodySchema = z.object({ url: z.string().trim().min(1).max(MAX_URL_LENGTH) });
// Multipart framing adds a little to the file itself.
const MAX_BODY_BYTES = MAX_FILE_BYTES + 256 * 1024;

export async function GET() {
  return handlePolicyRequest(null, async ({ supabase, user }) => {
    const rows = await listDocuments(supabase, user.id);
    return json({ documents: rows.map(summarize) });
  });
}

export async function POST(request: NextRequest) {
  return handlePolicyRequest("upload", async ({ supabase, user }) => {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      throw new PolicyInputError(`The file is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MB. Please upload a smaller PDF.`, "too_large", 413);
    }

    await purgeOwnExpired(supabase, user.id);

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const { url } = urlBodySchema.parse(await request.json());
      const fetched = await fetchPublicPdf(url);
      const filename = decodeURIComponent(new URL(fetched.finalUrl).pathname.split("/").pop() ?? "") || "policy.pdf";
      const document = await ingestPdf({ supabase, userId: user.id, bytes: fetched.bytes, filename, sourceKind: "url", sourceUrl: fetched.finalUrl });
      return json({ document }, 201);
    }

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        throw new PolicyInputError("Please choose a PDF file to upload.", "not_pdf");
      }

      validateUploadMeta({ size: file.size, type: file.type, name: file.name });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const document = await ingestPdf({ supabase, userId: user.id, bytes, filename: file.name, sourceKind: "upload" });
      return json({ document }, 201);
    }

    throw new PolicyInputError("Send a PDF file or a link to one.", "not_pdf", 415);
  });
}
