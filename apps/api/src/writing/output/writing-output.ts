import { locateQuote } from './quote-locator';
import { WRITING_MAX_ERRORS } from '../writing.constants';

/** The quote/correction column bound (F12's contract, spec §6). */
const MAX_FIELD_CHARS = 500;

export interface RawCorrectionError {
  quote: string;
  tag: string;
  correction: string;
  explanation: string;
}

export interface AcceptedCorrectionError {
  idx: number;
  quote: string;
  tag: string;
  correction: string;
  explanation: string;
  startOffset: number;
  endOffset: number;
}

export interface ProcessCorrectionOutputInput {
  raw: { errors: readonly RawCorrectionError[] };
  submittedText: string;
  maxErrors?: number;
}

export interface ProcessCorrectionOutputResult {
  errors: AcceptedCorrectionError[];
  discardedErrorCount: number;
}

/**
 * Applies every code-enforced output rule to the model's raw errors (A17):
 * caps the list before anything else is considered, discards an overlong
 * quote or correction, locates each remaining quote verbatim in the
 * submitted text (discarding — and counting — one that cannot be found),
 * and orders the survivors by position. A quote's own text is the
 * submission's own span, never the model's spelling. Two occurrences of the
 * identical mistake are two distinct errors; a candidate that can only
 * match an occurrence an earlier candidate already claimed is itself
 * discarded as a duplicate. Pure — no I/O, no randomness.
 */
export function processCorrectionOutput(input: ProcessCorrectionOutputInput): ProcessCorrectionOutputResult {
  const cap = input.maxErrors ?? WRITING_MAX_ERRORS;
  const candidates = input.raw.errors.slice(0, cap);

  const claimed = new Set<number>();
  const accepted: AcceptedCorrectionError[] = [];
  let discardedErrorCount = 0;

  for (const candidate of candidates) {
    if (candidate.quote.length > MAX_FIELD_CHARS || candidate.correction.length > MAX_FIELD_CHARS) {
      discardedErrorCount += 1;
      continue;
    }
    const span = locateQuote(input.submittedText, candidate.quote, claimed);
    if (!span) {
      discardedErrorCount += 1;
      continue;
    }
    claimed.add(span.start);
    accepted.push({
      idx: 0, // reassigned below, after ordering by position
      quote: input.submittedText.slice(span.start, span.end),
      tag: candidate.tag,
      correction: candidate.correction,
      explanation: candidate.explanation,
      startOffset: span.start,
      endOffset: span.end,
    });
  }

  accepted.sort((a, b) => a.startOffset - b.startOffset);
  accepted.forEach((error, index) => {
    error.idx = index;
  });

  return { errors: accepted, discardedErrorCount };
}
