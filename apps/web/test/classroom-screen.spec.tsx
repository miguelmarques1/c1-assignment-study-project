import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClassroomScreen } from '@/components/classroom/classroom-screen';
import { ApiRequestError } from '@/lib/api-client';

interface FakeParticipant {
  identity: string;
  name: string;
  trackPublications: Map<string, unknown>;
  connectionQuality: string;
}

const {
  RoomMock,
  requestClassroomTokenMock,
  fetchClassroomSessionMock,
  endLessonMock,
  createLocalTracksMock,
  routerPushMock,
  setAudioBehavior,
  setVideoBehavior,
  setCameraEnabledBehavior,
} = vi.hoisted(() => {
  type DeviceBehavior = 'grant' | 'deny';
  let audioBehavior: DeviceBehavior = 'grant';
  let videoBehavior: DeviceBehavior = 'grant';
  let cameraEnabledBehavior: DeviceBehavior = 'grant';

  function fakeTrack(kind: 'audio' | 'video') {
    return {
      kind,
      mediaStreamTrack: {
        getSettings: vi.fn(() => ({ deviceId: `fake-${kind}-device` })),
      } as unknown as MediaStreamTrack,
      stop: vi.fn(),
      attach: vi.fn((el?: HTMLMediaElement) => el ?? document.createElement(kind)),
      detach: vi.fn(),
    };
  }

  function denied(): never {
    throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
  }

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
        // Matches the ClassroomScreen `displayName` prop below — LiveKit
        // reflects the token's `name` claim back as `participant.name`.
        name: 'Alice',
        trackPublications: new Map(),
        connectionQuality: 'excellent',
        isMicrophoneEnabled: true,
        isCameraEnabled: true,
        setMicrophoneEnabled: vi.fn(async (enabled: boolean) => {
          this.localParticipant.isMicrophoneEnabled = enabled;
        }),
        setCameraEnabled: vi.fn(async (enabled: boolean) => {
          if (enabled && cameraEnabledBehavior === 'deny') {
            denied();
          }
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
  }

  const roomMock = vi.fn().mockImplementation(() => new FakeRoom());
  (roomMock as unknown as { getLocalDevices: ReturnType<typeof vi.fn> }).getLocalDevices = vi
    .fn()
    .mockResolvedValue([]);

  return {
    RoomMock: roomMock,
    requestClassroomTokenMock: vi.fn(),
    fetchClassroomSessionMock: vi.fn(),
    endLessonMock: vi.fn(),
    routerPushMock: vi.fn(),
    createLocalTracksMock: vi.fn(async (options: { audio?: unknown; video?: unknown }) => {
      if (options.audio) {
        return audioBehavior === 'deny' ? denied() : [fakeTrack('audio')];
      }
      if (options.video) {
        return videoBehavior === 'deny' ? denied() : [fakeTrack('video')];
      }
      return [];
    }),
    setAudioBehavior: (value: DeviceBehavior) => {
      audioBehavior = value;
    },
    setVideoBehavior: (value: DeviceBehavior) => {
      videoBehavior = value;
    },
    setCameraEnabledBehavior: (value: DeviceBehavior) => {
      cameraEnabledBehavior = value;
    },
  };
});

vi.mock('livekit-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('livekit-client')>();
  return { ...actual, Room: RoomMock, createLocalTracks: createLocalTracksMock };
});

vi.mock('@/lib/classroom', () => ({
  requestClassroomToken: requestClassroomTokenMock,
  fetchClassroomSession: fetchClassroomSessionMock,
  endLesson: endLessonMock,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock, refresh: vi.fn() }),
}));

const TOKEN_RESPONSE = {
  lessonId: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21',
  roomName: 'classroom-main',
  url: 'ws://localhost:7880',
  token: 'fake-token',
  identity: 'local-user',
  expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  maxParticipants: 2,
  status: 'waiting' as const,
};

const SESSION_RESPONSE = {
  lessonId: TOKEN_RESPONSE.lessonId,
  status: 'waiting' as const,
  openedBy: 'local-user',
  startedAt: null,
  maxParticipants: 2,
  participants: [],
  awaiting: [{ userId: 'bob-id', displayName: 'Bob' }],
};

