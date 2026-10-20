import type { CopilotIntent } from "@/lib/ai/copilot-plan";
import type { CopilotToolResult } from "@/lib/ai/copilot-tools";

export type Narrative = {
  answer: string;
  risks: string[];
  nextSteps: string[];
  uncertainty: string;
};

const SLOW_NOTE = "I answered from your saved numbers because my AI helper was slow to respond just now.";
const UNCERTAINTY =
  "This response excludes taxes, live market prices, and legal/policy interpretation unless explicitly provided.";

function money(value: number, currencyCode: string): string {
  const currency = currencyCode.length === 3 ? currencyCode : "USD";
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function planAnswer(toolResult: CopilotToolResult): string[] {
  const plan = toolResult.purchasePlan;
  if (!plan) {
    return [];
  }

  const readiness = plan.readiness;
  const m = (value: number) => money(value, plan.currencyCode);
  const lines = [plan.takeaway];

  if (!readiness.readyNow) {
    const gaps = readiness.checks
      .filter((check) => check.status !== "ok")
      .map((check) => `- ${check.label}: you have ${check.haveText}, aim for ${check.needText}`);
    if (gaps.length > 0) {
      lines.push(`What to hit:\n${gaps.join("\n")}`);
    }
    if (readiness.incomeNeeded > readiness.incomeNow) {
      lines.push(
        `To carry a standard loan comfortably you would want about ${m(readiness.incomeNeeded)} a month in take-home pay (today: ${m(readiness.incomeNow)}).`,
      );
    }
  }

  return lines;
}

function chatAnswer(toolResult: CopilotToolResult, intents: CopilotIntent[]): string[] {
  const s = toolResult.snapshot;
  const m = (value: number) => money(value, s.currencyCode);
  const outflow = s.monthlyExpenses + s.monthlyDebt + s.monthlyInsurance + s.monthlyInvestments;

  if (intents.includes("emergency") && s.emergencyMonths !== null && s.emergencyTarget !== null) {
    const short = s.emergencyShortfall ?? 0;
    return short > 0
      ? [
          `Not quite yet. Your emergency money covers about ${s.emergencyMonths.toFixed(1)} months of essential bills. A safer target is 6 months, which is about ${m(s.emergencyTarget)}.`,
          `You are short by roughly ${m(short)}. Putting aside a fixed amount on salary day until you close that gap is the simplest way.`,
        ]
      : [`Yes. Your emergency money covers about ${s.emergencyMonths.toFixed(1)} months of essential bills, which meets the 6-month target.`];
  }

  if (intents.includes("debt") && s.monthlyIncome > 0) {
    const share = Math.round((s.monthlyDebt / s.monthlyIncome) * 100);
    return [
      `Your EMIs take about ${share}% of your monthly income (${m(s.monthlyDebt)} out of ${m(s.monthlyIncome)}).`,
      share <= 30
        ? "That is a healthy level. Keeping all EMIs under about 40% of income leaves you room for emergencies."
        : "That is on the heavy side. Try to keep all EMIs under about 40% of income, and avoid new loans until it comes down.",
    ];
  }

  return [
    `Each month ${m(s.monthlyIncome)} comes in. About ${m(outflow)} goes to expenses, EMIs, insurance and investments, which leaves roughly ${m(s.monthlySurplus)}.`,
    s.monthlySurplus > 0
      ? "Move a fixed part of that into savings on salary day, before you start spending, and the leftover money stops disappearing."
      : "You are spending more than you earn right now, so trim the biggest expenses first.",
  ];
}

export function buildFriendlyFallback(toolResult: CopilotToolResult, intents: CopilotIntent[]): Narrative {
  const lines = toolResult.purchasePlan ? planAnswer(toolResult) : chatAnswer(toolResult, intents);

  return {
    answer: [...lines, SLOW_NOTE].join("\n\n"),
    risks: toolResult.risks,
    nextSteps: [],
    uncertainty: UNCERTAINTY,
  };
}
