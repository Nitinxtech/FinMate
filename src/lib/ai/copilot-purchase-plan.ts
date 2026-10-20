import type { CopilotPurchasePlan } from "@/lib/ai/copilot-schemas";

type Roadmap = CopilotPurchasePlan["roadmaps"][number];
type Kind = "car" | "bike" | "gadget" | "other";

type CatalogItem = {
  key: string;
  label: string;
  kind: Kind;
  price: number | null;
  specific: boolean;
  pattern: RegExp;
};

// Typical prices are rough planning figures; the UI flags them as assumed.
const CATALOG: CatalogItem[] = [
  { key: "creta", label: "Creta", kind: "car", price: 1_600_000, specific: true, pattern: /\bcreta\b/ },
  { key: "nexon", label: "Nexon", kind: "car", price: 1_200_000, specific: true, pattern: /\bnexon\b/ },
  { key: "swift", label: "Swift", kind: "car", price: 850_000, specific: true, pattern: /\bswift\b/ },
  { key: "thar", label: "Thar", kind: "car", price: 1_700_000, specific: true, pattern: /\bthar\b/ },
  { key: "innova", label: "Innova", kind: "car", price: 2_000_000, specific: true, pattern: /\binnova\b/ },
  { key: "fortuner", label: "Fortuner", kind: "car", price: 4_500_000, specific: true, pattern: /\bfortuner\b/ },
  { key: "enfield", label: "Royal Enfield", kind: "bike", price: 220_000, specific: true, pattern: /royal enfield|\bbullet\b/ },
  { key: "iphone", label: "iPhone", kind: "gadget", price: 90_000, specific: true, pattern: /\biphone\b/ },
  { key: "macbook", label: "MacBook", kind: "gadget", price: 130_000, specific: true, pattern: /\bmacbook\b/ },
  { key: "car", label: "car", kind: "car", price: 900_000, specific: false, pattern: /\bcar\b/ },
  { key: "bike", label: "bike", kind: "bike", price: 150_000, specific: false, pattern: /\bbikes?\b|motorcycle/ },
  { key: "scooter", label: "scooter", kind: "bike", price: 100_000, specific: false, pattern: /scooter|scooty/ },
  { key: "phone", label: "phone", kind: "gadget", price: 35_000, specific: false, pattern: /\bphone\b|\bmobile\b/ },
  { key: "laptop", label: "laptop", kind: "gadget", price: 75_000, specific: false, pattern: /\blaptop\b/ },
  { key: "home", label: "home", kind: "other", price: null, specific: false, pattern: /\bhouse\b|\bhome\b|\bflat\b|apartment/ },
];

const KIND_DEFAULTS: Record<Kind, { ratePct: number; tenure: number; downShare: number }> = {
  car: { ratePct: 9.5, tenure: 60, downShare: 0.2 },
  bike: { ratePct: 11, tenure: 36, downShare: 0.25 },
  gadget: { ratePct: 12, tenure: 12, downShare: 0.1 },
  other: { ratePct: 11, tenure: 24, downShare: 0.2 },
};

const MAX_MONTHS = 120;
const SAVE_SHARE_OF_SURPLUS = 0.7;
const MAX_EMI_SHARE_OF_INCOME = 0.4;
const FOLLOW_UP_CUE =
  /\b(afford|emi|loan|down\s?payment|how (long|much time|many months)|when|income|then|roadmap|plan|interest|tenure|finance|time)\b|\d/i;
const THREAD_WINDOW_TURNS = 6;

export function detectPurchaseItem(text: string): CatalogItem | null {
  const lowered = text.toLowerCase();
  let best: { item: CatalogItem; index: number } | null = null;

  for (const item of CATALOG) {
    const matches = Array.from(lowered.matchAll(new RegExp(item.pattern.source, "g")));
    if (matches.length === 0) {
      continue;
    }

    const index = matches[matches.length - 1].index ?? 0;
    const better =
      !best ||
      (item.specific && !best.item.specific) ||
      (item.specific === best.item.specific && index > best.index);
    if (better) {
      best = { item, index };
    }
  }

  return best?.item ?? null;
}

