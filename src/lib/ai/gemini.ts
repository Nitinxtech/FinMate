import "server-only";

import { env } from "@/lib/validation/env.server";

type GeminiTextResponse = {
  text: string;
};

type GeminiGenerateOptions = {
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  responseMimeType?: "text/plain" | "application/json";
  timeoutMs?: number;
  inlineData?: Array<{ mimeType: string; dataBase64: string }>;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAY_MS = 800;

export async function generateTextWithGemini(
  prompt: string,
  options: GeminiGenerateOptions = {},
): Promise<GeminiTextResponse> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing. Add it to .env.local before using AI features.");
  }

  const model = options.model ?? env.GEMINI_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();

  const send = (attemptTimeoutMs: number) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              ...(options.inlineData ?? []).map((item) => ({
                inline_data: { mime_type: item.mimeType, data: item.dataBase64 },
              })),
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: options.maxOutputTokens ?? env.GEMINI_MAX_OUTPUT_TOKENS,
          temperature: options.temperature ?? 0.2,
          responseMimeType: options.responseMimeType ?? "text/plain",
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(attemptTimeoutMs),
    });

  let response = await send(timeoutMs);

  // Overload errors return fast, so one retry is cheap; slow timeouts are not retried.
  const remainingMs = timeoutMs - (Date.now() - startedAt);
  if (!response.ok && RETRYABLE_STATUSES.has(response.status) && remainingMs > 4_000) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    response = await send(remainingMs - RETRY_DELAY_MS);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          thought?: boolean;
        }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts
    ?.filter((part) => !part.thought && part.text)
    .map((part) => part.text)
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini response did not include text content.");
  }

  return { text };
}
