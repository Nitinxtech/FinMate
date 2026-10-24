import { beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ secret: "" }));
const sweep = vi.hoisted(() => vi.fn(async () => ({ expiredFilesRemoved: 2, stuckDocumentsFailed: 1, orphanFilesRemoved: 0 })));

vi.mock("@/lib/validation/env.server", () => ({
  env: new Proxy({}, { get: (_t, key) => (key === "CRON_SECRET" ? config.secret : "x") }),
}));
vi.mock("@/lib/db/supabase-admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/features/policy/retention", () => ({ sweepTemporaryFiles: sweep }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/policies/cleanup/route";

const SECRET = "a-long-random-secret-value-1234567890";
const call = (authorization?: string) =>
  POST(new NextRequest("http://localhost/api/policies/cleanup", { method: "POST", headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  config.secret = SECRET;
  sweep.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("retention sweep endpoint", () => {
  it("runs the sweep for the scheduler and reports what it removed", async () => {
    const response = await call(`Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ report: { expiredFilesRemoved: 2, stuckDocumentsFailed: 1, orphanFilesRemoved: 0 } });
    expect(sweep).toHaveBeenCalledOnce();
  });

  it.each([undefined, "Bearer wrong-secret", `Bearer ${SECRET}x`, SECRET.slice(0, 10), "Bearer ", "Basic abc"])(
    "looks like a missing page to anyone without the secret (%s)",
    async (header) => {
      const response = await call(header);

      expect(response.status).toBe(404);
      expect(sweep).not.toHaveBeenCalled();
    },
  );

  it("is switched off entirely when no strong secret is configured", async () => {
    for (const weak of ["", "short"]) {
      config.secret = weak;
      expect((await call(`Bearer ${weak}`)).status).toBe(404);
    }
    expect(sweep).not.toHaveBeenCalled();
  });

  it("does not leak the failure reason if the sweep breaks", async () => {
    sweep.mockRejectedValueOnce(new Error("service role key sb_secret_abc rejected"));
    const response = await call(`Bearer ${SECRET}`);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toMatch(/sb_secret|service role/i);
  });
});
