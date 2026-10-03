'use client';

import type { WritingTaskView } from '@english-quest/shared';
import { useId, useState } from 'react';

import { Card, Chip } from '@/components/ui';

export interface WritingTaskCardProps {
  task: WritingTaskView;
  /** Expanded when the draft is empty, collapsed when resuming a draft that already has text (A28). */
  defaultExpanded: boolean;
}

export function WritingTaskCard({ task, defaultExpanded }: WritingTaskCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = useId();

  return (
    <Card
      header={
        <div className="flex items-center justify-between gap-sm">
          <h2 className="text-title-md text-on-surface">{task.heading}</h2>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((value) => !value)}
            className="press-button shrink-0 text-label-md text-primary underline"
          >
            {expanded ? 'Hide task' : 'Show task'}
            <span aria-hidden="true"> {expanded ? '▲' : '▼'}</span>
          </button>
        </div>
      }
    >
      {expanded ? (
        <div id={contentId} className="flex flex-col gap-sm">
          <p className="whitespace-pre-line text-body-md text-on-surface">{task.statement}</p>
          {task.targetTags.length > 0 ? (
            <div className="flex flex-wrap gap-xs">
              {task.targetTags.map((tag) => (
                <Chip key={tag.tag} tone="accent">
                  {tag.label}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
