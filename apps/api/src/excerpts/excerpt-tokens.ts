const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * One recognized token as the selection rules compare it: lowercase,
 * straight apostrophes, and no punctuation at either end, so that F08's
 * display text (`afternoon.`, `Yeah,`) matches the filler lexicon. Internal
 * apostrophes and hyphens stay (`i'd`, `uh-huh`). May return an empty
 * string for a token that was only punctuation.
 */
export function normalizeToken(raw: string): string {
  return raw.normalize('NFKC').replace(/[‘’]/g, "'").toLowerCase().replace(EDGE_PUNCTUATION, '');
}

/**
 * An utterance's normalized tokens: from the provider's own word list, so
 * word count agrees with the timings F10 aligns against, or from the text
 * when the list is empty. Punctuation-only tokens are dropped.
 */
export function tokenize(words: readonly { text: string }[], text: string): string[] {
  const raw = words.length > 0 ? words.flatMap((word) => word.text.split(/\s+/)) : text.split(/\s+/);
  return raw.map(normalizeToken).filter((token) => token.length > 0);
}
