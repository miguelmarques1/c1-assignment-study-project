import { act, renderHook } from '@testing-library/react';
import { RoomEvent } from 'livekit-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useClassroomRoom } from '@/components/classroom/use-classroom-room';

interface FakeParticipant {
  identity: string;
  name: string;
  trackPublications: Map<string, unknown>;
  connectionQuality: string;
}

// vi.mock() factories are hoisted above every import and top-level const, so
// everything the factory below closes over has to be created inside
// vi.hoisted() to exist by the time the factory runs.
const { RoomMock, getLastRoom, getLastRoomOptions, requestClassroomTokenMock } = vi.hoisted(() => {
  class FakeRoom {
    localParticipant: FakeParticipant & {
      isMicrophoneEnabled: boolean;
      isCameraEnabled: boolean;
      setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
      setCameraEnabled: (enabled: boolean) => Promise<void>;
    };
    remoteParticipants = new Map<string, FakeParticipant>();
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

    constructor() {
      this.localParticipant = {
        identity: 'local-user',
        name: 'You',
        trackPublications: new Map(),
        connectionQuality: 'excellent',
        isMicrophoneEnabled: true,
        isCameraEnabled: true,
        setMicrophoneEnabled: vi.fn(async (enabled: boolean) => {
          this.localParticipant.isMicrophoneEnabled = enabled;
        }),
        setCameraEnabled: vi.fn(async (enabled: boolean) => {
          this.localParticipant.isCameraEnabled = enabled;
        }),
      };
    }

    on(event: string, handler: (...args: unknown[]) => void): this {
      const handlers = this.listeners.get(event) ?? [];
      handlers.push(handler);
      this.listeners.set(event, handlers);
      return this;
    }

    emit(event: string, ...args: unknown[]): void {
      for (const handler of this.listeners.get(event) ?? []) {
        handler(...args);
      }
    }
  }

  let lastRoom: FakeRoom | undefined;
  let lastRoomOptions: Record<string, unknown> | undefined;
  const roomMock = vi.fn().mockImplementation((options: Record<string, unknown>) => {
    lastRoomOptions = options;
    lastRoom = new FakeRoom();
    return lastRoom;
  });

  return {
    RoomMock: roomMock,
    getLastRoom: () => lastRoom,
    getLastRoomOptions: () => lastRoomOptions,
    requestClassroomTokenMock: vi.fn(),
  };
});

vi.mock('livekit-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('livekit-client')>();
  return { ...actual, Room: RoomMock };
});

vi.mock('@/lib/classroom', () => ({
  requestClassroomToken: requestClassroomTokenMock,
}));

const CONNECT_PARAMS = {
  url: 'ws://localhost:7880',
  token: 'initial-token',
  expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
};

beforeEach(() => {
  RoomMock.mockClear();
  requestClassroomTokenMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useClassroomRoom', () => {
  it('shows_the_reconnecting_overlay_on_a_drop_and_dismisses_it_on_recovery', async () => {
    const { result } = renderHook(() => useClassroomRoom());

    await act(async () => {
      await result.current.connect(CONNECT_PARAMS);
    });
    expect(result.current.phase).toBe('connected');

    act(() => {
      getLastRoom()!.emit(RoomEvent.Reconnecting);
    });
    expect(result.current.phase).toBe('reconnecting');
    expect(result.current.reconnectSecondsLeft).not.toBeNull();

    act(() => {
      getLastRoom()!.emit(RoomEvent.Reconnected);
    });
    expect(result.current.phase).toBe('connected');
    expect(result.current.reconnectSecondsLeft).toBeNull();
  });

  it('treats_a_drop_past_the_window_as_having_left', async () => {
    const { result } = renderHook(() => useClassroomRoom());

    await act(async () => {
      await result.current.connect(CONNECT_PARAMS);
    });

    act(() => {
      getLastRoom()!.emit(RoomEvent.Reconnecting);
    });
    act(() => {
      getLastRoom()!.emit(RoomEvent.Disconnected);
    });

    expect(result.current.phase).toBe('left');
  });

  it('stops_retrying_after_30_seconds', async () => {
    const { result } = renderHook(() => useClassroomRoom());

    await act(async () => {
      await result.current.connect(CONNECT_PARAMS);
    });

    const policy = getLastRoomOptions()!.reconnectPolicy as {
      nextRetryDelayInMs: (context: { elapsedMs: number; retryCount: number }) => number | null;
    };

    expect(policy.nextRetryDelayInMs({ elapsedMs: 29_000, retryCount: 0 })).not.toBeNull();
    expect(policy.nextRetryDelayInMs({ elapsedMs: 30_000, retryCount: 0 })).toBeNull();
  });

  it('surfaces_per_participant_connection_quality', async () => {
    const { result } = renderHook(() => useClassroomRoom());

    await act(async () => {
      await result.current.connect(CONNECT_PARAMS);
    });

    const remote: FakeParticipant = {
      identity: 'remote-1',
      name: 'Ana',
      trackPublications: new Map(),
      connectionQuality: 'good',
    };
    getLastRoom()!.remoteParticipants.set(remote.identity, remote);

    act(() => {
      remote.connectionQuality = 'poor';
      getLastRoom()!.emit(RoomEvent.ConnectionQualityChanged);
    });

    const view = result.current.participants.find((p) => p.identity === 'remote-1');
    expect(view?.quality).toBe('poor');
  });

  it('refreshes_the_token_at_the_five_hour_mark', async () => {
    vi.useFakeTimers();
    // A real server issues a fresh 6h TTL relative to the refresh call's own
    // time, not the original connection's — mockImplementation (not a frozen
    // mockResolvedValue) is what makes that true here too.
    requestClassroomTokenMock.mockImplementation(async () => ({
      token: 'refreshed-token',
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    }));

    const { result } = renderHook(() => useClassroomRoom());

    await act(async () => {
      await result.current.connect(CONNECT_PARAMS);
    });

    expect(requestClassroomTokenMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 60 * 1000 + 1000);
    });

    expect(requestClassroomTokenMock).toHaveBeenCalledTimes(1);
  });
});
