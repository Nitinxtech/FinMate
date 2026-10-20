import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test-key";
process.env.GEMINI_API_KEY ??= "gemini-test-key";
