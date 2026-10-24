import { describe, expect, it, vi } from "vitest";
import { PolicyInputError } from "@/lib/policy/file-validation";
import { MAX_FILE_BYTES } from "@/lib/policy/limits";
import {
  createValidatingLookup,
  fetchPublicPdf,
  isBlockedAddress,
  validatePublicUrl,
  type FetchTransport,
  type TransportResponse,
} from "@/lib/policy/url-guard";

const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\n% fake but sufficient for transport tests\n");

function respond(overrides: Partial<TransportResponse> & { chunks?: Uint8Array[] } = {}): TransportResponse {
  const chunks = overrides.chunks ?? [PDF_BYTES];
  return {
    status: overrides.status ?? 200,
    headers: overrides.headers ?? { "content-type": "application/pdf" },
    body: overrides.body ?? (async function* () { yield* chunks; })(),
    destroy: overrides.destroy ?? (() => undefined),
  };
}

async function code(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error) {
    return (error as PolicyInputError).code ?? (error as Error).message;
  }
  return "no-error";
}

describe("URL validation", () => {
  it("accepts an ordinary https link", () => {
    expect(validatePublicUrl("https://www.example-insurer.com/docs/policy.pdf").hostname).toBe("www.example-insurer.com");
  });

  it.each([
    ["http://example.com/policy.pdf", "bad_url"],
    ["ftp://example.com/policy.pdf", "bad_url"],
    ["file:///etc/passwd", "bad_url"],
    ["javascript:alert(1)", "bad_url"],
    ["data:application/pdf;base64,AAAA", "bad_url"],
    ["https://user:pass@example.com/a.pdf", "bad_url"],
    ["https://example.com:8443/a.pdf", "blocked_url"],
    ["https://127.0.0.1/a.pdf", "blocked_url"],
    ["https://169.254.169.254/latest/meta-data/", "blocked_url"],
    ["https://[::1]/a.pdf", "blocked_url"],
    ["https://[fd00::1]/a.pdf", "blocked_url"],
    ["https://2130706433/a.pdf", "blocked_url"],
    ["https://0x7f.0.0.1/a.pdf", "blocked_url"],
    ["https://localhost/a.pdf", "blocked_url"],
    ["https://printer.local/a.pdf", "blocked_url"],
    ["https://metadata.google.internal/a.pdf", "blocked_url"],
    ["https://intranet/a.pdf", "blocked_url"],
    ["not a url", "bad_url"],
    ["", "bad_url"],
  ])("rejects %s", (url, expected) => {
    let thrown: PolicyInputError | null = null;
    try {
      validatePublicUrl(url);
    } catch (error) {
      thrown = error as PolicyInputError;
    }

    expect(thrown?.code).toBe(expected);
  });

  it("rejects absurdly long links", () => {
    expect(() => validatePublicUrl(`https://example.com/${"a".repeat(3000)}`)).toThrow(PolicyInputError);
  });
});

describe("blocked address ranges", () => {
  it.each(["10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "127.0.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fe80::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe"])(
    "blocks %s",
    (address) => expect(isBlockedAddress(address)).toBe(true),
  );

  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows public address %s", (address) =>
    expect(isBlockedAddress(address)).toBe(false),
  );

  it("treats anything that is not an IP as blocked", () => {
    expect(isBlockedAddress("example.com")).toBe(true);
  });
});

describe("DNS rebinding protection", () => {
  const run = (addresses: Array<{ address: string; family: number }>) =>
    new Promise<{ error: NodeJS.ErrnoException | null; address?: unknown }>((resolve) => {
      createValidatingLookup(async () => addresses)("insurer.example", {}, (error, address) => resolve({ error, address }));
    });

  it("lets a public destination through", async () => {
    const result = await run([{ address: "93.184.216.34", family: 4 }]);
    expect(result.error).toBeNull();
    expect(result.address).toBe("93.184.216.34");
  });

  it("blocks a hostname that resolves to a private address", async () => {
    expect((await run([{ address: "10.0.0.5", family: 4 }])).error?.code).toBe("EBLOCKED");
  });

  it("blocks when any resolved address is private, so a mixed answer cannot slip through", async () => {
    expect((await run([{ address: "93.184.216.34", family: 4 }, { address: "169.254.169.254", family: 4 }])).error?.code).toBe("EBLOCKED");
  });

  it("blocks an empty answer", async () => {
    expect((await run([])).error?.code).toBe("EBLOCKED");
  });
});