export function looksLikePurchase(text: string): boolean {
  const lowered = text.toLowerCase();
  if (/\b(buy|buying|purchase|afford|down\s?payment|on[- ]road|planning to get|want to get|looking to get)\b/.test(lowered)) {
    return true;
  }

  return detectPurchaseItem(lowered) !== null && /\b(financ\w*|roadmap|price|cost)\b/.test(lowered);
}

function sameItem(a: CatalogItem, b: CatalogItem): boolean {
  return a.key === b.key || ((!a.specific || !b.specific) && a.kind === b.kind);
}

// Keeps short follow-ups on the item being discussed and stops one item leaking into another.
export function buildPurchaseThread(userTurns: string[], question: string): string {
  const turns = userTurns.map((turn) => turn.trim()).filter(Boolean);
  let lastItemIndex = -1;
  let threadItem: CatalogItem | null = null;

  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const found = detectPurchaseItem(turns[i]);
    if (found) {
      lastItemIndex = i;
      threadItem = found;
      break;
    }
  }

  if (!threadItem || turns.length - lastItemIndex > THREAD_WINDOW_TURNS) {
    return question;
  }

  const currentItem = detectPurchaseItem(question);
  if (currentItem && !sameItem(currentItem, threadItem)) {
    return question;
  }

  if (!currentItem && question.trim().length > 25 && !FOLLOW_UP_CUE.test(question)) {
    return question;
  }

  let start = lastItemIndex;
  for (let i = lastItemIndex - 1; i >= 0; i -= 1) {
    const earlier = detectPurchaseItem(turns[i]);
    if (!earlier) {
      continue;
    }

    if (!sameItem(earlier, threadItem)) {
      break;
    }
    start = i;
  }

  return [...turns.slice(start), question].join("\n");
}

export type PurchasePlanInput = {
  text: string;
  targetAmount: number | null;
  monthlyIncome: number;
  monthlySurplus: number;
  monthlyDebt: number;
  essentialsMonthly: number;
  emergencyBalance: number;
  currencyCode: string;
  downPayment: number | null;
  tenureMonths: number | null;
  interestRatePct: number | null;
};

