import type { LessonPronunciationView, PronunciationScores } from '@english-quest/shared';
import Link from 'next/link';

import { Badge, Meter } from '@/components/ui';

import { excerptScoreText } from '../format';
import { transcriptHref } from '../links';
import { PRONUNCIATION_ABSENT } from './score-meters';

const DIMENSIONS: Array<{ key: Exclude<keyof PronunciationScores, 'pronunciation'>; label: string }> = [
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'fluency', label: 'Fluency' },
  { key: 'prosody', label: 'Prosody' },
  { key: 'completeness', label: 'Completeness' },
];

/**
 * F10's section: the five meters, its notes, the worst phonemes and words
 * (each word linked to the line it came from), and every assessed excerpt
 * with the same score its transcript badge carries (F19, A18).
 */
export function PronunciationSection({ view, lessonId }: { view: LessonPronunciationView; lessonId: string }) {
  const result = view.status === 'assessed' ? view.result : null;

  return (
    <section aria-labelledby="pronunciation-heading" className="flex flex-col gap-md">
      <h2 id="pronunciation-heading" className="text-headline-sm text-on-surface">
        Pronunciation
      </h2>

      {result ? (
        <>
          <div className="grid grid-cols-1 gap-md md:grid-cols-2">
            <Meter label="Pronunciation" value={result.overall.score} delta={result.overall.delta} />
            {DIMENSIONS.map(({ key, label }) => {
              const value = result.scores[key];
              return value === null ? (
                <div key={key} className="flex items-center justify-between gap-sm">
                  <span className="text-label-md text-on-surface-variant">{label}</span>
                  <span className="text-label-md text-on-surface-variant">Not measured</span>
                </div>
              ) : (
                <Meter key={key} label={label} value={Math.round(value)} />
              );
            })}
          </div>
          {result.notes.length > 0 ? (
            <ul aria-label="Pronunciation notes" className="flex flex-col gap-xs">
              {result.notes.map((note) => (
                <li key={note} className="text-body-sm text-on-surface-variant">
                  {note}
                </li>
              ))}
            </ul>
          ) : null}
          {result.worstPhonemes.length > 0 ? (
            <div className="flex flex-col gap-xs">
              <h3 className="text-title-md text-on-surface">Sounds to work on</h3>
              <ul className="flex flex-col gap-xs">
                {result.worstPhonemes.map((phoneme) => (
                  <li key={phoneme.phoneme} className="text-body-md text-on-surface">
                    <strong>{phoneme.phoneme}</strong> — {Math.round(phoneme.meanAccuracy)}, as in “{phoneme.exampleWord}”
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.worstWords.length > 0 ? (
            <div className="flex flex-col gap-xs">
              <h3 className="text-title-md text-on-surface">Words to work on</h3>
              <ul className="flex flex-wrap gap-sm">
                {result.worstWords.map((word) => (
                  <li key={word.word}>
                    <Link
                      href={transcriptHref(lessonId, word.exampleUtteranceId)}
                      className="inline-flex items-center gap-xs rounded-full border-2 border-outline-strong bg-surface-container px-sm py-xs text-label-md text-on-surface"
                    >
                      {word.word} <span className="text-on-surface-variant">{Math.round(word.meanAccuracy)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-body-md text-on-surface-variant">
          {view.status === 'assessed' ? PRONUNCIATION_ABSENT.unavailable : PRONUNCIATION_ABSENT[view.status]}
        </p>
      )}

      {view.excerpts.length > 0 ? (
        <div className="flex flex-col gap-xs">
          <h3 className="text-title-md text-on-surface">Assessed excerpts</h3>
          <ul aria-label="Assessed excerpts" className="flex flex-col gap-xs">
            {view.excerpts.map((excerpt) => (
              <li key={excerpt.excerptId} className="flex flex-wrap items-center gap-sm">
                <Badge status={excerpt.pronunciation.status === 'assessed' ? 'info' : 'neutral'}>
                  {excerptScoreText(excerpt.pronunciation)}
                </Badge>
                <Link
                  href={transcriptHref(lessonId, excerpt.utteranceId)}
                  className="text-body-md text-on-surface underline-offset-4 hover:underline"
                >
                  “{excerpt.referenceText}”
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
