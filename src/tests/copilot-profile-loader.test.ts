import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { loadCopilotProfileContext } from "@/lib/ai/copilot-profile";

describe("loadCopilotProfileContext", () => {
  it("enforces user_id filter for cross-user data isolation", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        currency_code: "USD",
        monthly_take_home_salary: 5000,
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const supabase = { from } as never;
    const user = { id: "auth-user-123" } as User;

    const result = await loadCopilotProfileContext(supabase, user, [
      "currency_code",
      "monthly_take_home_salary",
    ]);

    expect(from).toHaveBeenCalledWith("financial_profiles");
    expect(select).toHaveBeenCalledWith("currency_code,monthly_take_home_salary");
    expect(eq).toHaveBeenCalledWith("user_id", "auth-user-123");
    expect(result?.currency_code).toBe("USD");
  });

  it("normalizes JSON arrays safely", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        currency_code: "USD",
        monthly_expenses: null,
        debts: [{ lender: "A", monthlyPayment: 120 }],
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const supabase = { from } as never;
    const user = { id: "auth-user-123" } as User;

    const result = await loadCopilotProfileContext(supabase, user, [
      "currency_code",
      "monthly_expenses",
      "debts",
    ]);

    expect(Array.isArray(result?.monthly_expenses)).toBe(true);
    expect(Array.isArray(result?.debts)).toBe(true);
    expect(result?.debts?.length).toBe(1);
  });
});
