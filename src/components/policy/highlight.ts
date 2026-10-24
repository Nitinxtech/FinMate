// Client-safe, pure helpers for the policy viewer.

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type Segment = { text: string; highlight: boolean };

// Finds the quoted words in the page, tolerating different whitespace and line breaks.
export function splitForHighlight(pageText: string, quote: string | null | undefined): Segment[] {
  const needle = (quote ?? "").replace(/\s+/g, " ").trim();
  if (needle.length < 8) {
    return [{ text: pageText, highlight: false }];
  }

  const pattern = needle.split(" ").map(escapeRegExp).join("\\s+");
  const match = new RegExp(pattern, "i").exec(pageText);
  if (!match) {
    return [{ text: pageText, highlight: false }];
  }

  const start = match.index;
  const end = start + match[0].length;
  return [
    { text: pageText.slice(0, start), highlight: false },
    { text: pageText.slice(start, end), highlight: true },
    { text: pageText.slice(end), highlight: false },
  ].filter((segment) => segment.text.length > 0);
}
