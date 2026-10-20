"use client";

import {
  AlertTriangle,
  BarChart3,
  Bot,
  Brain,
  BriefcaseBusiness,
  CircleDollarSign,
  ClipboardList,
  Goal,
  House,
  Landmark,
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  Minimize2,
  Maximize2,
  SendHorizontal,
  Sparkle,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DashboardFinanceModel } from "@/lib/finance/dashboard";

type FinanceDashboardProps = {
  data: DashboardFinanceModel;
  currencyCode: string;
  displayName: string;
  onboardingComplete: boolean;
};

type NavItem = {
  id: "home" | "income-tax" | "investments" | "insurance" | "loans" | "goals" | "reports";
  label: string;
  icon: ReactNode;
  badge?: string;
};

const leftNavItems: NavItem[] = [
  { id: "home", label: "Home", icon: <House className="size-4" /> },
  { id: "income-tax", label: "Income & Tax", icon: <CircleDollarSign className="size-4" /> },
  { id: "investments", label: "Investments", icon: <TrendingUp className="size-4" /> },
  { id: "insurance", label: "Insurance", icon: <ShieldCheck className="size-4" /> },
  { id: "loans", label: "Loans & EMIs", icon: <Landmark className="size-4" /> },
  { id: "goals", label: "Goals", icon: <Goal className="size-4" /> },
  { id: "reports", label: "Reports", icon: <ClipboardList className="size-4" /> },
];

type CopilotResponse = {
  status: "ok" | "needs_clarification" | "error";
  answer: string;
  facts: string[];
  estimates: string[];
  assumptions: string[];
  hypotheticalScenarios: string[];
  risks: string[];
  nextSteps: string[];
  clarifyingQuestions: string[];
  uncertainty: string;
  calculations: Array<{ name: string; result: string; confidence: "deterministic" | "estimated" }>;
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  response?: CopilotResponse;
  animate?: boolean;
};

type VisualMetric = {
  label: string;
  value: number;
};

type MoneyMetric = {
  label: string;
  value: number;
};

type ScenarioCard = {
  title: string;
  detail: string;
  confidence: "deterministic" | "estimated";
};

type BeginnerSummary = {
  headline: string;
  bullets: string[];
};

