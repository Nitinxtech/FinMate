type RateBucket = {
  timestamps: number[];
  tokenEvents: Array<{ at: number; tokens: number }>;
};

const buckets = new Map<string, RateBucket>();

const REQUEST_WINDOW_MS = 5 * 60 * 1000;
const REQUEST_LIMIT = 12;
const TOKEN_WINDOW_MS = 24 * 60 * 60 * 1000;
const TOKEN_LIMIT = 120_000;

function prune(bucket: RateBucket, now: number) {
  bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp <= REQUEST_WINDOW_MS);
  bucket.tokenEvents = bucket.tokenEvents.filter((event) => now - event.at <= TOKEN_WINDOW_MS);
}

export function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 4);
}

export function enforceCopilotRateLimit(key: string, estimatedTokens: number): {
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: string;
} {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { timestamps: [], tokenEvents: [] };

  prune(bucket, now);

  if (bucket.timestamps.length >= REQUEST_LIMIT) {
    const earliest = bucket.timestamps[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((REQUEST_WINDOW_MS - (now - earliest)) / 1000));
    buckets.set(key, bucket);
    return {
      allowed: false,
      retryAfterSeconds,
      reason: "Too many co-pilot requests. Please try again shortly.",
    };
  }

  const tokenUsed = bucket.tokenEvents.reduce((sum, event) => sum + event.tokens, 0);
  if (tokenUsed + estimatedTokens > TOKEN_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: 60,
      reason: "Daily co-pilot token budget exceeded. Please retry later.",
    };
  }

  bucket.timestamps.push(now);
  bucket.tokenEvents.push({ at: now, tokens: estimatedTokens });
  buckets.set(key, bucket);

  return { allowed: true };
}
