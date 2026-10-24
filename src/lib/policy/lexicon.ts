export type ConditionKey = string;

// Conditions that commonly drive waiting periods, exclusions and sub-limits across policy types.
export const CONDITION_LEXICON: Array<{ key: ConditionKey; label: string; pattern: RegExp }> = [
  { key: "pre-existing", label: "pre-existing conditions", pattern: /pre-?existing|ped\b/i },
  { key: "maternity", label: "maternity", pattern: /maternity|childbirth|pregnan|delivery|new-?born/i },
  { key: "initial", label: "initial waiting period", pattern: /initial (?:waiting )?period|first 30 days|30 days (?:from|of) (?:the )?(?:policy )?(?:inception|commencement)/i },
  { key: "specified-illness", label: "specified illnesses", pattern: /specif(?:ied|ic) (?:disease|illness|condition|procedure|ailment)s?|listed (?:disease|illness|procedure)s?/i },
  { key: "cataract", label: "cataract", pattern: /cataract/i },
  { key: "joint-replacement", label: "joint replacement", pattern: /joint replacement|knee replacement|hip replacement|arthroplasty/i },
  { key: "hernia", label: "hernia", pattern: /hernia|hydrocele/i },
  { key: "cosmetic", label: "cosmetic or plastic surgery", pattern: /cosmetic|plastic surgery|aesthetic/i },
  { key: "dental", label: "dental treatment", pattern: /dental|orthodont/i },
  { key: "infertility", label: "infertility treatment", pattern: /infertil|ivf|assisted reproduc/i },
  { key: "mental-health", label: "mental health", pattern: /mental (?:illness|disorder|health)|psychiatric|psychological/i },
  { key: "obesity", label: "obesity or weight loss", pattern: /obesity|bariatric|weight (?:loss|control)/i },
  { key: "suicide", label: "suicide or self-harm", pattern: /suicide|self[- ]inflicted|self[- ]harm|intentional(?:ly)? (?:self|injur)/i },
  { key: "substance", label: "alcohol or drugs", pattern: /alcohol|drug abuse|intoxicat|under the influence|substance abuse|drunk/i },
  { key: "war", label: "war or hostilities", pattern: /\bwar\b|hostilit|invasion|nuclear|terroris/i },
  { key: "hazardous-sports", label: "hazardous sports", pattern: /hazardous|adventure sport|racing|mountaineering|scuba|paragliding/i },
  { key: "hiv", label: "HIV/AIDS", pattern: /\bhiv\b|\baids\b/i },
  { key: "congenital", label: "congenital conditions", pattern: /congenital|genetic disorder/i },
  { key: "ayush", label: "AYUSH treatment", pattern: /ayush|ayurved|homeopath|unani|siddha/i },
  { key: "wear-and-tear", label: "wear and tear or depreciation", pattern: /wear and tear|depreciation|mechanical (?:or electrical )?breakdown/i },
  { key: "invalid-licence", label: "invalid driving licence", pattern: /valid driving licen[cs]e|without (?:a )?(?:valid |effective )?licen[cs]e|driving licen[cs]e/i },
  { key: "consequential-loss", label: "consequential loss", pattern: /consequential loss/i },
  { key: "commercial-use", label: "commercial use or hire", pattern: /commercial (?:use|purpose)|hire or reward|racing|speed test/i },
  { key: "natural-calamity", label: "natural calamity", pattern: /natural calamit|flood|earthquake|cyclone|storm/i },
  { key: "theft", label: "theft", pattern: /\btheft\b|burglary|stolen/i },
  { key: "fire", label: "fire", pattern: /\bfire\b/i },
  { key: "accident", label: "accident", pattern: /\baccident/i },
  { key: "cancer", label: "cancer", pattern: /cancer|oncolog|malignan/i },
  { key: "cardiac", label: "cardiac conditions", pattern: /cardiac|heart (?:disease|attack)|bypass|angioplast/i },
  { key: "diabetes", label: "diabetes", pattern: /diabet/i },
];

export const COST_HEADS: Array<{ key: string; label: string; pattern: RegExp }> = [
  { key: "room-rent", label: "Room rent", pattern: /room rent|room charges|room category|room type/i },
  { key: "icu", label: "ICU charges", pattern: /\bicu\b|intensive care/i },
  { key: "ambulance", label: "Ambulance", pattern: /ambulance/i },
  { key: "cataract", label: "Cataract", pattern: /cataract/i },
  { key: "ayush", label: "AYUSH treatment", pattern: /ayush/i },
  { key: "domiciliary", label: "Domiciliary treatment", pattern: /domiciliary/i },
  { key: "maternity", label: "Maternity", pattern: /maternity|delivery/i },
  { key: "dental", label: "Dental", pattern: /dental/i },
  { key: "pre-post", label: "Pre/post hospitalisation", pattern: /pre-?hospitali[sz]ation|post-?hospitali[sz]ation/i },
  { key: "organ-donor", label: "Organ donor expenses", pattern: /organ donor/i },
  { key: "physiotherapy", label: "Physiotherapy", pattern: /physiotherap/i },
  { key: "towing", label: "Towing charges", pattern: /towing/i },
  { key: "accessories", label: "Accessories", pattern: /accessor/i },
  { key: "baggage", label: "Baggage", pattern: /baggage/i },
  { key: "funeral", label: "Funeral expenses", pattern: /funeral/i },
];

export const HEDGE_PATTERNS: Array<{ label: string; pattern: RegExp; strong: boolean }> = [
  { label: "at the insurer's discretion", pattern: /(?:sole |absolute )?discretion of (?:the )?(?:company|insurer)|at (?:the |its |their )?(?:company'?s? |insurer'?s? )?(?:sole |absolute )?discretion|(?:company|insurer)'?s? (?:sole |absolute )?discretion|decision of the (?:company|insurer) shall be final/i, strong: true },
  { label: "depends on the policy schedule", pattern: /as (?:specified|stated|mentioned|shown|per) (?:in )?(?:the )?(?:policy )?schedule|as per (?:the )?plan opted/i, strong: true },
  { label: "subject to other terms", pattern: /subject to (?:the )?(?:terms|conditions|limits|exclusions|underwriting)|subject to/i, strong: false },
  { label: "provided that / unless", pattern: /provided that|unless|except (?:as|where|when|for)|save (?:as|that)/i, strong: false },
  { label: "insurer's assessment", pattern: /(?:insurer|company)'?s? (?:opinion|assessment|satisfaction|determination)|in the opinion of (?:the )?(?:company|insurer)/i, strong: true },
  { label: "may apply", pattern: /\bmay\b/i, strong: false },
];

export function matchConditions(text: string): ConditionKey[] {
  return CONDITION_LEXICON.filter((entry) => entry.pattern.test(text)).map((entry) => entry.key);
}

export function conditionLabel(key: ConditionKey): string {
  return CONDITION_LEXICON.find((entry) => entry.key === key)?.label ?? key;
}
