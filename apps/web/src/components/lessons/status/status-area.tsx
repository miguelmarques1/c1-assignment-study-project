import type { LessonDetailView, LessonPipelineView, LessonRecordingView } from '@english-quest/shared';

import type { ServerRead } from '@/lib/lessons-server';

import { AreaError } from '../area-error';
import { OtherStepper } from './other-stepper';
import { OwnStepper } from './own-stepper';

/** The Status area: the caller's full stepper, then one coarse stepper per other participant. */
export function StatusArea({
  lesson,
  pipeline,
  recording,
}: {
  lesson: LessonDetailView;
  pipeline: ServerRead<LessonPipelineView>;
  recording: ServerRead<LessonRecordingView>;
}) {
  return (
    <div className="flex flex-col gap-xl">
      <section aria-labelledby="own-status-heading" className="flex flex-col gap-sm">
        <h2 id="own-status-heading" className="text-headline-sm text-on-surface">
          Your processing
        </h2>
        {pipeline.ok ? (
          <OwnStepper
            lessonId={lesson.lessonId}
            scenario={lesson.scenario}
            pipeline={pipeline.data}
            recording={recording.ok ? recording.data : null}
            statusReason={lesson.statusReason}
          />
        ) : (
          <AreaError title="We could not load your processing status." />
        )}
      </section>
      {lesson.others.length > 0 ? (
        <section aria-labelledby="others-status-heading" className="flex flex-col gap-md">
          <h2 id="others-status-heading" className="text-headline-sm text-on-surface">
            Other participants
          </h2>
          {lesson.others.map((other) => (
            <OtherStepper key={other.userId} other={other} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
