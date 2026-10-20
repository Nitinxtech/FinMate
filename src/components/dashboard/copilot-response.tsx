"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, Lightbulb, ListChecks, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import type { CopilotResponse } from "@/lib/ai/copilot-schemas";

type Plan = NonNullable<CopilotResponse["plan"]>;
type Roadmap = Plan["roadmaps"][number];

const FIT_STYLES: Record<Roadmap["fit"], { label: string; badge: string; bar: string }> = {
  comfortable: {
    label: "Easy on your wallet",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    bar: "bg-emerald-500",
  },
  tight: {
    label: "Tight but doable",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    bar: "bg-amber-500",
  },
  stretch: {
    label: "A stretch",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    bar: "bg-rose-500",
  },
};

const TAG_LABELS: Record<NonNullable<Roadmap["tag"]>, string> = {
  recommended: "Best fit for you",
  safest: "Safest",
  fastest: "Fastest",
  costly: "Costs the most",
};

function money(value: number, currencyCode: string): string {
  const currency = currencyCode.length === 3 ? currencyCode : "USD";
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function waitLabel(months: number): string {
  if (months <= 0) {
    return "Today";
  }

  if (months >= 120) {
    return "10+ years";
  }

  if (months >= 24) {
    return `${(months / 12).toFixed(1)} years`;
  }

  return months === 1 ? "1 month" : `${months} months`;
}

const CHECK_STYLES: Record<Plan["readiness"]["checks"][number]["status"], { bar: string; text: string }> = {
  ok: { bar: "bg-emerald-500", text: "text-emerald-700" },
  warn: { bar: "bg-amber-500", text: "text-amber-700" },
  bad: { bar: "bg-rose-500", text: "text-rose-700" },
};

function ReadinessCard({ plan }: { plan: Plan }) {
  const r = plan.readiness;
  const code = plan.currencyCode;
  const reachable = r.readyInMonths < 120;
  const verdict = r.readyNow
    ? { label: "You can go ahead", tone: "bg-emerald-600 text-white" }
    : reachable
      ? { label: `Ready in about ${waitLabel(r.readyInMonths)}`, tone: "bg-amber-500 text-white" }
      : { label: "Out of reach for now", tone: "bg-rose-600 text-white" };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Can you afford it?</p>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${verdict.tone}`}>{verdict.label}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Most you could take on today" value={money(r.maxPriceToday, code)} />
        <Stat label="EMI you can carry" value={money(r.comfortableEmi, code)} sub="a month" />
        <Stat
          label="Take-home that makes it easy"
          value={money(r.incomeNeeded, code)}
          sub={r.incomeNeeded > r.incomeNow ? `now ${money(r.incomeNow, code)}` : "you are there"}
          tone={r.incomeNeeded > r.incomeNow ? "text-amber-600" : "text-emerald-600"}
        />
        <Stat
          label="Running costs"
          value={r.runningCost > 0 ? money(r.runningCost, code) : "None"}
          sub={r.runningCost > 0 ? "a month, rough" : undefined}
        />
      </div>

      <p className="mb-1.5 mt-4 text-[12px] font-semibold text-slate-900">What you need to hit</p>
      <div className="space-y-2.5">
        {r.checks.map((check) => {
          const style = CHECK_STYLES[check.status];
          return (
            <div key={check.label}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-1 text-[12px]">
                <span className="font-medium text-slate-800">{check.label}</span>
                <span className={`font-semibold ${style.text}`}>
                  {check.haveText} <span className="font-normal text-slate-500">/ aim for {check.needText}</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${style.bar}`}
                  style={{ width: `${Math.min(100, Math.max(3, check.progress))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mb-1.5 mt-4 text-[12px] font-semibold text-slate-900">Your path, in order</p>
      <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4">
        {r.steps.map((step, index) => (
          <li key={step.title} className="relative">
            <span className="absolute -left-[25px] grid size-5 place-items-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
              {index + 1}
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[12px] font-semibold text-slate-900">{step.title}</p>
              <span className="text-[11px] font-medium text-slate-500">
                {step.months > 0 ? `done by ${waitLabel(step.months)}` : "right away"}
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-slate-600">{step.detail}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={index} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export function FormattedText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: number) => {
    if (bullets.length === 0) {
      return;
    }

    blocks.push(
      <ul key={`ul-${key}`} className="my-1.5 list-disc space-y-1 pl-5">
        {bullets.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  text.split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*\u2022]\s+(.*)$/);

    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }

    flushBullets(index);
    if (trimmed) {
      blocks.push(
        <p key={`p-${index}`} className="leading-relaxed">
          {renderInline(trimmed)}
        </p>,
      );
    }
  });
  flushBullets(text.length);

  return <div className="space-y-1.5">{blocks}</div>;
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
      {sub ? <p className={`text-[11px] ${tone ?? "text-slate-500"}`}>{sub}</p> : null}
    </div>
  );
}

function RoadmapCard({
  roadmap,
  index,
  isPick,
  plan,
}: {
  roadmap: Roadmap;
  index: number;
  isPick: boolean;
  plan: Plan;
}) {
  const fit = FIT_STYLES[roadmap.fit];
  const code = plan.currencyCode;
  const usage = plan.monthlySurplus > 0 ? (roadmap.monthly / plan.monthlySurplus) * 100 : 100;
  const monthlyLabel = roadmap.id === "cash" ? "Save each month" : "Pay each month";

  return (
    <div
      className={`rounded-2xl border bg-white p-3.5 shadow-sm ${
        isPick ? "border-emerald-300 ring-2 ring-emerald-100" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
            {index + 1}
          </span>
          <h4 className="text-sm font-semibold text-slate-900">{roadmap.title}</h4>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {roadmap.tag ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                roadmap.tag === "recommended"
                  ? "bg-emerald-600 text-white"
                  : roadmap.tag === "costly"
                    ? "bg-rose-100 text-rose-700"
                    : "bg-sky-100 text-sky-700"
              }`}
            >
              {roadmap.tag === "recommended" ? <Trophy className="size-3" /> : null}
              {TAG_LABELS[roadmap.tag]}
            </span>
          ) : null}
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${fit.badge}`}>{fit.label}</span>
        </div>
      </div>

      <p className="mt-2 text-[13px] leading-relaxed text-slate-700">{roadmap.summary}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Pay now" value={roadmap.upfront > 0 ? money(roadmap.upfront, code) : "Nothing"} />
        <Stat
          label={monthlyLabel}
          value={money(roadmap.monthly, code)}
          sub={roadmap.months > 0 ? `for ${waitLabel(roadmap.months)}` : undefined}
        />
        <Stat label="You own it in" value={waitLabel(roadmap.monthsToOwn)} />
        <Stat
          label="Total you pay"
          value={money(roadmap.totalCost, code)}
          sub={roadmap.extraCost > 0 ? `+${money(roadmap.extraCost, code)} interest` : "No interest"}
          tone={roadmap.extraCost > 0 ? "text-rose-600" : "text-emerald-600"}
        />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
          <span>Share of your spare cash this needs</span>
          <span className="font-semibold text-slate-700">{Math.round(usage)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${fit.bar}`} style={{ width: `${Math.min(100, Math.max(4, usage))}%` }} />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-emerald-50 p-2.5">
          <p className="mb-1 text-[11px] font-semibold text-emerald-800">Why it works</p>
          <ul className="space-y-1 text-[12px] text-emerald-900">
            {roadmap.pros.map((item) => (
              <li key={item} className="flex gap-1.5">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg bg-rose-50 p-2.5">
          <p className="mb-1 text-[11px] font-semibold text-rose-800">Watch out</p>
          <ul className="space-y-1 text-[12px] text-rose-900">
            {roadmap.cons.map((item) => (
              <li key={item} className="flex gap-1.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <details className="group mt-3 rounded-lg border border-slate-200">
        <summary className="flex cursor-pointer list-none items-center justify-between px-2.5 py-2 text-[12px] font-semibold text-slate-700">
          How to do this, step by step
          <ChevronDown className="size-4 transition group-open:rotate-180" />
        </summary>
        <ol className="space-y-1.5 border-t border-slate-100 px-2.5 py-2 text-[12px] text-slate-700">
          {roadmap.steps.map((step, stepIndex) => (
            <li key={step} className="flex gap-2">
              <span className="font-semibold text-slate-400">{stepIndex + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function CostChart({ plan }: { plan: Plan }) {
  const code = plan.currencyCode;
  const max = Math.max(...plan.roadmaps.map((roadmap) => roadmap.totalCost), plan.targetAmount, 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
      <p className="text-sm font-semibold text-slate-900">What each route really costs you</p>
      <p className="mb-3 text-[11px] text-slate-500">
        The {plan.itemLabel} is {money(plan.targetAmount, code)}. Anything in red is the extra you pay for waiting less.
      </p>
      <div className="space-y-2.5">
        {plan.roadmaps.map((roadmap, index) => (
          <div key={roadmap.id}>
            <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-slate-700">
                {index + 1}. {roadmap.title}
              </span>
              <span className="shrink-0 font-semibold text-slate-900">{money(roadmap.totalCost, code)}</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-sky-500"
                style={{ width: `${((roadmap.totalCost - roadmap.extraCost) / max) * 100}%` }}
              />
              <div className="h-full bg-rose-500" style={{ width: `${(roadmap.extraCost / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-sky-500" /> Price of the {plan.itemLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-rose-500" /> Interest you pay
        </span>
      </div>
    </div>
  );
}

function PlanView({ response, plan }: { response: CopilotResponse; plan: Plan }) {
  const code = plan.currencyCode;

  return (
    <div className="mt-3 space-y-3 text-xs">
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900 p-3.5 text-white">
        <div className="flex items-start gap-2">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <p className="text-[13px] leading-relaxed">{plan.takeaway}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {plan.inputs.map((input) => (
            <span
              key={input.label}
              className={`rounded-full px-2 py-1 text-[11px] ${
                input.assumed ? "border border-dashed border-white/40 text-white/80" : "bg-white/15 text-white"
              }`}
              title={input.assumed ? "I assumed this. Tell me the real value to sharpen the plan." : undefined}
            >
              {input.label}: <span className="font-semibold">{input.value}</span>
              {input.assumed ? " (assumed)" : ""}
            </span>
          ))}
        </div>
      </div>

      <ReadinessCard plan={plan} />

      <p className="px-1 text-[13px] font-semibold text-slate-900">
        {plan.roadmaps.length} ways to get your {plan.itemLabel} (from {money(plan.monthlySurplus, code)} spare cash a
        month)
      </p>

      {plan.roadmaps.map((roadmap, index) => (
        <RoadmapCard
          key={roadmap.id}
          roadmap={roadmap}
          index={index}
          isPick={roadmap.id === plan.recommendedId}
          plan={plan}
        />
      ))}

      <CostChart plan={plan} />

      {response.nextSteps.length > 0 ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-sky-900">
            <ListChecks className="size-4" />
            Your next moves
          </p>
          <ol className="space-y-1 text-[12px] text-sky-900">
            {response.nextSteps.slice(0, 3).map((step, index) => (
              <li key={step} className="flex gap-2">
                <span className="font-semibold">{index + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {response.risks.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-[12px] text-amber-900">
          <p className="mb-1 font-semibold">Keep in mind</p>
          <ul className="list-disc space-y-1 pl-4">
            {response.risks.slice(0, 2).map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {response.clarifyingQuestions.length > 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-3.5">
          <p className="mb-1.5 text-[13px] font-semibold text-slate-900">Tell me these and I will sharpen the plan</p>
          <ul className="list-disc space-y-1 pl-4 text-[12px] text-slate-700">
            {response.clarifyingQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function AssistantResponseView({ response }: { response: CopilotResponse }) {
  if (response.plan) {
    return <PlanView response={response} plan={response.plan} />;
  }

  if (response.status === "needs_clarification" && response.clarifyingQuestions.length > 0) {
    return (
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-slate-700">
        {response.clarifyingQuestions.map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ul>
    );
  }

  if (response.nextSteps.length > 0) {
    return (
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-slate-700">
        {response.nextSteps.slice(0, 3).map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
    );
  }

  return null;
}
