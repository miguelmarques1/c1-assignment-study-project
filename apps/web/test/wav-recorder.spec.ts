import { act, renderHook, waitFor } from '@testing-library/react';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWavRecorder } from '@/components/speaking/use-wav-recorder';

const { encodeWavMock, resampleTo16kMonoMock } = vi.hoisted(() => ({
  encodeWavMock: vi.fn(() => new Uint8Array([1, 2, 3])),
  resampleTo16kMonoMock: vi.fn(async () => new Float32Array([0])),
}));

vi.mock('@/lib/wav-encoder', () => ({
  encodeWav: encodeWavMock,
  resampleTo16kMono: resampleTo16kMonoMock,
}));

vi.mock('@/components/classroom/use-audio-level', () => ({
  useAudioLevel: () => null,
}));

class FakeMediaStreamTrack {
  stop = vi.fn();
}

class FakeMediaStream {
  private tracks: FakeMediaStreamTrack[];
  constructor(tracks: FakeMediaStreamTrack[] = [new FakeMediaStreamTrack()]) {
    this.tracks = tracks;
  }
  getTracks(): FakeMediaStreamTrack[] {
    return this.tracks;
  }
  getAudioTracks(): FakeMediaStreamTrack[] {
    return this.tracks;
  }
}

class FakeMediaRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: FakeMediaStream) {}
  start(): void {
    this.state = 'recording';
  }
  stop(): void {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['x']) });
    this.onstop?.();
  }
}

class FakeAudioContext {
  decodeAudioData = vi.fn(async () => ({}) as AudioBuffer);
  close = vi.fn(async () => undefined);
}

const getUserMediaMock = vi.fn();

beforeEach(() => {
  getUserMediaMock.mockReset();
  encodeWavMock.mockClear();
  resampleTo16kMonoMock.mockClear();
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  // jsdom's own `Blob` has no `arrayBuffer()` — swap in Node's, which does.
  vi.stubGlobal('Blob', NodeBlob);
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: getUserMediaMock },
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useWavRecorder', () => {
  it('requests_the_microphone_and_starts_recording', async () => {
    getUserMediaMock.mockResolvedValue(new FakeMediaStream());
    const { result } = renderHook(() => useWavRecorder(120));

    await act(async () => {
      await result.current.start();
    });

    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true });
    expect(result.current.status).toBe('recording');
  });

  it('maps_not_allowed_error_to_denied', async () => {
    getUserMediaMock.mockRejectedValue(Object.assign(new Error('nope'), { name: 'NotAllowedError' }));
    const { result } = renderHook(() => useWavRecorder(120));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorReason).toBe('denied');
  });

  it('maps_not_found_error_to_not_found', async () => {
    getUserMediaMock.mockRejectedValue(Object.assign(new Error('nope'), { name: 'NotFoundError' }));
    const { result } = renderHook(() => useWavRecorder(120));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorReason).toBe('not-found');
  });

  it('encodes_to_wav_on_manual_stop', async () => {
    getUserMediaMock.mockResolvedValue(new FakeMediaStream());
    const { result } = renderHook(() => useWavRecorder(120));

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.stop();
    });

    await waitFor(() => expect(result.current.status).toBe('stopped'));
    expect(result.current.wav).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.current.hitLimit).toBe(false);
  });

  it('auto_stops_at_the_recording_limit', async () => {
    getUserMediaMock.mockResolvedValue(new FakeMediaStream());
    const { result } = renderHook(() => useWavRecorder(0.05));

    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => expect(result.current.status).toBe('stopped'));
    expect(result.current.hitLimit).toBe(true);
  });
});