async function joinClassroom() {
  render(<ClassroomScreen displayName="Alice" />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Join classroom' })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Join classroom' }));
}

beforeEach(() => {
  setAudioBehavior('grant');
  setVideoBehavior('grant');
  setCameraEnabledBehavior('grant');
  requestClassroomTokenMock.mockReset().mockResolvedValue(TOKEN_RESPONSE);
  fetchClassroomSessionMock.mockReset().mockResolvedValue(SESSION_RESPONSE);
  endLessonMock.mockReset().mockResolvedValue({
    lessonId: TOKEN_RESPONSE.lessonId,
    status: 'ended',
    endedAt: new Date().toISOString(),
    durationSeconds: 42,
  });
  routerPushMock.mockClear();
  createLocalTracksMock.mockClear();
  RoomMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('ClassroomScreen', () => {
  it('blocks_connection_when_the_microphone_is_denied', async () => {
    setAudioBehavior('deny');
    render(<ClassroomScreen displayName="Alice" />);

    await waitFor(() =>
      expect(
        screen.getByText('English Quest needs microphone access to run a lesson.'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(requestClassroomTokenMock).not.toHaveBeenCalled();
  });

  it('starts_audio_only_when_the_camera_is_denied', async () => {
    setVideoBehavior('deny');
    setCameraEnabledBehavior('deny');

    await joinClassroom();

    await waitFor(() => expect(screen.getByLabelText('Elapsed time')).toBeInTheDocument());
    // The local tile falls back to initials — no video element attached.
    expect(screen.getByRole('img', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn camera on' })).toBeInTheDocument();
  });

  it('shows_the_waiting_state_with_the_local_preview', async () => {
    await joinClassroom();

    await waitFor(() =>
      expect(screen.getByText('Waiting for Bob to join')).toBeInTheDocument(),
    );
    // The local preview tile (initials, since the fake room publishes no
    // video) and the level meter both render in the waiting state.
    expect(screen.getAllByRole('img', { name: 'Alice' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Microphone level')).toBeInTheDocument();
  });

  it('shows_the_classroom_full_message_with_the_cap', async () => {
    requestClassroomTokenMock.mockRejectedValue(
      new ApiRequestError(409, {
        error: { code: 'CLASS001', message: 'This classroom is full.', details: { maxParticipants: 2 } },
      }),
    );

    await joinClassroom();

    await waitFor(() =>
      expect(screen.getByText('This classroom is full (2 participants).')).toBeInTheDocument(),
    );
  });

  it('shows_the_unavailable_message_with_the_underlying_reason', async () => {
    requestClassroomTokenMock.mockRejectedValue(
      new ApiRequestError(503, {
        error: {
          code: 'CLASS002',
          message: 'The classroom is unavailable right now.',
          details: { reason: 'LiveKit server not reachable' },
        },
      }),
    );

    await joinClassroom();

    await waitFor(() =>
      expect(screen.getByText('The classroom is unavailable right now.')).toBeInTheDocument(),
    );
    expect(screen.getByText('LiveKit server not reachable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('confirms_before_ending_and_names_the_consequence', async () => {
    await joinClassroom();
    await waitFor(() => expect(screen.getByLabelText('Elapsed time')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'End lesson' }));

    expect(
      screen.getByText(
        'End the lesson for everyone? Processing will start and results will be ready in about 30 minutes.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(endLessonMock).not.toHaveBeenCalled();
    // Still connected — the header is still on screen.
    expect(screen.getByLabelText('Elapsed time')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'End lesson' }));
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'End lesson' }));

    await waitFor(() => expect(endLessonMock).toHaveBeenCalledWith(TOKEN_RESPONSE.lessonId));
    expect(routerPushMock).toHaveBeenCalledWith('/dashboard');
  });

  it('renders_the_disabled_scenario_toggle', async () => {
    await joinClassroom();
    await waitFor(() => expect(screen.getByLabelText('Elapsed time')).toBeInTheDocument());

    const scenarioButton = screen.getByRole('button', { name: 'Scenario — coming soon' });
    expect(scenarioButton).toBeDisabled();
  });
});
