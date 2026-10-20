import {
  Activity,
  Bot,
  Brain,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CircleCheck,
  CircleDollarSign,
  ClipboardList,
  Gauge,
  Goal,
  House,
  Landmark,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardFinanceModel } from "@/lib/finance/dashboard";

type FinanceDashboardProps = {
  data: DashboardFinanceModel;
  currencyCode: string;
  displayName: string;
  onboardingComplete: boolean;
};

type NavItem = {
  label: string;
  icon: ReactNode;
  active?: boolean;
};

const leftNavItems: NavItem[] = [
  { label: "Home", icon: <House className="size-4" />, active: true },
  { label: "Income & Tax", icon: <CircleDollarSign className="size-4" /> },
  { label: "Investments", icon: <TrendingUp className="size-4" /> },
  { label: "Insurance", icon: <ShieldCheck className="size-4" /> },
  { label: "Loans & EMIs", icon: <Landmark className="size-4" /> },
  { label: "Goals", icon: <Goal className="size-4" /> },
  { label: "Reports", icon: <ClipboardList className="size-4" /> },
  { label: "Ask AI", icon: <Bot className="size-4" /> },
];

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

  const insights = buildInsights(data, currencyCode);
  const actions = buildActions(data, currencyCode);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-0 xl:grid-cols-[220px_1fr_320px]">
        <aside className="border-b border-slate-200 bg-slate-50 p-4 xl:border-b-0 xl:border-r">
          <div className="mb-5 flex items-center gap-2">
            <div className="rounded-lg bg-indigo-600 p-1.5 text-white">
              <Brain className="size-4" />
            </div>
            <p className="text-sm font-semibold text-slate-900">FinMate</p>
          </div>

          <nav className="space-y-1.5">
            {leftNavItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  item.active
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
            <p className="text-xs font-semibold text-indigo-700">Upgrade to Pro</p>
            <p className="mt-1 text-xs text-indigo-600">
              Unlock deeper portfolio diagnostics and advanced AI planning flows.
            </p>
          </div>
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

        <aside className="border-t border-slate-200 bg-slate-50 p-4 sm:p-5 xl:border-l xl:border-t-0">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">AI Insights</p>
            <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-semibold text-indigo-700">
              NEW
            </span>
          </div>

          <Card className="border-slate-200 bg-white">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500">Financial stability</p>
                <Gauge className="size-4 text-indigo-600" />
              </div>
              <div
                className="mx-auto grid h-32 w-32 place-content-center rounded-full"
                style={{
                  background: `conic-gradient(#0ea5e9 ${score * 3.6}deg, #e2e8f0 ${score * 3.6}deg 360deg)`,
                }}
              >
                <div className="grid h-24 w-24 place-content-center rounded-full bg-white text-center">
                  <p className="text-2xl font-bold text-slate-900">{score}</p>
                  <p className="text-xs text-emerald-600">{score >= 70 ? "Great" : "Stable"}</p>
                </div>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                <SimpleMetric label="Income Stability" value={Math.round(clamp(70 + data.savingsRate, 50, 98))} />
                <SimpleMetric label="Savings Rate" value={Math.round(clamp(data.savingsRate * 2, 20, 95))} />
                <SimpleMetric label="Debt Management" value={Math.round(clamp(95 - debtShare * 1.8, 35, 95))} />
                <SimpleMetric label="Insurance Cover" value={Math.round(clamp(55 + (data.monthlyInsurance > 0 ? 18 : 0), 40, 90))} />
              </div>
            </CardContent>
          </Card>

          <div className="mt-4 space-y-3">
            <PanelBlock
              title="AI Insights"
              icon={<ChartNoAxesCombined className="size-4 text-sky-700" />}
              items={insights}
            />
            <PanelBlock
              title="Upcoming Actions"
              icon={<Activity className="size-4 text-amber-700" />}
              items={actions}
            />
          </div>
        </aside>
      </div>
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

type PanelBlockProps = {
  title: string;
  icon: ReactNode;
  items: Array<{ title: string; detail: string }>;
};

function PanelBlock({ title, icon, items }: PanelBlockProps) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardContent className="p-3.5">
        <div className="mb-2 flex items-center gap-2">
          {icon}
          <p className="text-sm font-semibold text-slate-900">{title}</p>
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.title} className="rounded-lg border border-slate-200 p-2.5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                <CircleCheck className="size-3.5 text-emerald-600" />
                {item.title}
              </p>
              <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SimpleMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
      <span>{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

function buildInsights(data: DashboardFinanceModel, currencyCode: string): Array<{ title: string; detail: string }> {
  const insights: Array<{ title: string; detail: string }> = [];

  if (data.monthlySurplus > 0) {
    insights.push({
      title: `You can save ${formatCurrency(data.monthlySurplus, currencyCode)} monthly`,
      detail: "Current inflow/outflow pattern indicates positive investable headroom.",
    });
  } else {
    insights.push({
      title: "Cash flow is currently constrained",
      detail: "Monthly outflows exceed baseline take-home income; review debt and fixed expenses first.",
    });
  }

  if (data.monthlyDebtPayments > 0 && data.monthlyIncome > 0) {
    insights.push({
      title: `Debt consumes ${pct((data.monthlyDebtPayments / data.monthlyIncome) * 100)} of income`,
      detail: "Lowering this ratio improves future savings flexibility and risk resilience.",
    });
  }

  insights.push({
    title: "Projection model is deterministic",
    detail: "Current projections use fixed assumptions with no tax estimation and no guaranteed return claims.",
  });

  return insights.slice(0, 3);
}

function buildActions(data: DashboardFinanceModel, currencyCode: string): Array<{ title: string; detail: string }> {
  const actions: Array<{ title: string; detail: string }> = [];

  if (data.emergencyCoverageMonths < 6) {
    actions.push({
      title: "Build emergency reserve",
      detail: `Target shortfall is ${formatCurrency(data.emergencyFundShortfall, currencyCode)} to reach six-month coverage.`,
    });
  }

  if (data.goalProgress.length > 0) {
    const slowest = data.goalProgress
      .slice()
      .sort((a, b) => a.progressPctNominal - b.progressPctNominal)[0];

    if (slowest) {
      actions.push({
        title: `Review goal: ${slowest.goalName}`,
        detail: `Required monthly contribution is ${formatCurrency(slowest.requiredMonthlyContribution, currencyCode)}.`,
      });
    }
  }

  actions.push({
    title: "Update profile monthly",
    detail: "Refreshing salary, debt, and investment entries keeps the dashboard accurate and actionable.",
  });

  return actions.slice(0, 3);
}
