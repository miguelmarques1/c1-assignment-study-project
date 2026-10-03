import { describe, expect, it } from 'vitest';

import { reconcileDraft } from '@/lib/writing-draft-reconcile';

describe('reconcileDraft', () => {
  it('no_local_copy_uses_the_server', () => {
    expect(reconcileDraft(null, { status: 'draft', text: 'server text', revision: 3 })).toEqual({ kind: 'use_server' });
  });

  it('same_revision_same_text_uses_the_server', () => {
    const server = { status: 'draft' as const, text: 'same text', revision: 3 };
    expect(reconcileDraft({ text: 'same text', baseRevision: 3 }, server)).toEqual({ kind: 'use_server' });
  });

  it('same_revision_different_text_pushes_local_work', () => {
    const server = { status: 'draft' as const, text: 'server text', revision: 3 };
    expect(reconcileDraft({ text: 'local text', baseRevision: 3 }, server)).toEqual({ kind: 'use_local' });
  });

  it('older_revision_same_text_adopts_the_server', () => {
    const server = { status: 'draft' as const, text: 'same text', revision: 5 };
    expect(reconcileDraft({ text: 'same text', baseRevision: 3 }, server)).toEqual({ kind: 'use_server' });
  });

  it('older_revision_different_text_is_a_conflict', () => {
    const server = { status: 'draft' as const, text: 'server text', revision: 5 };
    expect(reconcileDraft({ text: 'local text', baseRevision: 3 }, server)).toEqual({ kind: 'conflict' });
  });

  it('submitted_elsewhere_with_different_local_text_is_surfaced', () => {
    const server = { status: 'corrected' as const, text: 'server text', revision: 9 };
    expect(reconcileDraft({ text: 'local text', baseRevision: 3 }, server)).toEqual({ kind: 'submitted_elsewhere' });

    const correcting = { status: 'correcting' as const, text: 'server text', revision: 9 };
    expect(reconcileDraft({ text: 'local text', baseRevision: 3 }, correcting)).toEqual({ kind: 'submitted_elsewhere' });
  });

  it('submitted_elsewhere_with_equal_text_clears_the_local_copy', () => {
    const server = { status: 'corrected' as const, text: 'same text', revision: 9 };
    expect(reconcileDraft({ text: 'same text', baseRevision: 3 }, server)).toEqual({ kind: 'use_server' });
  });

  it('newer_local_revision_is_rebased_as_local_work', () => {
    const server = { status: 'draft' as const, text: 'server text', revision: 3 };
    expect(reconcileDraft({ text: 'local text', baseRevision: 5 }, server)).toEqual({ kind: 'use_local' });
  });
});
