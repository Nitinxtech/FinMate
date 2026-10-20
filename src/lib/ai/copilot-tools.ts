import {
  analyzeInvestmentAllocation,
  calculateEmergencyFundCoverage,
  calculateMonthlyCashFlow,
  calculateRequiredMonthlyContribution,
  computeBasicFinancialRatios,
  projectCompoundInterest,
} from "@/lib/finance/engine";
import type { CopilotIntent } from "@/lib/ai/copilot-plan";
import type { CopilotProfileContext } from "@/lib/ai/copilot-profile";
import { buildPurchasePlan, detectPurchaseItem, looksLikePurchase } from "@/lib/ai/copilot-purchase-plan";
import type { CopilotCalculation, CopilotPurchasePlan } from "@/lib/ai/copilot-schemas";

type ExpenseItem = { category?: string; amount?: number };
type DebtItem = { lender?: string; monthlyPayment?: number };
type InsuranceItem = { provider?: string; premium?: number };
type InvestmentItem = { instrument?: string; monthlyContribution?: number };
type GoalItem = { name?: string; targetAmount?: number; horizonMonths?: number };

export type CopilotToolResult = {
  facts: string[];
  estimates: string[];
  assumptions: string[];
  hypotheticalScenarios: string[];
  calculations: CopilotCalculation[];
  clarifyingQuestions: string[];
  sources: string[];
  risks: string[];
  purchaseClarifiers: string[];
  purchasePlan: CopilotPurchasePlan | null;
  snapshot: CopilotSnapshot;
};

export type CopilotSnapshot = {
  currencyCode: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyDebt: number;
  monthlyInsurance: number;
  monthlyInvestments: number;
  monthlySurplus: number;
  emergencyMonths: number | null;
  emergencyTarget: number | null;
  emergencyShortfall: number | null;
};

function lastMatch(text: string, pattern: RegExp): RegExpMatchArray | null {
  const matches = Array.from(text.matchAll(new RegExp(pattern.source, "g")));
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

const AMOUNT = String.raw`(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|k)?\b`;
const DOWN_PAYMENT_WORDS = String.raw`down\s?payment`;

function toAmount(raw: string | undefined, unit: string | undefined): number | null {
  if (!raw) {
    return null;
  }

  const base = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(base) || base <= 0) {
    return null;
  }

  const scale = /^lakh|^lac/.test(unit ?? "") ? 100_000 : /^crore/.test(unit ?? "") ? 10_000_000 : unit === "k" ? 1_000 : 1;
  return base * scale;
}

function latestMatchWithIndex(text: string, source: string): { match: RegExpMatchArray; index: number } | null {
  const matches = Array.from(text.matchAll(new RegExp(source, "gi")));
  const last = matches[matches.length - 1];
  return last ? { match: last, index: last.index ?? 0 } : null;
}

function stripDownPayment(text: string): string {
  return text
    .replace(new RegExp(`${DOWN_PAYMENT_WORDS}(?:\\s*(?:of|is|=|around|about|:|can be))*\\s*${AMOUNT}`, "gi"), " ")
    .replace(new RegExp(`${AMOUNT}\\s*(?:as\\s*)?(?:a\\s*)?${DOWN_PAYMENT_WORDS}`, "gi"), " ");
}

function parseTargetAmountFromQuestion(question: string): number | null {
  const lowered = stripDownPayment(question.toLowerCase());
  if (!/buy|purchase|cost|budget|target|save for|afford|price/.test(lowered)) {
    return null;
  }

  const found = latestMatchWithIndex(lowered, String.raw`(?:₹|rs\.?|inr)\s*(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|k)?\b|(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|crores?)\b`);
  if (!found) {
    return null;
  }

  const { match } = found;
  return match[1] ? toAmount(match[1], match[2]) : toAmount(match[3], match[4]);
}

