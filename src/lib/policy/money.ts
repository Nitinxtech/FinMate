export type Money = { amount: number; currency: string | null };
export type MoneyMatch = { money: Money; raw: string; index: number };

const CURRENCIES: Record<string, string> = {
  "\u20B9": "INR",
  rs: "INR",
  inr: "INR",
  "$": "USD",
  usd: "USD",
  "\u20AC": "EUR",
  eur: "EUR",
  "\u00A3": "GBP",
  gbp: "GBP",
  aed: "AED",
  sgd: "SGD",
};

const UNIT_MULTIPLIERS: Record<string, number> = {
  lakh: 100_000,
  lakhs: 100_000,
  lac: 100_000,
  lacs: 100_000,
  crore: 10_000_000,
  crores: 10_000_000,
  cr: 10_000_000,
  thousand: 1_000,
  k: 1_000,
  million: 1_000_000,
  mn: 1_000_000,
};

// A figure only counts as money when it carries a currency marker or a unit; bare numbers are ambiguous.
const MONEY_PATTERN =
  /(?:(\u20B9|\u20AC|\u00A3|\$|rs\.?|inr|usd|eur|gbp|aed|sgd)\s*)?(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(lakhs?|lacs?|crores?|cr|thousand|million|mn|k)\b)?/gi;

export function findMoney(text: string): MoneyMatch[] {
  const matches: MoneyMatch[] = [];

  for (const match of text.matchAll(MONEY_PATTERN)) {
    const [raw, symbol, digits, unit] = match;
    if (!symbol && !unit) {
      continue;
    }

    const base = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(base)) {
      continue;
    }

    const multiplier = unit ? (UNIT_MULTIPLIERS[unit.toLowerCase()] ?? 1) : 1;
    const currency = symbol ? (CURRENCIES[symbol.toLowerCase().replace(/\.$/, "")] ?? null) : null;
    matches.push({ money: { amount: Math.round(base * multiplier * 100) / 100, currency }, raw: raw.trim(), index: match.index ?? 0 });
  }

  return matches;
}

export function parseMoney(text: string): Money | null {
  return findMoney(text)[0]?.money ?? null;
}

export function findPercent(text: string): number | null {
  const match = /(\d{1,3}(?:\.\d+)?)\s*(?:%|per\s*cent|percent)/i.exec(text);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export type Duration = { value: number; unit: "day" | "month" | "year" | "hour"; days: number };

export function findDuration(text: string): Duration | null {
  const match = /(\d{1,3})\s*(hours?|hrs?|days?|months?|years?|yrs?)\b/i.exec(text);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  const unitText = match[2].toLowerCase();
  const unit = unitText.startsWith("h") ? "hour" : unitText.startsWith("d") ? "day" : unitText.startsWith("m") ? "month" : "year";
  const days = unit === "hour" ? value / 24 : unit === "day" ? value : unit === "month" ? value * 30 : value * 365;
  return { value, unit, days };
}

export function formatMoney(amount: number, currency: string | null): string {
  const code = currency && currency.length === 3 ? currency : "INR";
  return new Intl.NumberFormat(code === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}
