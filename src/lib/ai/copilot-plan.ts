export type CopilotIntent =
  | "general"
  | "cash_flow"
  | "debt"
  | "investment"
  | "goal"
  | "emergency"
  | "ratios";

export type ProfileField =
  | "country_code"
  | "currency_code"
  | "employment_type"
  | "ctc_annual"
  | "monthly_gross_salary"
  | "monthly_take_home_salary"
  | "monthly_expenses"
  | "monthly_savings_target"
  | "debts"
  | "insurances"
  | "investments"
  | "goals"
  | "onboarding_completed";

export type CopilotPlan = {
  intents: CopilotIntent[];
  requiredFields: ProfileField[];
  asksForScenario: boolean;
};

const intentFields: Record<CopilotIntent, ProfileField[]> = {
  general: [
    "currency_code",
    "monthly_take_home_salary",
    "monthly_gross_salary",
    "monthly_expenses",
    "monthly_savings_target",
    "debts",
    "investments",
    "goals",
    "onboarding_completed",
  ],
  cash_flow: [
    "currency_code",
    "monthly_take_home_salary",
    "monthly_gross_salary",
    "monthly_expenses",
    "debts",
    "insurances",
    "investments",
  ],
  debt: ["currency_code", "monthly_take_home_salary", "monthly_gross_salary", "debts"],
  investment: ["currency_code", "monthly_take_home_salary", "monthly_gross_salary", "investments"],
  goal: ["currency_code", "goals", "investments", "monthly_take_home_salary", "monthly_gross_salary"],
  emergency: ["currency_code", "monthly_savings_target", "monthly_expenses", "debts"],
  ratios: [
    "currency_code",
    "monthly_take_home_salary",
    "monthly_gross_salary",
    "monthly_expenses",
    "debts",
    "investments",
    "monthly_savings_target",
  ],
};

function pushIntent(intents: Set<CopilotIntent>, condition: boolean, intent: CopilotIntent) {
  if (condition) {
    intents.add(intent);
  }
}

export function buildCopilotPlan(question: string, hypotheticalFlag: boolean): CopilotPlan {
  const lowered = question.toLowerCase();
  const intents = new Set<CopilotIntent>();

  pushIntent(
    intents,
    /cash flow|surplus|expenses?|spend|burn|budget|monthly flow|afford|affordable|possible|feasible|can i buy|purchase/.test(
      lowered,
    ),
    "cash_flow",
  );
  pushIntent(intents, /debt|emi|loan|credit/.test(lowered), "debt");
  pushIntent(intents, /invest|portfolio|allocation|mutual fund|stock|etf/.test(lowered), "investment");
  pushIntent(
    intents,
    /goal|retire|retirement|house|car|bike|education|target|buy|purchase|save for/.test(lowered),
    "goal",
  );
  pushIntent(intents, /emergency|runway|buffer/.test(lowered), "emergency");
  pushIntent(intents, /ratio|dti|savings rate|expense to income/.test(lowered), "ratios");

  if (intents.size === 0) {
    intents.add("general");
  }

  const asksForScenario =
    hypotheticalFlag || /what if|suppose|assume|scenario|if i|if we/.test(lowered);

  const requiredFields = new Set<ProfileField>(["currency_code"]);
  for (const intent of intents) {
    for (const field of intentFields[intent]) {
      requiredFields.add(field);
    }
  }

  return {
    intents: Array.from(intents),
    requiredFields: Array.from(requiredFields),
    asksForScenario,
  };
}
