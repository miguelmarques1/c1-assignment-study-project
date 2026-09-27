'use client';

import type { PlanActivityView } from '@english-quest/shared';
import Link from 'next/link';
import { useState } from 'react';

import { Chip } from '@/components/ui';
import { activityHref } from '@/lib/activity-routes';

import { ActivityKindIcon } from './activity-kind-icon';
import { ActivityStateBadge } from './activity-state-badge';

/** One activity within a `PlanDay`, with its rationale tucked behind a disclosure. */
export function PlanActivityCard({ activity }: { activity: PlanActivityView }) {
  const [open, setOpen] = useState(false);
  const href = activityHref(activity);
  const detailId = `activity-${activity.id}-why`;

  return (
    <li className="flex flex-col gap-sm rounded-md border-2 border-outline-strong bg-surface-container-lowest p-md">
      <div className="flex flex-wrap items-center gap-sm">
        <ActivityKindIcon kind={activity.kind} />
        {href ? (
          <Link href={href} className="text-label-lg text-primary underline-offset-4 hover:underline">
            {activity.title}
          </Link>
        ) : (
          <span className="text-label-lg text-on-surface">{activity.title}</span>
        )}
        <span className="text-label-sm text-on-surface-variant">{activity.estimatedMinutes} min</span>
        <ActivityStateBadge state={activity.state} />
        {activity.carriedOver ? <Chip tone="accent">Carried over</Chip> : null}
        {activity.isReview ? <Chip tone="accent">Review</Chip> : null}
      </div>
      <div className="flex flex-col gap-xs">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((current) => !current)}
          className="inline-flex w-fit items-center text-label-sm text-on-surface-variant underline-offset-4 hover:underline"
        >
          Why this activity?
        </button>
        {open ? (
          <div id={detailId} className="flex flex-col gap-xs">
            <p className="text-body-sm text-on-surface-variant">{activity.rationale}</p>
            {activity.targetTags.length > 0 ? (
              <div className="flex flex-wrap gap-xs">
                {activity.targetTags.map((tag) => (
                  <Chip key={tag.tag}>{tag.label}</Chip>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
