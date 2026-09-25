/**
 * Pure transcript rendering and budgeting for the lesson-analysis prompt
 * (F11). No I/O: every input is already the merged, chronological transcript
 * the caller assembled (F08's `mergeTranscript`).
 */

/** One utterance on the lesson clock, before it is labelled or rendered. */
export interface AnalysisTranscriptTurn {
  userId: string;
  startMs: number;
  text: string;
}

export interface RenderedTranscriptLine {
  isOwn: boolean;
  startMs: number;
  /** The full line as it appears in the prompt: `[mm:ss] LABEL: text`. */
  text: string;
}

/** `95:12`, not `1:35:12` — a lesson can run past an hour and the prompt only needs a monotonic clock, not a duration display. */
function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Labels every turn `YOU` (the analysed participant) or `OTHER 1`, `OTHER 2`,
 * … (everyone else, numbered by the order their first turn appears in this
 * already-chronological list) — never a display name, user id or role
 * label, so nothing about another participant's identity reaches the
 * owner's key.
 */
export function renderTranscriptLines(turns: readonly AnalysisTranscriptTurn[], ownerId: string): RenderedTranscriptLine[] {
  const otherNumberByUserId = new Map<string, number>();
  let nextOtherNumber = 1;

  return turns.map((turn) => {
    const isOwn = turn.userId === ownerId;
    let label: string;
    if (isOwn) {
      label = 'YOU';
    } else {
      let number = otherNumberByUserId.get(turn.userId);
      if (number === undefined) {
        number = nextOtherNumber;
        nextOtherNumber += 1;
        otherNumberByUserId.set(turn.userId, number);
      }
      label = `OTHER ${number}`;
    }
    return { isOwn, startMs: turn.startMs, text: `[${formatTimestamp(turn.startMs)}] ${label}: ${turn.text}` };
  });
}

export interface TranscriptBudgetResult {
  /** The kept lines, joined with newlines — ready for the `transcript` variable. */
  transcript: string;
  truncated: boolean;
  /** Every other-participant turn strictly before this timestamp was dropped; null if none were. */
  othersOmittedBeforeMs: number | null;
  /** Every own turn strictly before this timestamp was dropped; null if none were. */
  ownOmittedBeforeMs: number | null;
  droppedOthers: number;
  droppedOwn: number;
  /** The kept transcript's own estimate, for calibration against Gemini's reported input tokens. */
  estimatedTokens: number;
  /** '' when nothing was truncated; otherwise the sentence for `truncation_note`. */
  truncationNote: string;
}

interface Line extends RenderedTranscriptLine {
  tokens: number;
}

function estimateTokens(text: string, charsPerToken: number): number {
  return Math.ceil(text.length / charsPerToken);
}

function buildNote(othersOmittedBeforeMs: number | null, ownOmittedBeforeMs: number | null): string {
  if (othersOmittedBeforeMs === null && ownOmittedBeforeMs === null) {
    return '';
  }
  const parts: string[] = [];
  if (othersOmittedBeforeMs !== null) {
    parts.push(`the other participants' turns before ${formatTimestamp(othersOmittedBeforeMs)}`);
  }
  if (ownOmittedBeforeMs !== null) {
    parts.push(`YOU's own turns before ${formatTimestamp(ownOmittedBeforeMs)}`);
  }
  return (
    `Note: this transcript was too long, so ${parts.join(' and ')} were left out of the analysis. ` +
    'Treat this as missing text that was never said, not as a conversational gap.'
  );
}

/**
 * Fits the rendered lines under `budgetTokens`, dropping the other
 * participants' oldest turns first and only then the owner's own oldest
 * turns — the PRD's rule, preserving the participant being assessed ahead of
 * everyone else's context. Lines must already be chronological (F08's
 * merge order); the drop is always a prefix of each group's own turns.
 */
export function fitToBudget(
  lines: readonly RenderedTranscriptLine[],
  budgetTokens: number,
  charsPerToken: number,
): TranscriptBudgetResult {
  let kept: Line[] = lines.map((line) => ({ ...line, tokens: estimateTokens(line.text, charsPerToken) }));
  let total = kept.reduce((sum, line) => sum + line.tokens, 0);

  if (total <= budgetTokens) {
    return {
      transcript: kept.map((line) => line.text).join('\n'),
      truncated: false,
      othersOmittedBeforeMs: null,
      ownOmittedBeforeMs: null,
      droppedOthers: 0,
      droppedOwn: 0,
      estimatedTokens: total,
      truncationNote: '',
    };
  }

  let droppedOthers = 0;
  let lastDroppedOtherMs: number | null = null;
  let i = 0;
  while (total > budgetTokens && i < kept.length) {
    const line = kept[i]!;
    if (line.isOwn) {
      i += 1;
      continue;
    }
    total -= line.tokens;
    lastDroppedOtherMs = line.startMs;
    droppedOthers += 1;
    kept = [...kept.slice(0, i), ...kept.slice(i + 1)];
  }

  let droppedOwn = 0;
  let lastDroppedOwnMs: number | null = null;
  if (total > budgetTokens) {
    // Every other-participant turn is gone at this point (the loop above only
    // stops early once the budget is met), so what remains is the owner's own
    // turns, still chronological — the next prefix to drop.
    while (total > budgetTokens && kept.length > 0) {
      const line = kept[0]!;
      total -= line.tokens;
      lastDroppedOwnMs = line.startMs;
      droppedOwn += 1;
      kept = kept.slice(1);
    }
  }

  const survivingOther = kept.find((line) => !line.isOwn);
  const othersOmittedBeforeMs =
    droppedOthers > 0 ? (survivingOther ? survivingOther.startMs : lastDroppedOtherMs! + 1) : null;
  const survivingOwn = kept.find((line) => line.isOwn);
  const ownOmittedBeforeMs = droppedOwn > 0 ? (survivingOwn ? survivingOwn.startMs : lastDroppedOwnMs! + 1) : null;

  return {
    transcript: kept.map((line) => line.text).join('\n'),
    truncated: droppedOthers > 0 || droppedOwn > 0,
    othersOmittedBeforeMs,
    ownOmittedBeforeMs,
    droppedOthers,
    droppedOwn,
    estimatedTokens: total,
    truncationNote: buildNote(othersOmittedBeforeMs, ownOmittedBeforeMs),
  };
}
