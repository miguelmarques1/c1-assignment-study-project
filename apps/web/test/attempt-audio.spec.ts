import { act, renderHook } from '@testing-library/react';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAttemptAudio } from '@/components/speaking/use-attempt-audio';

const { fetchAttemptAudioMock } = vi.hoisted(() => ({
  fetchAttemptAudioMock: vi.fn(async () => new ArrayBuffer(8)),
}));

vi.mock('@/lib/speaking', () => ({
  fetchAttemptAudio: fetchAttemptAudioMock,
}));

class FakeAudioBufferSourceNode {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  decodeAudioData = vi.fn(async () => ({ duration: 2 }) as unknown as AudioBuffer);
  createBufferSource = vi.fn(() => new FakeAudioBufferSourceNode());
  destination = {};
}

beforeEach(() => {
  fetchAttemptAudioMock.mockClear();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('Blob', NodeBlob);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAttemptAudio', () => {
  it('fetches_and_plays_an_attempt_once_then_reuses_the_cached_buffer', async () => {
    const { result } = renderHook(() => useAttemptAudio());

    await act(async () => {
      await result.current.play('attempt-1');
    });
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.playingAttemptId).toBe('attempt-1');
    expect(fetchAttemptAudioMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.play('attempt-1');
    });
    expect(fetchAttemptAudioMock).toHaveBeenCalledTimes(1);
  });

  it('pads_a_word_range_by_100ms_on_both_sides', async () => {
    const { result } = renderHook(() => useAttemptAudio());
    let lastSource: FakeAudioBufferSourceNode | undefined;
    const context = new FakeAudioContext();
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => {
        lastSource = undefined;
        return context;
      }),
    );
    context.createBufferSource = vi.fn(() => {
      lastSource = new FakeAudioBufferSourceNode();
      return lastSource;
    });

    await act(async () => {
      await result.current.playRange('attempt-1', 500, 300);
    });

    expect(lastSource?.start).toHaveBeenCalledWith(0, 0.4, 0.5);
  });

  it('stops_a_previous_source_before_playing_a_local_blob', async () => {
    const { result } = renderHook(() => useAttemptAudio());

    await act(async () => {
      await result.current.play('attempt-1');
    });

    await act(async () => {
      await result.current.playLocal(new Blob(['x']));
    });

    expect(result.current.isPlaying).toBe(true);
    expect(result.current.playingAttemptId).toBeNull();
  });

  it('stop_clears_the_playing_state', async () => {
    const { result } = renderHook(() => useAttemptAudio());

    await act(async () => {
      await result.current.play('attempt-1');
    });

    act(() => {
      result.current.stop();
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.playingAttemptId).toBeNull();
  });
});
