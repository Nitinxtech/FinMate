import { describe, expect, it } from "vitest";
import { deleteAllFilesForUser, sweepTemporaryFiles } from "@/features/policy/retention";
import { STUCK_PROCESSING_HOURS, TEMP_FILE_TTL_HOURS } from "@/lib/policy/limits";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-10-21T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW - hours * HOUR).toISOString();

type Row = { id: string; user_id: string; storage_path: string | null; file_expires_at: string | null; status: string; updated_at: string; status_detail?: string };
type StoredFile = { id: string; name: string; created_at: string };

// A small fake that understands just the Supabase calls the sweeper makes.
function fakeAdmin(rows: Row[], files: Record<string, StoredFile[]>) {
  const removed: string[] = [];

  const admin = {
    from: () => {
      let filters: Array<(row: Row) => boolean> = [];
      let patch: Partial<Row> | null = null;

      const builder: Record<string, unknown> = {
        select: () => builder,
        update: (values: Partial<Row>) => {
          patch = values;
          return builder;
        },
        not: (column: keyof Row, _op: string, value: unknown) => {
          filters.push((row) => row[column] !== value);
          return builder;
        },
        lt: (column: keyof Row, value: string) => {
          filters.push((row) => row[column] !== null && String(row[column]) < value);
          return builder;
        },
        in: (column: keyof Row, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return builder;
        },
        eq: (column: keyof Row, value: unknown) => {
          filters.push((row) => row[column] === value);
          if (patch) {
            const matched = rows.filter((row) => filters.every((filter) => filter(row)));
            matched.forEach((row) => Object.assign(row, patch));
            filters = [];
            patch = null;
            return Promise.resolve({ data: matched, error: null });
          }
          return builder;
        },
        limit: () => Promise.resolve({ data: rows.filter((row) => filters.every((filter) => filter(row))), error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: rows.filter((row) => filters.every((filter) => filter(row))), error: null }),
      };
      return builder;
    },
    storage: {
      from: () => ({
        list: async (folder: string) => ({
          data: folder === "" ? Object.keys(files).map((name) => ({ name, id: null })) : (files[folder] ?? []).map((file) => ({ ...file })),
          error: null,
        }),
        remove: async (paths: string[]) => {
          removed.push(...paths);
          for (const path of paths) {
            const [folder, name] = path.split("/");
            files[folder] = (files[folder] ?? []).filter((file) => file.name !== name);
          }
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
  };

  return { admin: admin as never, removed };
}

describe("retention sweep", () => {
  it("documents the retention periods it enforces", () => {
    expect(TEMP_FILE_TTL_HOURS).toBe(24);
    expect(STUCK_PROCESSING_HOURS).toBe(24);
  });

  it("deletes working copies whose retention window has ended and clears the pointer", async () => {
    const rows: Row[] = [
      { id: "old", user_id: "u1", storage_path: "u1/old.pdf", file_expires_at: hoursAgo(1), status: "ready", updated_at: hoursAgo(30) },
      { id: "fresh", user_id: "u1", storage_path: "u1/fresh.pdf", file_expires_at: new Date(NOW + 5 * HOUR).toISOString(), status: "uploaded", updated_at: hoursAgo(1) },
    ];
    const { admin, removed } = fakeAdmin(rows, {});
    const report = await sweepTemporaryFiles(admin, NOW);

    expect(removed).toContain("u1/old.pdf");
    expect(removed).not.toContain("u1/fresh.pdf");
    expect(rows.find((row) => row.id === "old")?.storage_path).toBeNull();
    expect(rows.find((row) => row.id === "fresh")?.storage_path).toBe("u1/fresh.pdf");
    expect(report.expiredFilesRemoved).toBe(1);
  });

  it("fails documents that never finished processing so they do not sit forever", async () => {
    const rows: Row[] = [
      { id: "stuck", user_id: "u1", storage_path: null, file_expires_at: null, status: "processing", updated_at: hoursAgo(STUCK_PROCESSING_HOURS + 2) },
      { id: "active", user_id: "u1", storage_path: null, file_expires_at: null, status: "processing", updated_at: hoursAgo(1) },
      { id: "done", user_id: "u1", storage_path: null, file_expires_at: null, status: "ready", updated_at: hoursAgo(500) },
    ];
    const { admin } = fakeAdmin(rows, {});
    const report = await sweepTemporaryFiles(admin, NOW);

    expect(rows.find((row) => row.id === "stuck")?.status).toBe("failed");
    expect(rows.find((row) => row.id === "stuck")?.status_detail).toMatch(/upload the document again/i);
    expect(rows.find((row) => row.id === "active")?.status).toBe("processing");
    expect(rows.find((row) => row.id === "done")?.status).toBe("ready");
    expect(report.stuckDocumentsFailed).toBe(1);
  });

  it("removes old files that no database row refers to, and keeps ones still in use", async () => {
    const rows: Row[] = [{ id: "kept", user_id: "u1", storage_path: "u1/kept.pdf", file_expires_at: new Date(NOW + 3 * HOUR).toISOString(), status: "processing", updated_at: hoursAgo(1) }];
    const files = {
      u1: [
        { id: "a", name: "orphan.pdf", created_at: hoursAgo(TEMP_FILE_TTL_HOURS + 5) },
        { id: "b", name: "kept.pdf", created_at: hoursAgo(TEMP_FILE_TTL_HOURS + 5) },
        { id: "c", name: "recent.pdf", created_at: hoursAgo(2) },
      ],
    };
    const { admin, removed } = fakeAdmin(rows, files);
    const report = await sweepTemporaryFiles(admin, NOW);

    expect(removed).toEqual(["u1/orphan.pdf"]);
    expect(report.orphanFilesRemoved).toBe(1);
  });

  it("only ever deletes: it never downloads document content", async () => {
    const { admin } = fakeAdmin([], {});
    const storage = (admin as unknown as { storage: { from: () => Record<string, unknown> } }).storage.from();

    expect(Object.keys(storage).sort()).toEqual(["list", "remove"]);
    await expect(sweepTemporaryFiles(admin, NOW)).resolves.toEqual({ expiredFilesRemoved: 0, stuckDocumentsFailed: 0, orphanFilesRemoved: 0 });
  });
});

describe("account deletion", () => {
  it("removes every stored file for the user and no one else's", async () => {
    const files = {
      u1: [{ id: "a", name: "a.pdf", created_at: hoursAgo(1) }, { id: "b", name: "b.pdf", created_at: hoursAgo(1) }],
      u2: [{ id: "c", name: "c.pdf", created_at: hoursAgo(1) }],
    };
    const { admin, removed } = fakeAdmin([], files);

    expect(await deleteAllFilesForUser(admin, "u1")).toBe(2);
    expect(removed.sort()).toEqual(["u1/a.pdf", "u1/b.pdf"]);
    expect(files.u2).toHaveLength(1);
  });
});