describe("fetching a public PDF", () => {
  it("downloads a direct PDF link", async () => {
    const transport: FetchTransport = vi.fn(async () => respond());
    const result = await fetchPublicPdf("https://insurer.example/policy.pdf", transport);

    expect(result.finalUrl).toBe("https://insurer.example/policy.pdf");
    expect(Buffer.from(result.bytes).toString("latin1")).toContain("%PDF-1.7");
  });

  it("sends no cookies or credentials and asks for an uncompressed body", async () => {
    const seen: URL[] = [];
    await fetchPublicPdf("https://insurer.example/policy.pdf", async (url) => {
      seen.push(url);
      return respond();
    });

    expect(seen).toHaveLength(1);
  });

  it("follows a redirect to another public host", async () => {
    const transport: FetchTransport = vi
      .fn<FetchTransport>()
      .mockResolvedValueOnce(respond({ status: 302, headers: { location: "https://cdn.example/files/policy.pdf" } }))
      .mockResolvedValueOnce(respond());

    const result = await fetchPublicPdf("https://insurer.example/get", transport);
    expect(result.finalUrl).toBe("https://cdn.example/files/policy.pdf");
  });

  it("refuses a redirect that points at an internal address", async () => {
    const transport: FetchTransport = vi.fn(async () => respond({ status: 302, headers: { location: "https://169.254.169.254/latest/meta-data/" } }));
    expect(await code(() => fetchPublicPdf("https://insurer.example/get", transport))).toBe("blocked_url");
  });

  it("refuses a redirect that downgrades to http", async () => {
    const transport: FetchTransport = vi.fn(async () => respond({ status: 301, headers: { location: "http://insurer.example/policy.pdf" } }));
    expect(await code(() => fetchPublicPdf("https://insurer.example/get", transport))).toBe("bad_url");
  });

  it("gives up after too many redirects", async () => {
    const transport: FetchTransport = vi.fn(async () => respond({ status: 302, headers: { location: "https://insurer.example/again" } }));
    expect(await code(() => fetchPublicPdf("https://insurer.example/get", transport))).toBe("download_failed");
  });

  it("rejects links that are not PDFs", async () => {
    const transport: FetchTransport = async () => respond({ headers: { "content-type": "text/html; charset=utf-8" } });
    expect(await code(() => fetchPublicPdf("https://insurer.example/page", transport))).toBe("not_pdf");
  });

  it("rejects compressed responses so a small download cannot expand past the limit", async () => {
    const transport: FetchTransport = async () => respond({ headers: { "content-type": "application/pdf", "content-encoding": "gzip" } });
    expect(await code(() => fetchPublicPdf("https://insurer.example/policy.pdf", transport))).toBe("download_failed");
  });

  it("rejects non-200 answers", async () => {
    expect(await code(() => fetchPublicPdf("https://insurer.example/policy.pdf", async () => respond({ status: 404 })))).toBe("download_failed");
  });

  it("refuses a declared size over the limit without reading the body", async () => {
    const destroy = vi.fn();
    const transport: FetchTransport = async () =>
      respond({ headers: { "content-type": "application/pdf", "content-length": String(MAX_FILE_BYTES + 1) }, destroy });

    expect(await code(() => fetchPublicPdf("https://insurer.example/policy.pdf", transport))).toBe("too_large");
    expect(destroy).toHaveBeenCalled();
  });

  it("stops reading a body that lies about its size", async () => {
    const destroy = vi.fn();
    const chunk = new Uint8Array(1024 * 1024);
    const transport: FetchTransport = async () =>
      respond({
        destroy,
        body: (async function* () {
          for (let index = 0; index < 20; index += 1) yield chunk;
        })(),
      });

    expect(await code(() => fetchPublicPdf("https://insurer.example/policy.pdf", transport))).toBe("too_large");
    expect(destroy).toHaveBeenCalled();
  });

  it("turns a refused connection into a friendly message", async () => {
    const transport: FetchTransport = async () => {
      const error: NodeJS.ErrnoException = new Error("blocked");
      error.code = "EBLOCKED";
      throw error;
    };

    expect(await code(() => fetchPublicPdf("https://insurer.example/policy.pdf", transport))).toBe("blocked_url");
  });

  it("never validates a private literal before any network call is made", async () => {
    const transport = vi.fn<FetchTransport>();
    expect(await code(() => fetchPublicPdf("https://10.0.0.1/policy.pdf", transport))).toBe("blocked_url");
    expect(transport).not.toHaveBeenCalled();
  });
});
