import type { TranscriptExcerpt, TranscriptUtterance, TranscriptWord } from '@english-quest/shared';

export interface StoredUtterance {
  id: string;
  idx: number;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
  words: TranscriptWord[];
}

export interface TranscriptTrack {
  userId: string;
  /** Second 0 of this participant's `audio.ogg` (F07). */
  recordingStartedAt: Date | null;
  utterances: StoredUtterance[];
}

/**
 * Merges every participant's utterances into one conversation, in
 * milliseconds from the lesson's start. Each file's second 0 is its own
 * participant's first segment, so offsets from two files only become
 * comparable once shifted by the gap between that start and the lesson's.
 *
 * `confidence` and `words` are projected only onto the caller's own
 * utterances: the text is shared, the recognition signal is not. The same
 * goes for `excerpt` (F09): `callerExcerpts` is keyed by utterance id, and
 * only the caller's own utterances ever look it up.
 */
export function mergeTranscript(
  lessonStartedAt: Date | null,
  callerId: string,
  tracks: TranscriptTrack[],
  callerExcerpts: ReadonlyMap<string, TranscriptExcerpt> = new Map(),
): TranscriptUtterance[] {
  const merged = tracks.flatMap((track) => {
    const shiftMs =
      lessonStartedAt && track.recordingStartedAt
        ? Math.max(track.recordingStartedAt.getTime() - lessonStartedAt.getTime(), 0)
        : 0;
    const isMine = track.userId === callerId;

    return track.utterances.map((utterance) => {
      const base = {
        id: utterance.id,
        userId: track.userId,
        startMs: utterance.startMs + shiftMs,
        endMs: utterance.endMs + shiftMs,
        text: utterance.text,
      };
      const excerpt = isMine ? callerExcerpts.get(utterance.id) : undefined;
      const entry: TranscriptUtterance = isMine
        ? {
            ...base,
            confidence: utterance.confidence,
            words: utterance.words.map((word) => ({ ...word, startMs: word.startMs + shiftMs })),
            ...(excerpt ? { excerpt } : {}),
          }
        : base;
      return { entry, idx: utterance.idx };
    });
  });

  merged.sort(
    (a, b) =>
      a.entry.startMs - b.entry.startMs ||
      a.entry.userId.localeCompare(b.entry.userId) ||
      a.idx - b.idx,
  );
  return merged.map(({ entry }) => entry);
}
