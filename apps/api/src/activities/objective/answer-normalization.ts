/**
 * Fill-in-the-blank matching (A11): Unicode NFC, typographic quotes mapped to
 * ASCII, surrounding whitespace trimmed, inner whitespace runs collapsed, and
 * a locale-independent lower case. Phone keyboards insert curly apostrophes
 * by default, so "hadn’t" must match "hadn't".
 */
export function normalizeAnswer(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function matchesAccepted(text: string, accepted: readonly string[]): boolean {
  const normalized = normalizeAnswer(text);
  return normalized !== '' && accepted.some((variant) => normalizeAnswer(variant) === normalized);
}
