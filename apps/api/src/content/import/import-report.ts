import { formatSize } from './media-probe';

/**
 * `skipped` is rejected before any side effect (bad JSON, schema, answer
 * key, media, slug collision); `failed` was attempted and failed at runtime
 * (storage or database). Both make the run exit non-zero.
 */
export type ItemOutcome =
  | { status: 'imported'; label: string; uploadedBytes: number | null }
  | {
      status: 'updated';
      label: string;
      /** `none` for items without media; `restored` when the stored object had gone missing. */
      media: 'none' | 'unchanged' | 'reuploaded' | 'restored';
      uploadedBytes: number | null;
    }
  | { status: 'skipped'; label: string; reason: string; details: string[] }
  | { status: 'failed'; label: string; reason: string };

export interface ImportCounts {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
}

export const DRY_RUN_BANNER = 'Dry run — nothing was written.';

export function countOutcomes(outcomes: readonly ItemOutcome[]): ImportCounts {
  const counts: ImportCounts = { imported: 0, updated: 0, skipped: 0, failed: 0 };
  for (const outcome of outcomes) {
    counts[outcome.status] += 1;
  }
  return counts;
}

/** One line in the PRD's shape (`✓ bbc-climate-debate (imported, 4.2 MB uploaded)`), plus indented extra issues for a skip. */
export function formatOutcome(outcome: ItemOutcome, dryRun = false): string {
  switch (outcome.status) {
    case 'imported': {
      const verb = dryRun ? 'would import' : 'imported';
      const media =
        outcome.uploadedBytes === null ? '' : `, ${formatSize(outcome.uploadedBytes)} ${dryRun ? 'to upload' : 'uploaded'}`;
      return `✓ ${outcome.label} (${verb}${media})`;
    }
    case 'updated': {
      const verb = dryRun ? 'would update' : 'updated';
      const size = formatSize(outcome.uploadedBytes ?? 0);
      const reupload = dryRun ? `${size} to re-upload` : `${size} re-uploaded`;
      const media = {
        none: '',
        unchanged: ', media unchanged',
        reuploaded: `, ${reupload}`,
        restored: `, ${reupload} — object was missing`,
      }[outcome.media];
      return `↻ ${outcome.label} (${verb}${media})`;
    }
    case 'skipped':
      return [`✗ ${outcome.label} (${outcome.reason})`, ...outcome.details.map((detail) => `    ${detail}`)].join('\n');
    case 'failed':
      return `✗ ${outcome.label} (${outcome.reason})`;
  }
}

export function formatWarning(message: string): string {
  return `! ${message}`;
}

/** Curated items in the bank whose folder is gone. Reported, never deleted: a plan may still use them. */
export function formatOrphans(slugs: readonly string[]): string | null {
  if (slugs.length === 0) {
    return null;
  }
  const subject =
    slugs.length === 1
      ? '1 curated item has no folder on disk and was left untouched'
      : `${slugs.length} curated items have no folder on disk and were left untouched`;
  return formatWarning(`${subject}: ${slugs.join(', ')}`);
}

export function formatSummary(counts: ImportCounts, dryRun = false): string {
  const summary = `${counts.imported} imported, ${counts.updated} updated, ${counts.skipped} skipped, ${counts.failed} failed.`;
  return dryRun ? `${DRY_RUN_BANNER} ${summary}` : summary;
}

export function exitCodeFor(counts: ImportCounts): 0 | 1 {
  return counts.skipped + counts.failed > 0 ? 1 : 0;
}
