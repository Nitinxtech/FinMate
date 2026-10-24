"use client";

import { useState, type ReactNode } from "react";
import { Calculator, Loader2 } from "lucide-react";
import { BasisBadge, CitationChip } from "@/components/policy/citation-chip";
import { readError } from "@/components/policy/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ScenarioInput, ScenarioResult } from "@/lib/policy/scenario";
import type { Citation, PolicyType } from "@/lib/policy/types";

type Props = {
  documentId: string;
  policyType: PolicyType;
  onJump?: (citation: Citation) => void;
};

type Kind = ScenarioInput["kind"];

const OUTCOME_STYLES = {
  may_apply: { label: "May apply", className: "bg-rose-100 text-rose-800" },
  does_not_appear_to_apply: { label: "Does not appear to apply", className: "bg-emerald-100 text-emerald-800" },
  cannot_determine: { label: "Cannot determine", className: "bg-slate-200 text-slate-700" },
} as const;

function defaultKind(type: PolicyType): Kind {
  return type === "motor" ? "motor_damage" : type === "life" ? "life_death" : type === "health" ? "health_hospitalization" : "generic";
}

function numberOrNull(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function PolicyScenario({ documentId, policyType, onJump }: Props) {
  const [kind, setKind] = useState<Kind>(defaultKind(policyType));
  const [claimAmount, setClaimAmount] = useState("");
  const [months, setMonths] = useState("");
  const [circumstance, setCircumstance] = useState("");
  const [age, setAge] = useState("");
  const [roomRent, setRoomRent] = useState("");
  const [stayDays, setStayDays] = useState("");
  const [sumOverride, setSumOverride] = useState("");
  const [preExisting, setPreExisting] = useState(false);
  const [voluntary, setVoluntary] = useState(false);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/policies/${documentId}/scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: {
            kind,
            claimAmount: numberOrNull(claimAmount),
            monthsSinceStart: numberOrNull(months),
            circumstance,
            isPreExisting: preExisting,
            insuredAge: numberOrNull(age),
            roomRentPerDay: numberOrNull(roomRent),
            stayDays: numberOrNull(stayDays),
            sumInsuredOverride: numberOrNull(sumOverride),
            chooseVoluntaryDeductible: voluntary,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, "The scenario could not be analysed."));
      }

      setResult(((await response.json()) as { result: ScenarioResult }).result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const currency = result?.estimate?.currency ?? "INR";

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">What-if scenario</h3>
            <p className="text-xs text-slate-500">Describe a situation. Every number you enter is shown back as an assumption, and only terms actually found in the policy are applied.</p>
          </div>

          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run();
            }}
          >
            <Field label="Type of event">
              <select value={kind} onChange={(event) => setKind(event.target.value as Kind)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="health_hospitalization">Hospitalisation (health)</option>
                <option value="motor_damage">Vehicle damage (motor)</option>
                <option value="life_death">Death claim (life)</option>
                <option value="generic">Other claim</option>
              </select>
            </Field>
            {kind !== "life_death" ? (
              <Field label="Claim amount" hint="The total bills or repair cost you expect.">
                <Input inputMode="decimal" value={claimAmount} onChange={(event) => setClaimAmount(event.target.value)} placeholder="e.g. 200000" />
              </Field>
            ) : null}
            <Field label="Months since the policy started" hint="Needed to check waiting periods.">
              <Input inputMode="decimal" value={months} onChange={(event) => setMonths(event.target.value)} placeholder="e.g. 18" />
            </Field>
            <Field label="Age of the insured person" hint="Some co-payments depend on age.">
              <Input inputMode="numeric" value={age} onChange={(event) => setAge(event.target.value)} placeholder="e.g. 62" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="What happened?" hint="Short description. It is compared with the policy's exclusions by keyword only.">
                <Input value={circumstance} onChange={(event) => setCircumstance(event.target.value)} maxLength={400} placeholder="e.g. knee replacement surgery" />
              </Field>
            </div>
            {kind === "health_hospitalization" ? (
              <>
                <Field label="Room rent per day">
                  <Input inputMode="decimal" value={roomRent} onChange={(event) => setRoomRent(event.target.value)} placeholder="e.g. 8000" />
                </Field>
                <Field label="Days in hospital">
                  <Input inputMode="numeric" value={stayDays} onChange={(event) => setStayDays(event.target.value)} placeholder="e.g. 4" />
                </Field>
              </>
            ) : null}
            {kind !== "life_death" ? (
              <Field label="Sum insured / IDV (optional)" hint="Leave blank to use the figure found in the policy.">
                <Input inputMode="decimal" value={sumOverride} onChange={(event) => setSumOverride(event.target.value)} />
              </Field>
            ) : null}
            <div className="flex flex-col justify-end gap-2 text-sm text-slate-700">
              {kind === "health_hospitalization" ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={preExisting} onChange={(event) => setPreExisting(event.target.checked)} /> The condition existed before the policy started
                </label>
              ) : null}
              {kind === "motor_damage" ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={voluntary} onChange={(event) => setVoluntary(event.target.checked)} /> I chose a voluntary deductible
                </label>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />} Analyse scenario
              </Button>
            </div>
          </form>

          {error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {result ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
              {result.summary.map((line) => (
                <p key={line} className="text-sm text-slate-800">
                  {line}
                </p>
              ))}

              {result.estimate ? (
                <div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Split between insurer and you">
                    <div className="bg-emerald-500" style={{ width: `${result.estimate.claimAmount > 0 ? (result.estimate.insurerShare / result.estimate.claimAmount) * 100 : 0}%` }} />
                    <div className="bg-rose-400" style={{ width: `${result.estimate.claimAmount > 0 ? (result.estimate.yourShare / result.estimate.claimAmount) * 100 : 0}%` }} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-slate-600">
                    <span>
                      <span className="mr-1 inline-block size-2 rounded-full bg-emerald-500" /> Insurer, if the claim is accepted: <b>{money(result.estimate.insurerShare, currency)}</b>
                    </span>
                    <span>
                      <span className="mr-1 inline-block size-2 rounded-full bg-rose-400" /> You: <b>{money(result.estimate.yourShare, currency)}</b>
                    </span>
                  </div>
                  {!result.estimate.complete ? <p className="mt-1 text-xs text-amber-700">Incomplete: some terms could not be applied (listed below).</p> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Assumptions used</h3>
              <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                {result.assumptions.map((assumption) => (
                  <li key={assumption.label} className="flex items-baseline justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5">
                    <span className="text-slate-600">{assumption.label}</span>
                    <span className="text-right font-medium text-slate-900">
                      {assumption.value} <span className="text-[10px] font-normal uppercase text-slate-400">({assumption.source})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {result.screening.length > 0 ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Waiting periods and exclusions</h3>
                {result.screening.map((item, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${OUTCOME_STYLES[item.outcome].className}`}>{OUTCOME_STYLES[item.outcome].label}</span>
                      <BasisBadge basis={item.basis} />
                      <span className="text-sm font-medium text-slate-900">{item.label}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-700">{item.detail}</p>
                    {item.citations.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {item.citations.map((citation, citationIndex) => (
                          <div key={citationIndex}>
                            <CitationChip citation={citation} onJump={onJump} />
                            <blockquote className="mt-1 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-600">&ldquo;{citation.quote}&rdquo;</blockquote>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {result.steps.length > 0 ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="text-sm font-semibold text-slate-900">How the amount was worked out</h3>
                <ol className="space-y-3">
                  {result.steps.map((step, index) => (
                    <li key={index} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="grid size-5 place-items-center rounded-full bg-slate-900 text-[10px] font-bold text-white">{index + 1}</span>
                        <span className="text-sm font-medium text-slate-900">{step.title}</span>
                        <BasisBadge basis={step.basis} />
                      </div>
                      <p className="mt-1.5 text-sm text-slate-700">{step.detail}</p>
                      {step.effect ? <p className="mt-1 text-sm font-semibold text-cyan-800">{step.effect}</p> : null}
                      {step.citations.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {step.citations.map((citation, citationIndex) => (
                            <CitationChip key={citationIndex} citation={citation} onJump={onJump} />
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}

          {result.notApplied.length > 0 ? (
            <Card>
              <CardContent className="space-y-2 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Not applied, because the text did not allow it</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {result.notApplied.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <p className="text-[11px] leading-relaxed text-slate-500">{result.disclaimer}</p>
        </div>
      ) : null}
    </div>
  );
}
