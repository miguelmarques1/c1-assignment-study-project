import type {
  LessonAnalysisView,
  LessonDetailView,
  LessonPipelineView,
  LessonPronunciationView,
} from '@english-quest/shared';

import type { ServerRead } from '@/lib/lessons-server';

import { AreaError } from '../area-error';
import { ErrorGroups } from './error-groups';
import { PronunciationSection } from './pronunciation-section';
import { ResultStatusPanel } from './result-status-panel';
import { ScenarioFit } from './scenario-fit';
import { ScoreMeters } from './score-meters';
import { NotesAndStrengths, RecurringAndTopics } from './strengths-topics';

export interface ResultAreaProps {
  lesson: LessonDetailView;
  analysis: ServerRead<LessonAnalysisView>;
  pronunciation: ServerRead<LessonPronunciationView>;
  pipeline: ServerRead<LessonPipelineView>;
}

/**
 * The detail's default area, composed from F10's and F11's own routes.
 * Pronunciation renders whether or not the analysis is ready: a missing
 * Gemini key blocks only the analysis (F11), never the rest.
 */
export function ResultArea({ lesson, analysis, pronunciation, pipeline }: ResultAreaProps) {
  const pronunciationView = pronunciation.ok ? pronunciation.data : null;
  const ready = analysis.ok && analysis.data.status === 'ready' ? analysis.data.analysis : null;

  return (
    <div className="flex flex-col gap-xl">
      {!analysis.ok ? (
        <AreaError title="We could not load your result." />
      ) : ready ? (
        <>
          <ScoreMeters competencies={ready.competencies} pronunciation={pronunciationView} />
          <NotesAndStrengths analysis={ready} />
          <ErrorGroups errors={ready.errors} lessonId={lesson.lessonId} />
          <ScenarioFit fit={ready.scenarioFit} context={ready.scenarioContext} />
          <RecurringAndTopics analysis={ready} />
        </>
      ) : (
        <ResultStatusPanel
          lesson={lesson}
          analysisStatus={analysis.data.status}
          pipeline={pipeline.ok ? pipeline.data : null}
        />
      )}
      {pronunciationView ? (
        <PronunciationSection view={pronunciationView} lessonId={lesson.lessonId} />
      ) : (
        <AreaError title="We could not load your pronunciation result." />
      )}
    </div>
  );
}
