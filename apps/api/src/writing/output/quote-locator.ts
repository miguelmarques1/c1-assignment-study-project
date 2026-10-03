import { normalizeForMatch } from '../../analysis/analysis-output';

export interface QuoteSpan {
  start: number;
  end: number;
}

interface WordToken {
  text: string;
  start: number;
  end: number;
}

/** A word per A19 (letters/digits with one internal apostrophe or hyphen), with its offsets in the original text. */
const WORD_TOKEN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

function tokenize(text: string): WordToken[] {
  return [...text.matchAll(WORD_TOKEN)].map((match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function exactOccurrences(text: string, quote: string): QuoteSpan[] {
  if (quote.length === 0) {
    return [];
  }
  const spans: QuoteSpan[] = [];
  let from = 0;
  for (;;) {
    const index = text.indexOf(quote, from);
    if (index === -1) {
      break;
    }
    spans.push({ start: index, end: index + quote.length });
    from = index + 1;
  }
  return spans;
}

/** Every contiguous run of the text's own words whose normalized forms equal the quote's, ignoring case, curly apostrophes and spacing. */
function tokenOccurrences(text: string, quote: string): QuoteSpan[] {
  const quoteWords = tokenize(quote).map((token) => normalizeForMatch(token.text));
  if (quoteWords.length === 0) {
    return [];
  }
  const textWords = tokenize(text);
  const spans: QuoteSpan[] = [];
  for (let i = 0; i + quoteWords.length <= textWords.length; i++) {
    let matches = true;
    for (let j = 0; j < quoteWords.length; j++) {
      if (normalizeForMatch(textWords[i + j]!.text) !== quoteWords[j]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      spans.push({ start: textWords[i]!.start, end: textWords[i + quoteWords.length - 1]!.end });
    }
  }
  return spans;
}

/**
 * Locates a model-returned `quote` in the submitted `text` (A17): an exact
 * substring match first, then a word-token match that ignores case, curly
 * apostrophes and spacing. `claimed` holds the start offsets already used
 * by earlier accepted errors, so a repeated quote's second occurrence finds
 * a different span rather than the same one twice. Returns the text's own
 * span — never the model's spelling — or null when nothing unclaimed
 * matches (an ellipsis quote or a paraphrase never does).
 */
export function locateQuote(text: string, quote: string, claimed: ReadonlySet<number>): QuoteSpan | null {
  const exact = exactOccurrences(text, quote).find((span) => !claimed.has(span.start));
  if (exact) {
    return exact;
  }
  return tokenOccurrences(text, quote).find((span) => !claimed.has(span.start)) ?? null;
}
