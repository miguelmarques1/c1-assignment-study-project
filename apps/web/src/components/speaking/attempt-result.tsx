import type { SpeakingAttemptResult, SpeakingShape } from '@english-quest/shared';

import { Meter, PlayIcon } from '@/components/ui';

import { SpokenWords } from './spoken-words';

interface AttemptResultProps {
  result: SpeakingAttemptResult;
  shape: SpeakingShape;
  onPlayRange: (startMs: number, durationMs: number) => void;
}

/** The scored view of one attempt: coloured words, the five score meters and the phonemes still worth drilling. */
export function AttemptResult({ result, shape, onPlayRange }: AttemptResultProps) {
  const { scores } = result;

  return (
    <div className="flex flex-col gap-lg">
      <div>
        {shape === 'open_response' && result.transcript !== null ? (
          <h3 className="mb-sm text-title-md text-on-surface">Transcript</h3>
        ) : null}
        <SpokenWords words={result.words} onPlayRange={onPlayRange} />
      </div>

      <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
        <Meter label="Pronunciation" value={Math.round(scores.pronunciation)} />
        <Meter label="Accuracy" value={Math.round(scores.accuracy)} />
        <Meter label="Fluency" value={Math.round(scores.fluency)} />
        {scores.prosody === null ? (
          <div className="flex items-center justify-between gap-sm">
            <span className="text-label-md text-on-surface-variant">Prosody</span>
            <span className="text-label-md text-on-surface-variant">Not measured</span>
          </div>
        ) : (
          <Meter label="Prosody" value={Math.round(scores.prosody)} />
        )}
        <Meter label="Completeness" value={Math.round(scores.completeness)} />
      </div>

      {result.failingPhonemes.length > 0 ? (
        <div className="flex flex-col gap-sm">
          <h3 className="text-title-md text-on-surface">Sounds to work on</h3>
          <ul className="flex flex-col gap-xs">
            {result.failingPhonemes.map((phoneme) => {
              const { exampleStartMs, exampleDurationMs } = phoneme;
              return (
                <li key={phoneme.tag} className="flex items-center justify-between gap-sm">
                  <span className="text-body-md text-on-surface">
                    {phoneme.label} — {Math.round(phoneme.meanAccuracy)}, “{phoneme.exampleWord}”
                  </span>
                  {exampleStartMs !== null && exampleDurationMs !== null ? (
                    <button
                      type="button"
                      aria-label={`Play example for ${phoneme.label}`}
                      onClick={() => onPlayRange(exampleStartMs, exampleDurationMs)}
                      className="text-on-surface-variant"
                    >
                      <PlayIcon size={16} />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
