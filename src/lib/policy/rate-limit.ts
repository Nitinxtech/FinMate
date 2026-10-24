// In-memory sliding window. Per server instance only; use a shared store (e.g. Redis) when running multiple instances.
type Action = "upload" | "process" | "ask" | "analyze";

const LIMITS: Record<Action, { max: number; windowMs: number; label: string }> = {
  upload: { max: 10, windowMs: 60 * 60 * 1000, label: "uploads" },
  process: { max: 200, windowMs: 60 * 60 * 1000, label: "processing steps" },
  ask: { max: 30, windowMs: 10 * 60 * 1000, label: "questions" },
  analyze: { max: 60, windowMs: 10 * 60 * 1000, label: "comparisons and scenarios" },
};

const buckets = new Map<string, number[]>();

export function checkPolicyRateLimit(userId: string, action: Action, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const limit = LIMITS[action];
  const key = `${action}:${userId}`;
  const recent = (buckets.get(key) ?? []).filter((at) => now - at < limit.windowMs);

  if (recent.length >= limit.max) {
    buckets.set(key, recent);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((limit.windowMs - (now - recent[0])) / 1000)) };
  }

  recent.push(now);
  buckets.set(key, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function rateLimitMessage(action: Action): string {
  return `Too many ${LIMITS[action].label} in a short time. Please wait a moment and try again.`;
}

export function resetPolicyRateLimits(): void {
  buckets.clear();
}
