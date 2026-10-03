import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@/lib/api-client';
import { useWritingDraft } from '@/components/writing/use-writing-draft';

const { saveWritingDraftMock, getWritingMock } = vi.hoisted(() => ({
  saveWritingDraftMock: vi.fn(),
  getWritingMock: vi.fn(),
}));

vi.mock('@/lib/writing', () => ({
  saveWritingDraft: (...args: unknown[]) => saveWritingDraftMock(...args),
  getWriting: (...args: unknown[]) => getWritingMock(...args),
}));

const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';

function baseInitial() {
  return { text: 'Original text', revision: 3, savedAt: '2026-01-01T00:00:00.000Z', status: 'draft' as const };
}

beforeEach(() => {
  vi.useFakeTimers();
  saveWritingDraftMock.mockReset();
  getWritingMock.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useWritingDraft', () => {
  it('saves_locally_every_5_seconds_while_changed', () => {
    const { result } = renderHook(() => useWritingDraft({ activityId: ACTIVITY_ID, taskId: TASK_ID, initial: baseInitial(), onServerSettled: vi.fn() }));

    act(() => {
      result.current.setText('Original text, now edited.');
    });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    const stored = window.localStorage.getItem(`eq.writing.draft.${TASK_ID}`);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).text).toBe('Original text, now edited.');
  });

  it('does_not_write_locally_when_nothing_changed', () => {
    renderHook(() => useWritingDraft({ activityId: ACTIVITY_ID, taskId: TASK_ID, initial: baseInitial(), onServerSettled: vi.fn() }));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(window.localStorage.getItem(`eq.writing.draft.${TASK_ID}`)).toBeNull();
  });

  it('saves_to_the_server_every_30_seconds_while_changed', async () => {
    saveWritingDraftMock.mockResolvedValue({ revision: 4, savedAt: '2026-01-01T00:01:00.000Z', status: 'draft' });
    const { result } = renderHook(() => useWritingDraft({ activityId: ACTIVITY_ID, taskId: TASK_ID, initial: baseInitial(), onServerSettled: vi.fn() }));

    act(() => {
      result.current.setText('Edited for the server save.');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(saveWritingDraftMock).toHaveBeenCalledWith(
      ACTIVITY_ID,
      expect.objectContaining({ text: 'Edited for the server save.', baseRevision: 3 }),
      expect.anything(),
    );
    expect(result.current.revision).toBe(4);
  });

  it('a_conflict_response_enters_the_conflict_state_and_pauses_autosave', async () => {
    saveWritingDraftMock.mockRejectedValue(
      new ApiRequestError(409, {
        error: { code: 'WRIT004', message: 'This draft was updated on another device.', details: { draft: { text: 'Server wins', revision: 9, savedAt: null } } },
      }),
    );
    const { result } = renderHook(() => useWritingDraft({ activityId: ACTIVITY_ID, taskId: TASK_ID, initial: baseInitial(), onServerSettled: vi.fn() }));

    act(() => {
      result.current.setText('My conflicting edit.');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(result.current.conflict).toEqual({ text: 'Server wins', revision: 9, savedAt: null });
    expect(result.current.localVersionText).toBe('My conflicting edit.');

    saveWritingDraftMock.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(saveWritingDraftMock).not.toHaveBeenCalled();
  });

  it('a_failed_server_save_reports_saved_on_this_device', async () => {
    saveWritingDraftMock.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useWritingDraft({ activityId: ACTIVITY_ID, taskId: TASK_ID, initial: baseInitial(), onServerSettled: vi.fn() }));

    act(() => {
      result.current.setText('Edited while offline.');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(result.current.saveState).toBe('local_only');
    const stored = window.localStorage.getItem(`eq.writing.draft.${TASK_ID}`);
    expect(JSON.parse(stored!).text).toBe('Edited while offline.');
  });

  it('works_when_local_storage_throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const { result } = renderHook(() => useWritingDraft({ activityId: ACTIVITY_ID, taskId: TASK_ID, initial: baseInitial(), onServerSettled: vi.fn() }));

    expect(() => {
      act(() => {
        result.current.setText('Still editable despite storage failing.');
      });
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
    }).not.toThrow();
    expect(result.current.text).toBe('Still editable despite storage failing.');
  });

  it('reports_visible_seconds_with_each_save', async () => {
    saveWritingDraftMock.mockResolvedValue({ revision: 4, savedAt: '2026-01-01T00:01:00.000Z', status: 'draft' });
    const { result } = renderHook(() => useWritingDraft({ activityId: ACTIVITY_ID, taskId: TASK_ID, initial: baseInitial(), onServerSettled: vi.fn() }));

    act(() => {
      result.current.setText('Timed edit.');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(saveWritingDraftMock).toHaveBeenCalledWith(
      ACTIVITY_ID,
      expect.objectContaining({ activeSecondsDelta: expect.any(Number) }),
      expect.anything(),
    );
    const [, body] = saveWritingDraftMock.mock.calls[0] as [string, { activeSecondsDelta: number }];
    expect(body.activeSecondsDelta).toBeGreaterThan(0);
  });

  it('reconciles_on_window_focus', async () => {
    getWritingMock.mockResolvedValue({
      status: 'draft',
      draft: { text: 'Newer from another device', revision: 5, savedAt: '2026-01-01T00:02:00.000Z' },
    });
    const { result } = renderHook(() => useWritingDraft({ activityId: ACTIVITY_ID, taskId: TASK_ID, initial: baseInitial(), onServerSettled: vi.fn() }));

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(getWritingMock).toHaveBeenCalledWith(ACTIVITY_ID);
    expect(result.current.text).toBe('Newer from another device');
    expect(result.current.revision).toBe(5);
  });
});
