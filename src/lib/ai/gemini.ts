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
};

export async function generateTextWithGemini(
  prompt: string,
  options: GeminiGenerateOptions = {},
): Promise<GeminiTextResponse> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing. Add it to .env.local before using AI features.");
  }

  const model = options.model ?? env.GEMINI_MODEL;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: options.maxOutputTokens ?? env.GEMINI_MAX_OUTPUT_TOKENS,
          temperature: options.temperature ?? 0.2,
          responseMimeType: options.responseMimeType ?? "text/plain",
        },
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!text) {
    throw new Error("Gemini response did not include text content.");
  }

  return { text };
}
