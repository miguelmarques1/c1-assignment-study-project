import type { WritingErrorGroupView } from '@english-quest/shared';

import { ordinalTimes } from '../../analysis/recurrence-label';

export interface GroupableError {
  index: number;
  tag: string;
}

/**
 * Groups accepted errors by tag, with a recurrence badge from the ledger's
 * prior occurrence count snapshotted before ingestion (A18): `{ count: prior
 * + group size, label }` when `prior >= 1`, and no badge for a first
 * sighting. Groups are ordered by size (largest first), then by the
 * position of their first error.
 */
export function groupErrors(
  errors: readonly GroupableError[],
  priorCounts: Readonly<Record<string, number>>,
  labelOf: (tag: string) => string,
): WritingErrorGroupView[] {
  const order: string[] = [];
  const byTag = new Map<string, number[]>();
  for (const error of errors) {
    let indexes = byTag.get(error.tag);
    if (!indexes) {
      indexes = [];
      byTag.set(error.tag, indexes);
      order.push(error.tag);
    }
    indexes.push(error.index);
  }

  return order
    .map((tag) => {
      const errorIndexes = byTag.get(tag)!;
      const prior = priorCounts[tag] ?? 0;
      const count = prior + errorIndexes.length;
      return {
        tag,
        tagLabel: labelOf(tag),
        errorIndexes,
        recurrence: prior >= 1 ? { count, label: ordinalTimes(count) } : null,
      };
    })
    .sort((a, b) => b.errorIndexes.length - a.errorIndexes.length || a.errorIndexes[0]! - b.errorIndexes[0]!);
}
