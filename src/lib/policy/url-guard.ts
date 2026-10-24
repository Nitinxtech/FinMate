import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import { PolicyInputError } from "@/lib/policy/file-validation";
import {
  MAX_FILE_BYTES,
  MAX_URL_LENGTH,
  MAX_URL_REDIRECTS,
  URL_FETCH_TIMEOUT_MS,
} from "@/lib/policy/limits";

const blockList = new net.BlockList();
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
const BLOCKED_V6: Array<[string, number]> = [
  ["::", 128],
  ["::1", 128],
  ["::", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
];
for (const [address, prefix] of BLOCKED_V4) {
  blockList.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of BLOCKED_V6) {
  blockList.addSubnet(address, prefix, "ipv6");
}

// Node's BlockList treats every IPv4 address as ::ffff:a.b.c.d, so a mapped-range rule would block all of IPv4.
// Mapped addresses are unwrapped and judged as the IPv4 address they really are.
function embeddedIpv4(address: string): string | null {
  const lowered = address.toLowerCase();
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(lowered);
  if (dotted) {
    return dotted[1];
  }

  const hex = /^(?:0:0:0:0:0|::):?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lowered);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }

  return null;
}

export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) {
    return true;
  }

  if (family === 6) {
    const mapped = embeddedIpv4(address);
    if (mapped) {
      return isBlockedAddress(mapped);
    }
  }

  return blockList.check(address, family === 4 ? "ipv4" : "ipv6");
}

const BLOCKED_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet", ".arpa"];

export function validatePublicUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) {
    throw new PolicyInputError("Please enter a valid web address.", "bad_url");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new PolicyInputError("Please enter a valid web address.", "bad_url");
  }

  if (url.protocol !== "https:") {
    throw new PolicyInputError("Only secure https:// links are supported.", "bad_url");
  }

  if (url.username || url.password) {
    throw new PolicyInputError("Links that contain a username or password are not supported.", "bad_url");
  }

  if (url.port && url.port !== "443") {
    throw new PolicyInputError("Only standard https links (port 443) are supported.", "blocked_url");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const isIpLiteral = net.isIP(host.replace(/^\[|\]$/g, "")) !== 0;
  if (
    isIpLiteral ||
    !host.includes(".") ||
    host === "localhost" ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    throw new PolicyInputError("That address points to a private or unsupported location.", "blocked_url");
  }

  return url;
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address?: string | dns.LookupAddress[],
  family?: number,
) => void;

export type Resolver = (hostname: string) => Promise<dns.LookupAddress[]>;

const defaultResolver: Resolver = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

// Validating at connect time (not just before) is what defeats DNS rebinding.
export function createValidatingLookup(resolver: Resolver = defaultResolver) {
  return (hostname: string, options: dns.LookupOptions, callback: LookupCallback) => {
    resolver(hostname)
      .then((addresses) => {
        if (addresses.length === 0 || addresses.some((entry) => isBlockedAddress(entry.address))) {
          const error: NodeJS.ErrnoException = new Error("Blocked destination address");
          error.code = "EBLOCKED";
          callback(error);
          return;
        }

        if (options.all) {
          callback(null, addresses);
        } else {
          callback(null, addresses[0].address, addresses[0].family);
        }
      })
      .catch((error: NodeJS.ErrnoException) => callback(error));
  };
}

export type TransportResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  destroy: () => void;
};

export type FetchTransport = (url: URL, signal: AbortSignal) => Promise<TransportResponse>;

export const httpsTransport: FetchTransport = (url, signal) =>
  new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "GET",
        agent: false,
        signal,
        lookup: createValidatingLookup() as unknown as net.LookupFunction,
        headers: {
          Accept: "application/pdf",
          "Accept-Encoding": "identity",
          "User-Agent": "finance-ai-policy-reader/1.0",
        },
      },
      (response) =>
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: response,
          destroy: () => response.destroy(),
        }),
    );

    request.on("error", reject);
    request.end();
  });

function headerValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

async function readCapped(response: TransportResponse): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;

  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > MAX_FILE_BYTES) {
      response.destroy();
      throw new PolicyInputError(
        `The linked file is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MB.`,
        "too_large",
        413,
      );
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export async function fetchPublicPdf(
  rawUrl: string,
  transport: FetchTransport = httpsTransport,
): Promise<{ bytes: Uint8Array; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);

  try {
    let url = validatePublicUrl(rawUrl);

    for (let hop = 0; hop <= MAX_URL_REDIRECTS; hop += 1) {
      const response = await transport(url, controller.signal);

      if (response.status >= 300 && response.status < 400) {
        response.destroy();
        const location = headerValue(response.headers.location);
        if (!location || hop === MAX_URL_REDIRECTS) {
          throw new PolicyInputError("The link redirected too many times.", "download_failed");
        }

        // Every hop is re-validated; a redirect must not be able to reach an internal address.
        url = validatePublicUrl(new URL(location, url).toString());
        continue;
      }

      if (response.status !== 200) {
        response.destroy();
        throw new PolicyInputError(
          `The link could not be downloaded (the server answered ${response.status}).`,
          "download_failed",
        );
      }

      const encoding = headerValue(response.headers["content-encoding"]).toLowerCase();
      if (encoding && encoding !== "identity") {
        response.destroy();
        throw new PolicyInputError("The link uses an unsupported encoding.", "download_failed");
      }

      const contentType = headerValue(response.headers["content-type"]).toLowerCase();
      const looksPdf =
        contentType.includes("application/pdf") ||
        contentType.includes("application/x-pdf") ||
        (contentType.includes("application/octet-stream") && /\.pdf$/i.test(url.pathname));
      if (!looksPdf) {
        response.destroy();
        throw new PolicyInputError(
          "The link does not point directly to a PDF file. Please use a direct PDF link or upload the file.",
          "not_pdf",
          415,
        );
      }

      const declaredLength = Number(headerValue(response.headers["content-length"]));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_BYTES) {
        response.destroy();
        throw new PolicyInputError(
          `The linked file is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MB.`,
          "too_large",
          413,
        );
      }

      return { bytes: await readCapped(response), finalUrl: url.toString() };
    }

    throw new PolicyInputError("The link redirected too many times.", "download_failed");
  } catch (error) {
    if (error instanceof PolicyInputError) {
      throw error;
    }

    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "EBLOCKED") {
      throw new PolicyInputError("That address points to a private or unsupported location.", "blocked_url");
    }

    throw new PolicyInputError(
      controller.signal.aborted
        ? "The link took too long to respond."
        : "The link could not be downloaded. Please check it or upload the file instead.",
      "download_failed",
    );
  } finally {
    clearTimeout(timer);
  }
}