function parseDownPaymentFromQuestion(question: string): number | null {
  const lowered = question.toLowerCase();
  const forward = latestMatchWithIndex(
    lowered,
    `${DOWN_PAYMENT_WORDS}(?:\\s*(?:of|is|=|around|about|:|can be))*\\s*${AMOUNT}`,
  );
  const reverse = latestMatchWithIndex(lowered, `${AMOUNT}\\s*(?:as\\s*)?(?:a\\s*)?${DOWN_PAYMENT_WORDS}`);

  const latest = [forward, reverse]
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.index - a.index)[0];

  return latest ? toAmount(latest.match[1], latest.match[2]) : null;
}

function parseInterestRateFromQuestion(question: string): number | null {
  const lowered = question.toLowerCase();
  const forward = latestMatchWithIndex(lowered, String.raw`(?:interest\s*rate|rate|apr)\D{0,12}(\d+(?:\.\d+)?)\s*%?`);
  const reverse = latestMatchWithIndex(lowered, String.raw`(\d+(?:\.\d+)?)\s*%\s*(?:interest|rate|p\.?a\.?|per\s*(?:annum|year))`);

  const latest = [forward, reverse]
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.index - a.index)[0];

  const parsed = latest ? Number(latest.match[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 && parsed < 100 ? parsed : null;
}
function parseHorizonMonthsFromQuestion(question: string): number | null {
  const lowered = question.toLowerCase();
  const monthMatch = lastMatch(lowered, /(\d+)\s*months?/);
  if (monthMatch) {
    const months = Number(monthMatch[1]);
    return Number.isFinite(months) && months > 0 ? months : null;
  }

  const yearMatch = lastMatch(lowered, /(\d+)\s*(?:years?|yrs?)/);
  if (yearMatch) {
    const years = Number(yearMatch[1]);
    if (!Number.isFinite(years) || years <= 0) {
      return null;
    }

    return years * 12;
  }

  return null;
}

function collectPurchaseClarifyingQuestions(args: {
  hasPrice: boolean;
  priceAssumed: boolean;
  hasDownPayment: boolean;
  hasTenure: boolean;
  hasRate: boolean;
}): string[] {
  const clarifiers: string[] = [];
  if (!args.hasPrice) {
    clarifiers.push("What price are you looking at (on-road, if it is a vehicle)?");
  } else if (args.priceAssumed) {
    clarifiers.push("Do you know the actual on-road price of the exact variant you want?");
  }
  if (!args.hasDownPayment) {
    clarifiers.push("How much can you pay upfront as a down payment?");
  }
  if (!args.hasTenure) {
    clarifiers.push("How many months do you want to pay EMIs for?");
  }
  if (!args.hasRate) {
    clarifiers.push("Has any bank quoted you an interest rate yet?");
  }

  return clarifiers;
}
function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function fmtMoney(value: number, currencyCode: string): string {
  const currency = currencyCode.length === 3 ? currencyCode : "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseArrays(profile: CopilotProfileContext) {
  return {
    expenses: (profile.monthly_expenses ?? []) as ExpenseItem[],
    debts: (profile.debts ?? []) as DebtItem[],
    insurances: (profile.insurances ?? []) as InsuranceItem[],
    investments: (profile.investments ?? []) as InvestmentItem[],
    goals: (profile.goals ?? []) as GoalItem[],
  };
}

function getMonthlyIncome(profile: CopilotProfileContext): number {
  return num(profile.monthly_take_home_salary) || num(profile.monthly_gross_salary);
}

export function runCopilotDeterministicTools(
  intents: CopilotIntent[],
  profile: CopilotProfileContext,
  asksForScenario: boolean,
  userQuestion = "",
): CopilotToolResult {
  const currencyCode = profile.currency_code ?? "USD";
  const monthlyIncome = getMonthlyIncome(profile);
  const arrays = parseArrays(profile);

  const monthlyExpenses = arrays.expenses.reduce((sum, item) => sum + num(item.amount), 0);
  const monthlyDebt = arrays.debts.reduce((sum, item) => sum + num(item.monthlyPayment), 0);
  const monthlyInsurance = arrays.insurances.reduce((sum, item) => sum + num(item.premium), 0);
  const monthlyInvestments = arrays.investments.reduce((sum, item) => sum + num(item.monthlyContribution), 0);
  const monthlySurplus = monthlyIncome - (monthlyExpenses + monthlyDebt + monthlyInsurance + monthlyInvestments);
  const questionTargetAmount = parseTargetAmountFromQuestion(userQuestion);
  const questionHorizonMonths = parseHorizonMonthsFromQuestion(userQuestion);
  const questionDownPayment = parseDownPaymentFromQuestion(userQuestion);
  const questionInterestRate = parseInterestRateFromQuestion(userQuestion);
  const purchasePlanning = looksLikePurchase(userQuestion);

  const facts: string[] = [];
  const estimates: string[] = [];
  const assumptions: string[] = [];
  const hypotheticalScenarios: string[] = [];
  const calculations: CopilotCalculation[] = [];
  const clarifyingQuestions: string[] = [];
  const sources = new Set<string>(["financial_profiles.currency_code"]);
  const risks: string[] = [];
  let emergencySnapshot: { months: number; target: number; shortfall: number } | null = null;

  if (monthlyIncome <= 0) {
    clarifyingQuestions.push(
      "What is your current monthly take-home salary (or gross salary) so I can compute reliable ratios and cash flow?",
    );
  }

  if (intents.includes("cash_flow") || intents.includes("general")) {
    sources.add("financial_profiles.monthly_take_home_salary");
    sources.add("financial_profiles.monthly_gross_salary");
    sources.add("financial_profiles.monthly_expenses");
    sources.add("financial_profiles.debts");
    sources.add("financial_profiles.insurances");
    sources.add("financial_profiles.investments");

    const cashflow = calculateMonthlyCashFlow({
      monthlyIncome,
      monthlyEssentialExpenses: monthlyExpenses,
      monthlyDebtPayments: monthlyDebt,
      monthlyInsurancePremiums: monthlyInsurance,
      monthlyInvestments,
    });

    if (cashflow.ok) {
      calculations.push({
        name: "Monthly cash flow",
        formula: "income - (expenses + debt + insurance + investments)",
        result: `${fmtMoney(cashflow.value.monthlySurplus, currencyCode)} surplus (${cashflow.value.savingsRate.toFixed(2)}% savings rate)`,
        confidence: "deterministic",
      });
      facts.push(
        `Your current monthly outflow in this model is ${fmtMoney(cashflow.value.monthlyOutflows, currencyCode)}.`,
      );
      if (cashflow.value.monthlySurplus < 0) {
        risks.push("Current entered data indicates a monthly deficit.");
      }
    } else {
      clarifyingQuestions.push("I could not compute cash flow. Please confirm your monthly values are non-negative numbers.");
    }
  }

  if (intents.includes("emergency") || intents.includes("general")) {
    sources.add("financial_profiles.monthly_savings_target");
    sources.add("financial_profiles.monthly_expenses");
    sources.add("financial_profiles.debts");

    const emergencyFundBalanceProxy = num(profile.monthly_savings_target) * 6;
    if (num(profile.monthly_savings_target) <= 0) {
      clarifyingQuestions.push(
        "Please share your monthly savings target so I can estimate emergency fund coverage more accurately.",
      );
    }

    const emergency = calculateEmergencyFundCoverage({
      emergencyFundBalance: emergencyFundBalanceProxy,
      monthlyEssentialExpenses: monthlyExpenses + monthlyDebt,
      targetCoverageMonths: 6,
    });

    if (emergency.ok) {
      emergencySnapshot = {
        months: emergency.value.coverageMonths,
        target: emergency.value.targetFundAmount,
        shortfall: emergency.value.shortfall,
      };
      calculations.push({
        name: "Emergency fund coverage",
        formula: "estimated emergency balance / monthly essential outflow",
        result: `${emergency.value.coverageMonths.toFixed(2)} months (shortfall ${fmtMoney(emergency.value.shortfall, currencyCode)})`,
        confidence: "estimated",
      });
      estimates.push(
        "Emergency balance is estimated as monthly savings target multiplied by 6 because no dedicated emergency-fund field exists yet.",
      );
      if (emergency.value.coverageMonths < 3) {
        risks.push("Emergency coverage appears low versus a 3-6 month cushion benchmark.");
      }
    }
  }

  if (intents.includes("debt") || intents.includes("ratios") || intents.includes("general")) {
    sources.add("financial_profiles.debts");
    if (arrays.debts.length === 0) {
      clarifyingQuestions.push("Do you currently have any loan EMIs or debt payments to include?");
    }

    const ratios = computeBasicFinancialRatios({
      monthlyIncome,
      monthlyEssentialExpenses: monthlyExpenses,
      monthlyDebtPayments: monthlyDebt,
      monthlyInvestments,
      emergencyFundBalance: num(profile.monthly_savings_target) * 6,
    });

    if (ratios.ok) {
      const dti = ratios.value.find((ratio) => ratio.key === "debtToIncome");
      const savingsRate = ratios.value.find((ratio) => ratio.key === "savingsRate");

      if (dti) {
        calculations.push({
          name: "Debt-to-income ratio",
          formula: "monthly debt payments / monthly income",
          result: `${dti.value.toFixed(2)}%`,
          confidence: "deterministic",
        });
      }

      if (savingsRate) {
        calculations.push({
          name: "Savings ratio",
          formula: "(income - essential expenses - debt) / income",
          result: `${savingsRate.value.toFixed(2)}%`,
          confidence: "deterministic",
        });
      }
    }
  }

  if (intents.includes("investment") || intents.includes("general")) {
    sources.add("financial_profiles.investments");
    if (arrays.investments.length === 0) {
      clarifyingQuestions.push("Please add at least one investment contribution to analyze allocation and projections.");
    } else {
      const allocation = analyzeInvestmentAllocation({
        holdings: arrays.investments.map((investment) => ({
          name: investment.instrument?.trim() || "Unnamed investment",
          value: num(investment.monthlyContribution),
        })),
      });

      if (allocation.ok) {
        calculations.push({
          name: "Investment concentration",
          formula: "Herfindahl-Hirschman index from contribution weights",
          result: `HHI ${allocation.value.concentrationHhi.toFixed(3)}, largest holding ${allocation.value.maxSingleAssetWeightPct.toFixed(2)}%`,
          confidence: "deterministic",
        });
      }
    }
  }

  if (intents.includes("goal") || intents.includes("general")) {
    sources.add("financial_profiles.goals");
    sources.add("financial_profiles.investments");

    if (arrays.goals.length === 0) {
      if (questionTargetAmount && monthlyIncome > 0) {
        const horizonMonths = questionHorizonMonths ?? 12;
        const required = calculateRequiredMonthlyContribution({
          goalTarget: questionTargetAmount,
          currentAmount: 0,
          annualReturnPct: 8,
          monthsToGoal: Math.max(1, Math.round(horizonMonths)),
        });

        if (required.ok) {
          calculations.push({
            name: "Required contribution for planned purchase",
            formula: "future value of monthly contributions to reach target",
            result: `${fmtMoney(required.value.requiredMonthlyContribution, currencyCode)} per month for ${horizonMonths} months toward ${fmtMoney(questionTargetAmount, currencyCode)}`,
            confidence: "estimated",
          });

          estimates.push(required.value.assumptions);
          assumptions.push(
            questionHorizonMonths
              ? "Purchase timeline from question text was used for required-contribution planning."
              : "No timeline was provided, so a 12-month planning horizon was assumed for the purchase roadmap.",
          );

          if (monthlySurplus > 0) {
            const runwayMonths = questionTargetAmount / monthlySurplus;
            calculations.push({
              name: "Surplus-based cash accumulation",
              formula: "target amount / current monthly surplus",
              result: `${runwayMonths.toFixed(1)} months at current surplus pace`,
              confidence: "deterministic",
            });

            facts.push(
              `At your current surplus pace (${fmtMoney(monthlySurplus, currencyCode)}/month), the target can be accumulated in about ${runwayMonths.toFixed(1)} months.`,
            );
          } else {
            risks.push("Current cash flow does not show a positive monthly surplus for purchase planning.");
          }
        }
      } else {
        clarifyingQuestions.push("What financial goal should I analyze first (for example, emergency fund, home purchase, or retirement)?");
      }
    } else {
      const firstGoal = arrays.goals[0];
      const goalTarget = num(firstGoal?.targetAmount);
      const horizonMonths = num(firstGoal?.horizonMonths) > 0 ? num(firstGoal.horizonMonths) : 60;
      const contribution = arrays.investments.length > 0 ? monthlyInvestments / arrays.goals.length : 0;

      const projection = projectCompoundInterest({
        initialPrincipal: 0,
        monthlyContribution: contribution,
        annualReturnPct: 8,
        years: Math.max(1, Math.round(horizonMonths / 12)),
      });

      if (projection.ok) {
        calculations.push({
          name: `Goal projection: ${firstGoal?.name || "Primary goal"}`,
          formula: "monthly contribution compounded monthly at 8% annual return",
          result: `Projected nominal value ${fmtMoney(projection.value.endingNominalValue, currencyCode)} in ${horizonMonths} months`,
          confidence: "estimated",
        });
        assumptions.push(
          "Goal projection uses a fixed 8% annual return assumption with monthly compounding and excludes taxes and fees.",
        );
      }

      if (goalTarget > 0) {
        const required = calculateRequiredMonthlyContribution({
          goalTarget,
          currentAmount: 0,
          annualReturnPct: 8,
          monthsToGoal: Math.max(1, Math.round(horizonMonths)),
        });

        if (required.ok) {
          calculations.push({
            name: `Required contribution: ${firstGoal?.name || "Primary goal"}`,
            formula: "future value of monthly contributions to reach target",
            result: `${fmtMoney(required.value.requiredMonthlyContribution, currencyCode)} per month`,
            confidence: "estimated",
          });
          estimates.push(required.value.assumptions);
        }
      }
    }
  }

  let purchasePlan: CopilotPurchasePlan | null = null;
  let purchaseClarifiers: string[] = [];
  if (purchasePlanning) {
    const catalogPrice = detectPurchaseItem(userQuestion)?.price ?? null;
    purchaseClarifiers = collectPurchaseClarifyingQuestions({
      hasPrice: questionTargetAmount !== null || catalogPrice !== null,
      priceAssumed: questionTargetAmount === null && catalogPrice !== null,
      hasDownPayment: questionDownPayment !== null,
      hasTenure: questionHorizonMonths !== null,
      hasRate: questionInterestRate !== null,
    });

    purchasePlan = buildPurchasePlan({
      text: userQuestion,
      targetAmount: questionTargetAmount,
      monthlyIncome,
      monthlySurplus,
      monthlyDebt,
      essentialsMonthly: monthlyExpenses + monthlyDebt,
      emergencyBalance: num(profile.monthly_savings_target) * 6,
      currencyCode,
      downPayment: questionDownPayment,
      tenureMonths: questionHorizonMonths,
      interestRatePct: questionInterestRate,
    });
  }

  if (asksForScenario) {
    hypotheticalScenarios.push(
      "Your question appears hypothetical. Results should be interpreted as scenario analysis, not guaranteed outcomes.",
    );
  }

  assumptions.push("Tax calculations, market prices, and policy clauses are not inferred unless explicitly provided in trusted numeric inputs.");

  return {
    facts,
    estimates,
    assumptions,
    hypotheticalScenarios,
    calculations,
    clarifyingQuestions: Array.from(new Set(clarifyingQuestions)),
    sources: Array.from(sources),
    risks,
    purchaseClarifiers,
    purchasePlan,
    snapshot: {
      currencyCode,
      monthlyIncome,
      monthlyExpenses,
      monthlyDebt,
      monthlyInsurance,
      monthlyInvestments,
      monthlySurplus,
      emergencyMonths: emergencySnapshot?.months ?? null,
      emergencyTarget: emergencySnapshot?.target ?? null,
      emergencyShortfall: emergencySnapshot?.shortfall ?? null,
    },
  };
}

