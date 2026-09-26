import { describe, expect, it } from 'vitest';

import {
  countOutcomes,
  DRY_RUN_BANNER,
  exitCodeFor,
  formatOrphans,
  formatOutcome,
  formatSummary,
  type ItemOutcome,
} from '../../src/content/import/import-report';

describe('content import report', () => {
  it('formats_each_outcome_line_in_the_prd_shape', () => {
    expect(formatOutcome({ status: 'imported', label: 'bbc-climate-debate', uploadedBytes: 4_200_000 })).toBe(
      '✓ bbc-climate-debate (imported, 4.2 MB uploaded)',
    );
    expect(formatOutcome({ status: 'imported', label: 'tech-ethics-op-ed', uploadedBytes: null })).toBe(
      '✓ tech-ethics-op-ed (imported)',
    );
    expect(formatOutcome({ status: 'updated', label: 'ted-urban-design', media: 'unchanged', uploadedBytes: null })).toBe(
      '↻ ted-urban-design (updated, media unchanged)',
    );
    expect(formatOutcome({ status: 'updated', label: 'ted-urban-design', media: 'reuploaded', uploadedBytes: 4_100_000 })).toBe(
      '↻ ted-urban-design (updated, 4.1 MB re-uploaded)',
    );
    expect(formatOutcome({ status: 'updated', label: 'ted-urban-design', media: 'restored', uploadedBytes: 4_100_000 })).toBe(
      '↻ ted-urban-design (updated, 4.1 MB re-uploaded — object was missing)',
    );
    expect(formatOutcome({ status: 'updated', label: 'tech-ethics-op-ed', media: 'none', uploadedBytes: null })).toBe(
      '↻ tech-ethics-op-ed (updated)',
    );
    expect(
      formatOutcome({
        status: 'skipped',
        label: 'npr-housing',
        reason: 'meta.json: /questions/2/answer must be one of /questions/2/options',
        details: ['/difficulty must be between 1 and 5'],
      }),
    ).toBe(
      '✗ npr-housing (meta.json: /questions/2/answer must be one of /questions/2/options)\n    /difficulty must be between 1 and 5',
    );
    expect(formatOutcome({ status: 'failed', label: 'npr-housing', reason: 'upload failed: connect ECONNREFUSED minio:9000' })).toBe(
      '✗ npr-housing (upload failed: connect ECONNREFUSED minio:9000)',
    );
    expect(formatOutcome({ status: 'imported', label: 'tiny', uploadedBytes: 48_044 })).toBe('✓ tiny (imported, 48.0 KB uploaded)');
  });

  it('summary_prints_all_four_counts', () => {
    const outcomes: ItemOutcome[] = [
      { status: 'imported', label: 'a', uploadedBytes: null },
      { status: 'imported', label: 'b', uploadedBytes: null },
      { status: 'imported', label: 'c', uploadedBytes: null },
      { status: 'updated', label: 'd', media: 'none', uploadedBytes: null },
      { status: 'skipped', label: 'e', reason: 'x', details: [] },
    ];
    expect(formatSummary(countOutcomes(outcomes))).toBe('3 imported, 1 updated, 1 skipped, 0 failed.');
    expect(formatSummary(countOutcomes([]))).toBe('0 imported, 0 updated, 0 skipped, 0 failed.');
  });

  it('exit_code_is_nonzero_when_anything_is_skipped_or_failed', () => {
    expect(exitCodeFor({ imported: 3, updated: 2, skipped: 0, failed: 0 })).toBe(0);
    expect(exitCodeFor({ imported: 3, updated: 2, skipped: 1, failed: 0 })).toBe(1);
    expect(exitCodeFor({ imported: 3, updated: 2, skipped: 0, failed: 1 })).toBe(1);
    expect(exitCodeFor({ imported: 0, updated: 0, skipped: 0, failed: 0 })).toBe(0);
  });

  it('dry_run_labels_output_as_not_written', () => {
    expect(formatOutcome({ status: 'imported', label: 'a', uploadedBytes: 4_200_000 }, true)).toBe(
      '✓ a (would import, 4.2 MB to upload)',
    );
    expect(formatOutcome({ status: 'updated', label: 'b', media: 'unchanged', uploadedBytes: null }, true)).toBe(
      '↻ b (would update, media unchanged)',
    );
    expect(formatSummary({ imported: 1, updated: 1, skipped: 0, failed: 0 }, true)).toBe(
      `${DRY_RUN_BANNER} 1 imported, 1 updated, 0 skipped, 0 failed.`,
    );
    expect(DRY_RUN_BANNER).toBe('Dry run — nothing was written.');
  });

  it('lists_curated_items_whose_folder_is_gone', () => {
    expect(formatOrphans([])).toBeNull();
    expect(formatOrphans(['old-interview'])).toBe(
      '! 1 curated item has no folder on disk and was left untouched: old-interview',
    );
    expect(formatOrphans(['old-interview', 'radio-4-farming'])).toBe(
      '! 2 curated items have no folder on disk and were left untouched: old-interview, radio-4-farming',
    );
  });
});