function fmt(value: number, currencyCode: string): string {
  const currency = currencyCode.length === 3 ? currencyCode : "USD";
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function waitLabel(months: number): string {
  if (months >= MAX_MONTHS) {
    return "10+ years";
  }

  if (months >= 24) {
    return `${(months / 12).toFixed(1)} years`;
  }

  return months === 1 ? "1 month" : `${months} months`;
}

function monthsToSave(amount: number, perMonth: number): number {
  if (amount <= 0) {
    return 0;
  }

  return perMonth <= 0 ? MAX_MONTHS : Math.min(MAX_MONTHS, Math.ceil(amount / perMonth));
}

function emiFactor(ratePct: number, months: number): number {
  const monthly = ratePct / 1200;
  if (monthly === 0) {
    return 1 / months;
  }

  const growth = Math.pow(1 + monthly, months);
  return (monthly * growth) / (growth - 1);
}

function clampMonths(value: number): number {
  return Math.min(84, Math.max(6, Math.round(value)));
}

export function buildPurchasePlan(input: PurchasePlanInput): CopilotPurchasePlan | null {
  const item = detectPurchaseItem(input.text);
  const price = input.targetAmount ?? item?.price ?? null;
  if (price === null || !(price > 0) || input.monthlyIncome <= 0) {
    return null;
  }

  const priceAssumed = input.targetAmount === null;
  const kind: Kind = item?.kind ?? "other";
  const label = item?.label ?? "purchase";
  const defaults = KIND_DEFAULTS[kind];
  const f = (value: number) => fmt(value, input.currencyCode);

  const income = input.monthlyIncome;
  const surplus = input.monthlySurplus;
  const existingEmi = input.monthlyDebt;
  const usable = Math.max(0, surplus) * SAVE_SHARE_OF_SURPLUS;
  const rate = input.interestRatePct ?? defaults.ratePct;
  const tenure = clampMonths(input.tenureMonths ?? defaults.tenure);
  const factor = emiFactor(rate, tenure);
  const haveNow = Math.min(price, input.downPayment ?? 0);
  const running = kind === "car" ? Math.max(4000, Math.round(price * 0.004)) : kind === "bike" ? 1500 : 0;

  const emiBudget = Math.max(0, surplus - running) * SAVE_SHARE_OF_SURPLUS;
  const emiRoom = Math.max(0, MAX_EMI_SHARE_OF_INCOME * income - existingEmi);
  const comfortableEmi = Math.min(emiBudget, emiRoom);
  const supportableLoan = comfortableEmi / factor;

  const standardDown = price * defaults.downShare;
  const standardEmi = (price - standardDown) * factor;
  const needDown = Math.min(price, Math.max(standardDown, price - supportableLoan));
  const recommendedEmi = (price - needDown) * factor;

  const emergencyTarget = input.essentialsMonthly * 6;
  const emergencyShortfall = Math.max(0, emergencyTarget - input.emergencyBalance);
  const emergencyMonths = input.essentialsMonthly > 0 ? input.emergencyBalance / input.essentialsMonthly : null;

  const downGap = Math.max(0, needDown - haveNow);
  const fillMonths = monthsToSave(emergencyShortfall, usable);
  const downMonths = monthsToSave(downGap, usable);
  const readyInMonths = fillMonths >= MAX_MONTHS || downMonths >= MAX_MONTHS ? MAX_MONTHS : fillMonths + downMonths;
  const readyNow = emergencyShortfall === 0 && downGap === 0;

  const needByBudget = standardEmi / SAVE_SHARE_OF_SURPLUS + running - surplus;
  const incomeNeeded =
    Math.ceil(
      Math.max(income, (existingEmi + standardEmi) / MAX_EMI_SHARE_OF_INCOME, income + Math.max(0, needByBudget)) / 1000,
    ) * 1000;

  const steps: Array<{ title: string; detail: string; months: number }> = [];
  if (emergencyShortfall > 0) {
    steps.push({
      title: "Fill your emergency fund first",
      detail: `Move about ${f(usable)} a month into a separate account until it holds ${f(emergencyTarget)} (6 months of your bills).`,
      months: fillMonths,
    });
  }
  if (downGap > 0) {
    steps.push({
      title: `Save a ${f(needDown)} down payment`,
      detail: `That is ${Math.round((needDown / price) * 100)}% of the price. A bigger down payment keeps your EMI comfortable.`,
      months: readyInMonths,
    });
  }
  steps.push({
    title: readyNow ? "Buy it with a loan" : "Then take the loan and buy",
    detail: `Borrow about ${f(price - needDown)} for ${tenure} months at ${rate}% a year. EMI is about ${f(recommendedEmi)}${
      running > 0 ? `, plus roughly ${f(running)} a month for fuel, insurance and upkeep` : ""
    }.`,
    months: readyInMonths,
  });

  const checks: CopilotPurchasePlan["readiness"]["checks"] = [];
  if (emergencyMonths !== null) {
    checks.push({
      label: "Emergency cushion",
      haveText: `${emergencyMonths.toFixed(1)} months of bills`,
      needText: "6 months",
      progress: Math.min(100, (emergencyMonths / 6) * 100),
      status: emergencyMonths >= 6 ? "ok" : emergencyMonths >= 3 ? "warn" : "bad",
    });
  }
  checks.push({
    label: "Down payment saved",
    haveText: f(haveNow),
    needText: f(needDown),
    progress: needDown > 0 ? Math.min(100, (haveNow / needDown) * 100) : 100,
    status: haveNow >= needDown ? "ok" : haveNow >= needDown * 0.5 ? "warn" : "bad",
  });
  checks.push({
    label: "EMI you can carry comfortably",
    haveText: `${f(comfortableEmi)} a month`,
    needText: `${f(standardEmi)} a month`,
    progress: standardEmi > 0 ? Math.min(100, (comfortableEmi / standardEmi) * 100) : 100,
    status: comfortableEmi >= standardEmi ? "ok" : comfortableEmi >= standardEmi * 0.6 ? "warn" : "bad",
  });
  const emiShareAfter = ((existingEmi + standardEmi) / income) * 100;
  checks.push({
    label: "All EMIs vs your income",
    haveText: `${Math.round(emiShareAfter)}% of income`,
    needText: "under 40%",
    progress: Math.min(100, (MAX_EMI_SHARE_OF_INCOME * 100 * 100) / Math.max(emiShareAfter, 1)),
    status: emiShareAfter <= 40 ? "ok" : emiShareAfter <= 50 ? "warn" : "bad",
  });

  const fitFromLoan = (emi: number): Roadmap["fit"] => {
    const tooMuchDebt = ((existingEmi + emi) / income) * 100 > 40;
    if (surplus <= 0 || tooMuchDebt) {
      return "stretch";
    }

    const ratio = (emi + running) / surplus;
    return ratio <= 0.5 ? "comfortable" : ratio <= 0.8 ? "tight" : "stretch";
  };

  const loanRoute = (args: {
    id: string;
    title: string;
    down: number;
    months: number;
    pros: string[];
    steps: string[];
  }): Roadmap => {
    const principal = Math.max(0, price - args.down);
    const emi = principal * emiFactor(rate, args.months);
    const interest = emi * args.months - principal;
    const wait = Math.min(MAX_MONTHS, fillMonths + monthsToSave(Math.max(0, args.down - haveNow), usable));
    const cons = [`EMI of ${f(emi)} for ${args.months} months`, `You pay ${f(interest)} extra as interest`];
    if (running > 0) {
      cons.push(`Add about ${f(running)} a month for fuel, insurance and upkeep`);
    }
    if (((existingEmi + emi) / income) * 100 > 40) {
      cons.push("Your total EMIs would cross 40% of income, which is the danger zone");
    }

    return {
      id: args.id,
      title: args.title,
      summary: `${
        wait === 0
          ? `Pay ${f(args.down)} now and the rest as a ${f(emi)} EMI. You get it right away.`
          : args.down > haveNow
            ? `Save ${f(args.down)} first, then pay ${f(emi)} a month for ${args.months} months.`
            : `Pay ${f(args.down)} now and ${f(emi)} a month for ${args.months} months.`
      }${fillMonths > 0 ? ` This counts about ${waitLabel(fillMonths)} to top up your emergency fund first.` : ""}`,
      fit: fitFromLoan(emi),
      upfront: args.down,
      monthly: emi,
      months: args.months,
      monthsToOwn: wait,
      totalCost: args.down + emi * args.months,
      extraCost: interest,
      pros: args.pros,
      cons,
      steps: args.steps,
    };
  };

  const roadmaps: Roadmap[] = [];

  const cashMonths = Math.min(MAX_MONTHS, fillMonths + monthsToSave(price - haveNow, usable));
  roadmaps.push({
    id: "cash",
    title: "Save up and pay cash",
    summary:
      cashMonths >= MAX_MONTHS
        ? `At your current spare cash this would take 10+ years, so it is not realistic yet.`
        : `Put aside ${f(usable)} every month and the ${label} is yours in about ${waitLabel(cashMonths)}, with zero interest.${
            fillMonths > 0 ? ` That includes about ${waitLabel(fillMonths)} to top up your emergency fund first.` : ""
          }`,
    fit: cashMonths <= 12 ? "comfortable" : cashMonths <= 24 ? "tight" : "stretch",
    upfront: 0,
    monthly: usable,
    months: cashMonths,
    monthsToOwn: cashMonths,
    totalCost: price,
    extraCost: 0,
    pros: ["You pay only the price, nothing more", "No EMI hanging over your salary", "No risk of missing a payment"],
    cons: [
      cashMonths >= MAX_MONTHS ? "Not achievable at today's spare cash" : `You wait about ${waitLabel(cashMonths)}`,
      "Prices can rise while you save",
    ],
    steps: [
      `Open a separate savings pot just for the ${label}`,
      `Auto-transfer ${f(usable)} on salary day`,
      "Do not dip into your emergency money for this",
    ],
  });

  const userDown = input.downPayment ?? standardDown;
  roadmaps.push(
    loanRoute({
      id: "down-emi",
      title: `${Math.round((userDown / price) * 100)}% down + ${tenure}-month EMI`,
      down: userDown,
      months: tenure,
      pros: [
        haveNow >= userDown ? "You get it immediately" : "Much shorter wait than paying cash",
        "Interest stays modest because the loan is smaller",
      ],
      steps: [
        `Arrange ${f(userDown)} as the down payment`,
        "Compare at least 3 lenders and pick the lowest interest rate",
        "Put the EMI on auto-debit and prepay when you get a bonus",
      ],
    }),
  );

  if (needDown > userDown * 1.05 && needDown < price) {
    roadmaps.push(
      loanRoute({
        id: "comfort-emi",
        title: `${Math.round((needDown / price) * 100)}% down + ${tenure}-month EMI`,
        down: needDown,
        months: tenure,
        pros: ["Sized so the EMI fits your budget", "Lower interest bill than a small down payment"],
        steps: [
          `Save ${f(needDown)} first, in a separate account`,
          "Then take a loan for the rest and keep the EMI under 40% of income in total",
          "Skip add-ons and extended warranties you do not need",
        ],
      }),
    );
  }

  roadmaps.push(
    loanRoute({
      id: "full-loan",
      title: "Full loan, zero upfront",
      down: 0,
      months: Math.max(tenure, 36),
      pros: ["Lowest monthly EMI", "No cash needed today"],
      steps: [
        "Check processing fee and foreclosure charges before signing",
        "Keep your total EMIs under 40% of income",
        "Plan to prepay early so interest does not pile up",
      ],
    }),
  );

  const byId = (id: string) => roadmaps.find((roadmap) => roadmap.id === id && roadmap.fit !== "stretch");
  const cashRoute = roadmaps.find((roadmap) => roadmap.id === "cash");
  // Vehicles and gadgets lose value, so a quick, comfortable cash plan beats borrowing.
  const cashIsQuick = kind !== "other" && cashRoute?.fit === "comfortable";
  const pick = (cashIsQuick ? cashRoute : undefined) ?? byId("comfort-emi") ?? byId("down-emi") ?? byId("cash") ?? byId("full-loan");

  const costliest = [...roadmaps].sort((a, b) => b.extraCost - a.extraCost)[0];
  for (const roadmap of roadmaps) {
    if (pick && roadmap.id === pick.id) {
      roadmap.tag = "recommended";
    } else if (roadmap.id === "cash" && roadmap.fit !== "stretch") {
      roadmap.tag = "safest";
    } else if (roadmap.id === costliest.id && roadmap.extraCost > 0) {
      roadmap.tag = "costly";
    }
  }

  const assumedNote = priceAssumed ? ` I assumed a typical price of ${f(price)}; tell me the real one to sharpen this.` : "";
  const takeaway = readyNow
    ? `Good news: you can go ahead. Borrow about ${f(price - needDown)} over ${tenure} months, and the ${f(recommendedEmi)} EMI fits your budget.${assumedNote}`
    : readyInMonths < MAX_MONTHS
      ? `Honest take: not yet, but you can be ready in about ${waitLabel(readyInMonths)}. Fill your emergency fund, save ${f(needDown)} as a down payment, and your EMI would be about ${f(recommendedEmi)} a month.${assumedNote}`
      : `Honest take: a ${f(price)} ${label} is out of reach on your current budget. You would need roughly ${f(incomeNeeded)} a month in take-home pay to carry it comfortably, or pick something cheaper.${assumedNote}`;

  return {
    itemLabel: label,
    targetAmount: price,
    priceAssumed,
    monthlySurplus: surplus,
    currencyCode: input.currencyCode,
    inputs: [
      { label: "Price", value: f(price), assumed: priceAssumed },
      {
        label: "Down payment",
        value: f(input.downPayment ?? standardDown),
        assumed: input.downPayment === null,
      },
      { label: "Loan interest", value: `${rate}% a year`, assumed: input.interestRatePct === null },
      { label: "Loan length", value: `${tenure} months`, assumed: input.tenureMonths === null },
      { label: "Spare cash a month", value: f(surplus), assumed: false },
    ],
    readiness: {
      readyNow,
      readyInMonths,
      maxPriceToday: supportableLoan + haveNow,
      comfortableEmi,
      standardEmi,
      standardTenure: tenure,
      incomeNow: income,
      incomeNeeded,
      runningCost: running,
      steps,
      checks,
    },
    roadmaps,
    recommendedId: pick?.id ?? "",
    takeaway,
  };
}
