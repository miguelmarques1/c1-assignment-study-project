import type { SpeakingTaskView } from '@english-quest/shared';

import { Card, Chip } from '@/components/ui';

function FocusTags({ label, task }: { label: string; task: SpeakingTaskView }) {
  if (task.focusTags.length === 0) {
    return null;
  }
  return (
    <div className="mt-md flex flex-wrap items-center gap-xs">
      <span className="text-label-md text-on-surface-variant">{label}</span>
      {task.focusTags.map((tag) => (
        <Chip key={tag.tag} tone="accent">
          {tag.label}
        </Chip>
      ))}
    </div>
  );
}

/** The passage or the prompt — the thing the user reads before recording. */
export function TaskCard({ task }: { task: SpeakingTaskView }) {
  if (task.shape === 'read_aloud') {
    return (
      <Card>
        <p className="text-headline-sm text-on-surface">{task.referenceText}</p>
        <FocusTags label="Sounds to watch:" task={task} />
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-headline-sm text-on-surface">{task.prompt}</p>
      {task.hint ? <p className="mt-sm text-body-md text-on-surface-variant">{task.hint}</p> : null}
      <FocusTags label="Try to work in:" task={task} />
      <p className="mt-sm text-label-md text-on-surface-variant">Aim for 30–90 seconds.</p>
    </Card>
  );
}
