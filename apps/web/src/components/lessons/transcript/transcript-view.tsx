'use client';

import type { LessonTranscriptView, TranscriptSpeakerStatus } from '@english-quest/shared';
import { useEffect, useState } from 'react';

import { UtteranceRow } from './utterance-row';

/** Coarse on purpose: another speaker's reason for a missing transcript is theirs (F08). */
const SPEAKER_STATUS: Record<TranscriptSpeakerStatus, string | null> = {
  available: null,
  pending: 'Transcript pending',
  unavailable: 'No transcript',
};

/** The utterance a `#u-{id}` link points at, read from the URL and kept in step with it. */
function useAnchoredUtterance(): string | null {
  const [anchored, setAnchored] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const match = /^#u-(.+)$/.exec(window.location.hash);
      setAnchored(match ? match[1]! : null);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  useEffect(() => {
    if (anchored) {
      document.getElementById(`u-${anchored}`)?.scrollIntoView?.({ block: 'center' });
    }
  }, [anchored]);

  return anchored;
}

/**
 * The shared record of the lesson: every participant's lines merged in
 * order, with a clock in the margin and the speaker's name (`You` for the
 * caller). There is no audio anywhere — the transcript is the record.
 */
export function TranscriptView({ view }: { view: LessonTranscriptView }) {
  const anchored = useAnchoredUtterance();
  const speakerName = new Map(view.speakers.map((speaker) => [speaker.userId, speaker.isMe ? 'You' : speaker.displayName]));
  const me = view.speakers.find((speaker) => speaker.isMe)?.userId ?? null;

  return (
    <div className="flex flex-col gap-md">
      <ul aria-label="Speakers" className="flex flex-wrap gap-sm">
        {view.speakers.map((speaker) => (
          <li
            key={speaker.userId}
            className="inline-flex items-center gap-xs rounded-full border-2 border-outline-strong bg-surface-container px-sm py-xs text-label-md text-on-surface"
          >
            {speaker.isMe ? 'You' : speaker.displayName}
            {SPEAKER_STATUS[speaker.status] ? (
              <span className="text-on-surface-variant">· {SPEAKER_STATUS[speaker.status]}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {view.utterances.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">No transcript is available for this lesson yet.</p>
      ) : (
        <ol aria-label="Transcript" className="flex flex-col gap-xs">
          {view.utterances.map((utterance) => (
            <UtteranceRow
              key={utterance.id}
              utterance={utterance}
              speaker={speakerName.get(utterance.userId) ?? 'Participant'}
              mine={utterance.userId === me}
              highlighted={utterance.id === anchored}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
