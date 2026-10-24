import type { Clause, PageText } from "@/lib/policy/types";

const MAX_CLAUSE_CHARS = 1400;

const SECTION_HEADING =
  /^(section|part|chapter|article|schedule|annexure|appendix|clause|exclusion|benefit)\s+([A-Z0-9]{1,6}(?:\.\d{1,3})*)\b[\s:.\-\u2013\u2014]*(.*)$/i;
const NUMBERED = /^(\d{1,2}(?:\.\d{1,3})+|\d{1,2}[.)])\s+(\S.*)$/;
const LETTERED = /^\(([a-z]|[ivx]{1,4})\)\s+(\S.*)$/i;
const PAGE_MARKER = /^(?:page\s+)?\d{1,3}\s*(?:of|\/)\s*\d{1,3}$|^page\s+\d{1,3}$/i;

function isAllCapsHeading(line: string): boolean {
  if (line.length < 4 || line.length > 80 || /[.;,]$/.test(line)) {
    return false;
  }

  const letters = line.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 4) {
    return false;
  }

  const upper = line.match(/\p{Lu}/gu)?.length ?? 0;
  return upper / letters >= 0.85;
}

function normalizeLineKey(line: string): string {
  return line.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
}

// Running headers/footers repeat on most pages and would otherwise pollute every clause.
// Numbered clauses and section headings are content, never headers, even when boilerplate repeats.
function isStructuralLine(line: string): boolean {
  return NUMBERED.test(line) || LETTERED.test(line) || SECTION_HEADING.test(line);
}

function findRepeatedLines(pages: PageText[]): Set<string> {
  if (pages.length < 4) {
    return new Set();
  }

  const counts = new Map<string, number>();
  for (const page of pages) {
    const seen = new Set<string>();
    for (const raw of page.text.split("\n")) {
      const line = raw.trim();
      const key = normalizeLineKey(line);
      if (key.length > 3 && key.length < 100 && !seen.has(key) && !isStructuralLine(line)) {
        seen.add(key);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  const threshold = Math.ceil(pages.length * 0.6);
  return new Set([...counts.entries()].filter(([, count]) => count >= threshold).map(([key]) => key));
}

type Draft = {
  ref: string | null;
  heading: string | null;
  section: string | null;
  lines: string[];
  continued: boolean;
};

function splitLongText(text: string): string[] {
  if (text.length <= MAX_CLAUSE_CHARS) {
    return [text];
  }

  const parts: string[] = [];
  let rest = text;
  while (rest.length > MAX_CLAUSE_CHARS) {
    const window = rest.slice(0, MAX_CLAUSE_CHARS);
    const boundary = Math.max(window.lastIndexOf(". "), window.lastIndexOf(".\n"), window.lastIndexOf("; "));
    const cut = boundary > MAX_CLAUSE_CHARS * 0.5 ? boundary + 1 : MAX_CLAUSE_CHARS;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  if (rest) {
    parts.push(rest);
  }

  return parts;
}

export function segmentClauses(pages: PageText[]): Clause[] {
  const repeated = findRepeatedLines(pages);
  const clauses: Clause[] = [];

  let section: string | null = null;
  let lastNumberedRef: string | null = null;
  let carry: { ref: string | null; heading: string | null } | null = null;

  const flush = (draft: Draft | null, page: number) => {
    if (!draft) {
      return;
    }

    const body = draft.lines.join("\n").trim();
    if (!body && (draft.continued || !draft.heading)) {
      return;
    }

    const text = body || (draft.heading ?? "");
    splitLongText(text).forEach((part, position) => {
      clauses.push({
        index: clauses.length,
        ref: draft.ref,
        heading: draft.heading,
        section: draft.section,
        page,
        continued: draft.continued || position > 0,
        text: part,
      });
    });
  };

  for (const page of [...pages].sort((a, b) => a.page - b.page)) {
    let draft: Draft | null = carry
      ? { ref: carry.ref, heading: carry.heading, section, lines: [], continued: true }
      : null;

    for (const rawLine of page.text.split("\n")) {
      const line = rawLine.trim();
      if (!line || PAGE_MARKER.test(line) || repeated.has(normalizeLineKey(line))) {
        continue;
      }

      const sectionMatch = SECTION_HEADING.exec(line);
      const numberedMatch = NUMBERED.exec(line);
      const letteredMatch = LETTERED.exec(line);

      if (sectionMatch && (sectionMatch[3].length < 80 || isAllCapsHeading(line))) {
        flush(draft, page.page);
        const title = sectionMatch[3].trim();
        const kind = sectionMatch[1][0].toUpperCase() + sectionMatch[1].slice(1).toLowerCase();
        const ref = `${kind} ${sectionMatch[2]}`;
        section = title ? `${ref}: ${title}` : ref;
        lastNumberedRef = null;
        draft = { ref, heading: title || null, section, lines: [], continued: false };
        continue;
      }

      if (numberedMatch) {
        flush(draft, page.page);
        const ref = numberedMatch[1].replace(/[.)]$/, "");
        const rest = numberedMatch[2].trim();
        lastNumberedRef = ref;
        const shortHeading = rest.length <= 60 && !/[.;,]$/.test(rest);
        draft = {
          ref,
          heading: shortHeading ? rest : null,
          section,
          lines: shortHeading ? [] : [rest],
          continued: false,
        };
        continue;
      }

      if (letteredMatch && draft) {
        flush(draft, page.page);
        const ref = `${lastNumberedRef ?? ""}(${letteredMatch[1].toLowerCase()})`;
        draft = { ref, heading: null, section, lines: [letteredMatch[2].trim()], continued: false };
        continue;
      }

      if (isAllCapsHeading(line)) {
        flush(draft, page.page);
        section = line;
        lastNumberedRef = null;
        draft = { ref: null, heading: line, section, lines: [], continued: false };
        continue;
      }

      if (!draft) {
        draft = { ref: null, heading: null, section, lines: [], continued: false };
      }
      draft.lines.push(line);
    }

    flush(draft, page.page);
    carry = draft ? { ref: draft.ref, heading: draft.heading } : null;
  }

  return clauses.map((clause, index) => ({ ...clause, index }));
}

export function clauseLabel(clause: Pick<Clause, "ref" | "heading" | "page">): string {
  if (clause.ref) {
    return clause.ref;
  }

  return clause.heading ? `"${clause.heading}"` : `page ${clause.page}`;
}