function formatCurrency(value: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function extractVisualMetrics(calculations: CopilotResponse["calculations"]): VisualMetric[] {
  const metrics: VisualMetric[] = [];

  for (const item of calculations) {
    const pctMatch = item.result.match(/(-?\d+(?:\.\d+)?)\s*%/);
    if (!pctMatch) {
      continue;
    }

    const parsed = Number(pctMatch[1]);
    if (!Number.isFinite(parsed)) {
      continue;
    }

    metrics.push({
      label: item.name,
      value: clamp(parsed, 0, 100),
    });
  }

  return metrics.slice(0, 3);
}

function parseCurrencyValue(text: string): number | null {
  const match = text.match(/(?:₹|\$|€|£)\s*([\d,]+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractMoneyMetrics(calculations: CopilotResponse["calculations"]): MoneyMetric[] {
  const metrics: MoneyMetric[] = [];

  for (const item of calculations) {
    const value = parseCurrencyValue(item.result);
    if (value === null || value <= 0) {
      continue;
    }

    metrics.push({ label: item.name, value });
  }

  return metrics.slice(0, 3);
}

function dedupeLines(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(value.trim());
  }

  return output;
}

function friendlyLabel(label: string): string {
  const lowered = label.toLowerCase();
  if (lowered.includes("debt-to-income")) {
    return "Loan burden";
  }
  if (lowered.includes("savings ratio")) {
    return "Monthly savings strength";
  }
  if (lowered.includes("emergency fund coverage")) {
    return "Emergency safety buffer";
  }
  if (lowered.includes("monthly cash flow")) {
    return "Money left each month";
  }

  return label;
}

function deriveBeginnerSummary(response: CopilotResponse): BeginnerSummary {
  const calcText = response.calculations.map((item) => `${item.name} ${item.result}`).join(" ").toLowerCase();
  const bullets: string[] = [];

  const surplusMatch = calcText.match(/₹\s*([\d,]+(?:\.\d+)?)\s*surplus/);
  if (surplusMatch) {
    bullets.push(`You currently have about ₹${surplusMatch[1]} left each month after your regular expenses.`);
  }

  const dtiCalc = response.calculations.find((item) => item.name.toLowerCase().includes("debt-to-income"));
  const dtiPct = dtiCalc?.result.match(/(\d+(?:\.\d+)?)%/)?.[1];
  if (dtiPct) {
    bullets.push(`Your current loan burden is ${dtiPct}% of your monthly income.`);
  }

  const emergencyCalc = response.calculations.find((item) => item.name.toLowerCase().includes("emergency fund coverage"));
  const emergencyMonths = emergencyCalc?.result.match(/(\d+(?:\.\d+)?)\s*months?/)?.[1];
  if (emergencyMonths) {
    bullets.push(`Your emergency savings can cover around ${emergencyMonths} months of essential costs.`);
  }

  if (bullets.length === 0) {
    bullets.push("This plan is based on your income, expenses, debt, and savings details from onboarding.");
  }

  let headline = "You are in a stable position, but there is room to optimize.";
  if (response.status === "needs_clarification") {
    headline = "This is a good first estimate; a couple of answers from you will make it more accurate.";
  }
  if (response.risks.some((risk) => /deficit|low|constrained/i.test(risk))) {
    headline = "There are early warning signs, so take the next steps before making a big purchase.";
  }

  return { headline, bullets: bullets.slice(0, 3) };
}

function extractScenarioCards(calculations: CopilotResponse["calculations"]): ScenarioCard[] {
  return calculations
    .filter((item) => item.name.toLowerCase().startsWith("scenario:"))
    .map((item) => ({
      title: item.name.replace(/^scenario:\s*/i, ""),
      detail: item.result,
      confidence: item.confidence,
    }))
    .slice(0, 3);
}

function scoreFromModel(data: DashboardFinanceModel): number {
  const savings = clamp(data.savingsRate, 0, 30) * 1.5;
  const emergency = clamp((data.emergencyCoverageMonths / 6) * 20, 0, 20);
  const debtPenalty = clamp(data.monthlyIncome > 0 ? (data.monthlyDebtPayments / data.monthlyIncome) * 100 : 0, 0, 28);
  const concentrationPenalty = clamp((data.concentrationMaxWeightPct - 30) / 2, 0, 14);

  return Math.round(clamp(35 + savings + emergency - debtPenalty - concentrationPenalty, 0, 100));
}

export function FinanceDashboard({
  data,
  currencyCode,
  displayName,
  onboardingComplete,
}: FinanceDashboardProps) {
  const [activeNav, setActiveNav] = useState<NavItem["id"]>("home");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "I am your finance copilot. Ask me about savings, debt, goals, and monthly planning.",
      animate: false,
    },
  ]);
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const score = scoreFromModel(data);
  const expenseShare = data.monthlyIncome > 0 ? (data.monthlyExpenses / data.monthlyIncome) * 100 : 0;
  const debtShare = data.monthlyIncome > 0 ? (data.monthlyDebtPayments / data.monthlyIncome) * 100 : 0;
  const investShare = data.monthlyIncome > 0 ? (data.monthlyInvestments / data.monthlyIncome) * 100 : 0;
  const savingsShare = data.monthlyIncome > 0 ? (Math.max(0, data.monthlySurplus) / data.monthlyIncome) * 100 : 0;

  const allocationTop = data.investmentAllocation.slice(0, 5);
  const rings = [
    { value: clamp(investShare + 20, 0, 100), color: "#0ea5e9" },
    { value: clamp(savingsShare + 10, 0, 100), color: "#10b981" },
    { value: clamp(100 - debtShare, 0, 100), color: "#8b5cf6" },
  ];

  const suggestedPrompts = useMemo(
    () => [
      "How much should I allocate monthly to hit my top goal faster?",
      "How can I reduce debt burden without hurting my investments?",
      "What should I adjust this month to improve emergency coverage?",
    ],
    [],
  );

  useEffect(() => {
    if (!isChatOpen || !chatScrollRef.current) {
      return;
    }

    chatScrollRef.current.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages, isAsking, isChatOpen]);

  async function askCopilot(rawPrompt: string): Promise<CopilotResponse | null> {
    const trimmed = rawPrompt.trim();
    if (trimmed.length < 5) {
      setCopilotError("Ask a slightly longer question (at least 5 characters).");
      return null;
    }

    setCopilotError(null);
    setIsAsking(true);

    const history = chatMessages
      .slice(-10)
      .map((message) => ({ role: message.role, content: message.text }))
      .filter((item) => item.content.trim().length > 0);

    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          hypothetical: true,
          attachments: [],
          webpages: [],
          history,
        }),
      });

      const body = (await response.json()) as CopilotResponse & {
        error?: string;
      };

      if (!response.ok) {
        setCopilotError(body.error ?? "Unable to complete your request right now.");
        return null;
      }

      return body;
    } catch {
      setCopilotError("Unable to reach AI service. Please retry in a few seconds.");
      return null;
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div
        className={`grid gap-0 ${
          isSidebarCollapsed ? "xl:grid-cols-[92px_1fr]" : "xl:grid-cols-[240px_1fr]"
        }`}
      >
        <aside className="border-b border-slate-200 bg-gradient-to-b from-slate-950 via-slate-900 to-cyan-950 p-4 text-slate-100 transition-all duration-300 xl:border-b-0 xl:border-r">
          <div className="mb-5 flex items-center justify-between gap-2">
            <div className="rounded-lg bg-cyan-500/90 p-1.5 text-slate-950 shadow-md shadow-cyan-500/30">
              <Brain className="size-4" />
            </div>
            {!isSidebarCollapsed ? <p className="text-sm font-semibold tracking-wide text-slate-100">FinMate</p> : null}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((current) => !current)}
              className="ml-auto inline-flex size-7 items-center justify-center rounded-md border border-white/20 bg-white/10 text-slate-200 transition hover:bg-white/20 hover:text-white"
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={isSidebarCollapsed ? "Expand" : "Collapse"}
            >
              {isSidebarCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
            </button>
          </div>

          {!isSidebarCollapsed ? (
            <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-200">Plan Radar</p>
              <p className="mt-1 text-sm font-medium text-slate-100">Financial pulse: {score}/100</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-lime-300"
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="mb-4 grid place-items-center rounded-xl border border-white/10 bg-white/5 p-3">
              <span className="inline-flex size-9 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/15 text-xs font-semibold text-cyan-100">
                {score}
              </span>
            </div>
          )}

          <nav className="space-y-1.5">
            {leftNavItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`flex w-full items-center ${isSidebarCollapsed ? "justify-center" : "justify-between"} gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  activeNav === item.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-300 hover:bg-cyan-500/20 hover:text-white"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {item.icon}
                  {!isSidebarCollapsed ? <span>{item.label}</span> : null}
                </span>
                {!isSidebarCollapsed && item.badge ? (
                  <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </aside>

        <section className="p-4 sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Good afternoon, {displayName}</h2>
              <p className="text-sm text-slate-500">
                {onboardingComplete
                  ? "Here is your complete financial overview."
                  : "Complete onboarding to improve accuracy of projections."}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <Sparkles className="size-4 text-indigo-600" />
              Deterministic engine active
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Total Income"
              value={formatCurrency(data.monthlyIncome * 12, currencyCode)}
              delta="Based on current monthly baseline"
              icon={<Wallet className="size-4 text-sky-700" />}
            />
            <KpiCard
              title="Take-home"
              value={formatCurrency(data.monthlyIncome, currencyCode)}
              delta={`Savings rate ${pct(data.savingsRate)}`}
              icon={<BriefcaseBusiness className="size-4 text-indigo-700" />}
            />
            <KpiCard
              title="Monthly EMI"
              value={formatCurrency(data.monthlyDebtPayments, currencyCode)}
              delta={`${pct(debtShare)} of monthly income`}
              icon={<Landmark className="size-4 text-amber-700" />}
            />
            <KpiCard
              title="Monthly Investment"
              value={formatCurrency(data.monthlyInvestments, currencyCode)}
              delta={`${pct(investShare)} of monthly income`}
              icon={<PiggyBank className="size-4 text-emerald-700" />}
            />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_1.8fr]">
            <Card className="border-slate-200">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Salary Breakdown</p>
                  <span className="text-xs text-slate-500">Relative monthly mix</span>
                </div>
                <div className="mx-auto w-fit">
                  <svg width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="Salary mix">
                    <circle cx="100" cy="100" r="62" stroke="#e2e8f0" strokeWidth="20" fill="none" />
                    {rings.map((ring, index) => {
                      const circumference = 389.56;
                      const dash = (ring.value / 100) * circumference;
                      const gap = circumference - dash;
                      const prev = rings
                        .slice(0, index)
                        .reduce((sum, item) => sum + (item.value / 100) * circumference, 0);

                      return (
                        <circle
                          key={ring.color}
                          cx="100"
                          cy="100"
                          r="62"
                          stroke={ring.color}
                          strokeWidth="20"
                          fill="none"
                          strokeDasharray={`${dash} ${gap}`}
                          strokeDashoffset={-prev}
                          transform="rotate(-90 100 100)"
                          strokeLinecap="round"
                        />
                      );
                    })}
                    <circle cx="100" cy="100" r="40" fill="white" />
                    <text x="100" y="96" textAnchor="middle" className="fill-slate-500 text-[11px]">
                      Monthly
                    </text>
                    <text x="100" y="115" textAnchor="middle" className="fill-slate-900 text-[14px] font-semibold">
                      {formatCurrency(data.monthlyIncome, currencyCode)}
                    </text>
                  </svg>
                </div>

                <div className="mt-3 space-y-1.5 text-xs">
                  <LegendRow label="Essential expenses" value={pct(expenseShare)} color="bg-sky-500" />
                  <LegendRow label="Investments" value={pct(investShare)} color="bg-emerald-500" />
                  <LegendRow label="Debt" value={pct(debtShare)} color="bg-amber-500" />
                  <LegendRow label="Savings" value={pct(savingsShare)} color="bg-violet-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Monthly Cash Flow</p>
                  <span className="text-xs text-slate-500">Income vs utilization</span>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="mb-3 text-center text-sm font-semibold text-slate-800">
                    {formatCurrency(data.monthlyIncome, currencyCode)} take-home baseline
                  </div>
                  <div className="space-y-3">
                    <FlowRow
                      label="Investments"
                      value={data.monthlyInvestments}
                      width={clamp(investShare, 4, 100)}
                      currencyCode={currencyCode}
                      color="from-emerald-300 to-emerald-500"
                    />
                    <FlowRow
                      label="Debt EMIs"
                      value={data.monthlyDebtPayments}
                      width={clamp(debtShare, 4, 100)}
                      currencyCode={currencyCode}
                      color="from-indigo-300 to-indigo-500"
                    />
                    <FlowRow
                      label="Essential Expenses"
                      value={data.monthlyExpenses}
                      width={clamp(expenseShare, 4, 100)}
                      currencyCode={currencyCode}
                      color="from-sky-300 to-sky-500"
                    />
                    <FlowRow
                      label="Insurance"
                      value={data.monthlyInsurance}
                      width={clamp((data.monthlyInsurance / Math.max(data.monthlyIncome, 1)) * 100, 3, 100)}
                      currencyCode={currencyCode}
                      color="from-fuchsia-300 to-fuchsia-500"
                    />
                    <FlowRow
                      label="Savings"
                      value={Math.max(0, data.monthlySurplus)}
                      width={clamp(savingsShare, 3, 100)}
                      currencyCode={currencyCode}
                      color="from-violet-300 to-violet-500"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card className="border-slate-200">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Your Goals</p>
                  <span className="text-xs text-slate-500">Nominal progress tracker</span>
                </div>
                <div className="space-y-3">
                  {data.goalProgress.length === 0 ? (
                    <p className="text-sm text-slate-500">No goals configured yet.</p>
                  ) : (
                    data.goalProgress.slice(0, 4).map((goal) => (
                      <div key={goal.goalName} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <p className="font-medium text-slate-900">{goal.goalName}</p>
                          <p className="text-slate-500">{goal.horizonMonths} months</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatCurrency(goal.projectedNominal, currencyCode)} of {formatCurrency(goal.targetAmount, currencyCode)}
                        </p>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-indigo-500"
                            style={{ width: `${clamp(goal.progressPctNominal, 0, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Investment Mix</p>
                  <span className="text-xs text-slate-500">Top instruments</span>
                </div>
                <div className="space-y-2">
                  {allocationTop.length === 0 ? (
                    <p className="text-sm text-slate-500">No investments added yet.</p>
                  ) : (
                    allocationTop.map((slice) => (
                      <div key={slice.name}>
                        <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                          <span>{slice.name}</span>
                          <span>{pct(slice.weightPct)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-sky-500" style={{ width: `${slice.weightPct}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

      </div>

      <div className="pointer-events-none fixed bottom-6 right-6 z-40">
        <button
          type="button"
          onClick={() => setIsChatOpen((current) => !current)}
          className="pointer-events-auto inline-flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/40 transition hover:scale-105"
          aria-label="Open financial copilot"
          title="Open financial copilot"
        >
          {isChatOpen ? <X className="size-6" /> : <Bot className="size-6" />}
        </button>
      </div>

      {isChatOpen ? (
        <div
          className={`fixed bottom-24 right-6 z-40 rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all ${
            isChatExpanded
              ? "h-[min(82vh,760px)] w-[min(96vw,700px)]"
              : "h-[min(78vh,620px)] w-[min(96vw,520px)]"
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-900 to-cyan-900 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Finance AI Copilot</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsChatExpanded((current) => !current)}
                className="inline-flex size-7 items-center justify-center rounded-md bg-white/10 transition hover:bg-white/20"
                aria-label={isChatExpanded ? "Compact chat" : "Expand chat"}
                title={isChatExpanded ? "Compact" : "Expand"}
              >
                {isChatExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </button>
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="inline-flex size-7 items-center justify-center rounded-md bg-white/10 transition hover:bg-white/20"
                aria-label="Close chatbot"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div ref={chatScrollRef} className="h-[calc(100%-150px)] space-y-2 overflow-y-auto bg-slate-50 p-3">
            {chatMessages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "rounded-br-sm bg-cyan-600 text-white"
                      : "rounded-bl-sm border border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  <TypewriterText text={message.text} animate={message.role === "assistant" && Boolean(message.animate)} />
                  {message.response ? <AssistantResponseView response={message.response} /> : null}
                </div>
              </div>
            ))}
            {isAsking ? (
              <div className="flex justify-start">
                <AssistantTypingSkeleton />
              </div>
            ) : null}
            {copilotError ? <p className="text-xs text-rose-600">{copilotError}</p> : null}
          </div>

          <div className="space-y-2 border-t border-slate-200 bg-white p-3">
            <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
              {suggestedPrompts.slice(0, 2).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={isAsking}
                  onClick={() => setChatInput(prompt)}
                  className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form
              className="flex items-center gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const prompt = chatInput.trim();
                if (prompt.length < 5) {
                  setCopilotError("Ask a slightly longer question (at least 5 characters).");
                  return;
                }

                setChatMessages((current) => [...current, { role: "user", text: prompt }]);
                setChatInput("");

                const result = await askCopilot(prompt);
                if (!result) {
                  return;
                }

                setChatMessages((current) => [
                  ...current,
                  {
                    role: "assistant",
                    text: result.answer,
                    response: result,
                    animate: true,
                  },
                ]);
              }}
            >
              <Input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask about savings, goals, debt..."
                className="border-slate-300"
              />
              <Button type="submit" size="icon" className="bg-cyan-600 text-white hover:opacity-90" disabled={isAsking}>
                <SendHorizontal className="size-4" />
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type KpiCardProps = {
  title: string;
  value: string;
  delta: string;
  icon: ReactNode;
};

function KpiCard({ title, value, delta, icon }: KpiCardProps) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-slate-500">{title}</p>
          <span className="rounded-md border border-slate-200 bg-slate-50 p-1">{icon}</span>
        </div>
        <p className="text-lg font-semibold text-slate-900">{value}</p>
        <p className="mt-1 text-xs text-emerald-600">{delta}</p>
      </CardContent>
    </Card>
  );
}

type LegendRowProps = {
  label: string;
  value: string;
  color: string;
};

function LegendRow({ label, value, color }: LegendRowProps) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

type FlowRowProps = {
  label: string;
  value: number;
  width: number;
  currencyCode: string;
  color: string;
};

function FlowRow({ label, value, width, currencyCode, color }: FlowRowProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span>{formatCurrency(value, currencyCode)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
          style={{ width: `${clamp(width, 0, 100)}%` }}
        />
      </div>
    </div>
  );
}

function AssistantResponseView({ response }: { response: CopilotResponse }) {
  const metrics = extractVisualMetrics(response.calculations);
  const moneyMetrics = extractMoneyMetrics(response.calculations);
  const scenarioCards = extractScenarioCards(response.calculations);
  const summary = deriveBeginnerSummary(response);
  const maxMoneyMetric = Math.max(...moneyMetrics.map((metric) => metric.value), 1);
  const clarifying = dedupeLines(response.clarifyingQuestions).slice(0, 4);
  const riskNotes = dedupeLines(response.risks).filter(
    (risk) => !/inputs may be incomplete/i.test(risk),
  );
  const actionPlan = dedupeLines(response.nextSteps).filter(
    (step) => !clarifying.some((question) => question.toLowerCase() === step.toLowerCase()),
  );
  const shouldShowClarifying = response.status === "needs_clarification" || clarifying.length > 0;

  return (
    <div className="mt-2 space-y-2 text-xs">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
        <p className="mb-1 font-semibold text-emerald-800">What this means for you</p>
        <p className="text-emerald-900">{summary.headline}</p>
        <div className="mt-1.5 space-y-1 text-emerald-900">
          {summary.bullets.map((bullet) => (
            <p key={bullet}>- {bullet}</p>
          ))}
        </div>
      </div>

      {response.calculations.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          <p className="mb-1 flex items-center gap-1 font-semibold text-slate-600">
            <BarChart3 className="size-3.5" />
            Key numbers used
          </p>
          <div className="space-y-1.5">
            {response.calculations.slice(0, 3).map((item) => (
              <div key={item.name} className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                <p className="font-medium text-slate-800">{friendlyLabel(item.name)}</p>
                <p className="text-slate-600">{item.result}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {scenarioCards.length > 0 ? (
        <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-2.5">
          <p className="mb-1 font-semibold text-sky-700">Scenario Compare</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {scenarioCards.map((scenario) => (
              <div key={scenario.title} className="rounded-lg border border-sky-200 bg-white p-2">
                <p className="text-[11px] font-semibold text-slate-800">{scenario.title}</p>
                <p className="mt-1 text-[11px] text-slate-600">{scenario.detail}</p>
                <span className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                  {scenario.confidence}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {moneyMetrics.length > 1 ? (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-2.5">
          <p className="mb-1 font-semibold text-indigo-700">Simple comparison</p>
          <div className="space-y-1.5">
            {moneyMetrics.map((metric, index) => {
              const width = (metric.value / maxMoneyMetric) * 100;
              return (
                <div key={metric.label}>
                  <div className="mb-1 flex items-center justify-between text-slate-600">
                    <span>{friendlyLabel(metric.label)}</span>
                    <span className="font-medium text-slate-800">{Math.round(metric.value).toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-indigo-100">
                    <div
                      className={`h-full rounded-full ${
                        index === 0 ? "bg-indigo-500" : index === 1 ? "bg-cyan-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${clamp(width, 8, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {metrics.length > 0 ? (
        <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-2.5">
          <p className="mb-1 flex items-center gap-1 font-semibold text-cyan-700">
            <Sparkle className="size-3.5" />
            Visual Indicators
          </p>
          <div className="space-y-1.5">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <div className="mb-1 flex items-center justify-between text-slate-600">
                  <span>{friendlyLabel(metric.label)}</span>
                  <span className="font-medium text-slate-800">{metric.value.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-cyan-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                    style={{ width: `${metric.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {shouldShowClarifying ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5">
          <p className="mb-1 font-semibold text-amber-700">Questions to refine this plan</p>
          <div className="space-y-1 text-amber-900">
            {clarifying.map((question) => (
              <p key={question}>- {question}</p>
            ))}
          </div>
        </div>
      ) : null}

      {actionPlan.length > 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
          <p className="mb-1 font-semibold text-emerald-700">Recommended next steps</p>
          <div className="space-y-1 text-emerald-900">
            {actionPlan.slice(0, 3).map((step) => (
              <p key={step}>- {step}</p>
            ))}
          </div>
        </div>
      ) : null}

      {riskNotes.length > 0 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5">
          <p className="mb-1 flex items-center gap-1 font-semibold text-rose-700">
            <AlertTriangle className="size-3.5" />
            Watchouts
          </p>
          <div className="space-y-1 text-rose-900">
            {riskNotes.slice(0, 2).map((risk) => (
              <p key={risk}>- {risk}</p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AssistantTypingSkeleton() {
  return (
    <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white p-3">
      <div className="animate-pulse space-y-2">
        <div className="h-3 w-2/3 rounded bg-slate-200" />
        <div className="h-3 w-5/6 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-200" />
        <div className="mt-3 h-16 rounded-xl border border-slate-100 bg-slate-100" />
      </div>
    </div>
  );
}

function TypewriterText({ text, animate = false }: { text: string; animate?: boolean }) {
  const [visible, setVisible] = useState(() => (animate ? "" : text));

  useEffect(() => {
    if (!animate) {
      return;
    }

    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setVisible(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timer);
      }
    }, 12);

    return () => clearInterval(timer);
  }, [animate, text]);

  return <p>{visible}</p>;
}

