import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url().optional().default("http://localhost:3000"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().optional().default("gemini-flash-latest"),
  GEMINI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(128).max(4096).optional().default(900),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  const fields = Object.keys(parsed.error.flatten().fieldErrors).join(", ");
  throw new Error(`Invalid server environment variables: ${fields}`);
}

export const env = parsed.data;
