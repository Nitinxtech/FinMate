import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, authError: null as Error | null }));

vi.mock("@/lib/db/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: auth.user }, error: auth.authError }) },
  }),
}));

import { ZodError, z } from "zod";
import { assertUuid, handlePolicyRequest, isUuid, json } from "@/features/policy/http";
import { PolicyInputError } from "@/lib/policy/file-validation";
import { checkPolicyRateLimit, resetPolicyRateLimits } from "@/lib/policy/rate-limit";

beforeEach(() => {
  auth.user = { id: "u1" };
  auth.authError = null;
  resetPolicyRateLimits();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("request handling", () => {
  it("refuses anonymous callers before doing any work", async () => {
    auth.user = null;
    const work = vi.fn(async () => json({ ok: true }));

    const response = await handlePolicyRequest("upload", work);
    expect(response.status).toBe(401);
    expect(work).not.toHaveBeenCalled();
  });

  it("refuses callers whose session lookup failed", async () => {
    auth.authError = new Error("jwt expired");
    const response = await handlePolicyRequest(null, async () => json({}));

    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toMatch(/jwt/i);
  });

  it("marks every response as uncacheable and not sniffable", async () => {
    const response = await handlePolicyRequest(null, async () => json({ ok: true }));

    expect(response.headers.get("cache-control")).toMatch(/no-store/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns input errors with their own status and message", async () => {
    const response = await handlePolicyRequest(null, async () => {
      throw new PolicyInputError("Only PDF files are supported.", "not_pdf", 415);
    });

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "Only PDF files are supported.", code: "not_pdf" });
  });

  it("reports validation failures without echoing the offending input", async () => {
    const response = await handlePolicyRequest(null, async () => {
      z.object({ count: z.number() }).parse({ count: "javascript:alert(document.cookie)" });
      return json({});
    });

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toMatch(/javascript|cookie/i);
  });

  it("treats malformed JSON as a client error", async () => {
    const response = await handlePolicyRequest(null, async () => {
      JSON.parse("{not json");
      return json({});
    });

    expect(response.status).toBe(400);
  });

  it("hides unexpected errors behind a generic message", async () => {
    const response = await handlePolicyRequest(null, async () => {
      throw new Error('relation "policy_documents" does not exist; password=hunter2');
    });

    expect(response.status).toBe(500);
    const body = JSON.stringify(await response.json());
    expect(body).not.toMatch(/relation|policy_documents|hunter2/);
    expect(body).toMatch(/Something went wrong/);
  });

  it("still recognises a ZodError by type", () => {
    expect(new ZodError([])).toBeInstanceOf(ZodError);
  });
});

describe("per-user rate limiting", () => {
  it("allows normal use and then asks the caller to slow down with a Retry-After", async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await handlePolicyRequest("upload", async () => json({ ok: true }))).status).toBe(200);
    }

    const blocked = await handlePolicyRequest("upload", async () => json({ ok: true }));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("counts each user separately and each action separately", () => {
    for (let i = 0; i < 10; i += 1) checkPolicyRateLimit("alice", "upload");

    expect(checkPolicyRateLimit("alice", "upload").allowed).toBe(false);
    expect(checkPolicyRateLimit("bob", "upload").allowed).toBe(true);
    expect(checkPolicyRateLimit("alice", "ask").allowed).toBe(true);
  });

  it("recovers once the window has passed", () => {
    const start = 1_000_000;
    for (let i = 0; i < 10; i += 1) checkPolicyRateLimit("carol", "upload", start);

    expect(checkPolicyRateLimit("carol", "upload", start + 1000).allowed).toBe(false);
    expect(checkPolicyRateLimit("carol", "upload", start + 61 * 60 * 1000).allowed).toBe(true);
  });
});

describe("identifier validation", () => {
  it.each(["not-a-uuid", "../../etc/passwd", "1; drop table policy_documents", "", "ask", "' OR '1'='1"])("rejects %s", (value) => {
    expect(isUuid(value)).toBe(false);
    expect(() => assertUuid(value)).toThrow(PolicyInputError);
  });

  it("accepts a real id", () => {
    expect(assertUuid("11111111-1111-4111-8111-111111111111")).toBe("11111111-1111-4111-8111-111111111111");
  });
});
