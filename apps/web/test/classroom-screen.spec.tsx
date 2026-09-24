import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoomEvent } from 'livekit-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveRecording } from '@english-quest/shared';

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
  getLastRoom,
  requestClassroomTokenMock,
  fetchClassroomSessionMock,
  fetchLessonRecordingMock,
  endLessonMock,
  fetchScenarioMock,
  rerollSituationMock,
  retrySituationMock,
  createLocalTracksMock,
  routerPushMock,
  setAudioBehavior,
  setVideoBehavior,
  setCameraEnabledBehavior,
  setRemotePresent,
} = vi.hoisted(() => {
  type DeviceBehavior = 'grant' | 'deny';
  let remotePresent = false;
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
        // LiveKit reflects the token's `name` claim back as `participant.name`.
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
      if (remotePresent) {
        this.remoteParticipants.set('bob-id', {
          identity: 'bob-id',
          name: 'Bob',
          trackPublications: new Map(),
          connectionQuality: 'excellent',
        });
      }
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
  const roomMock = vi.fn().mockImplementation(() => {
    lastRoom = new FakeRoom();
    return lastRoom;
  });
  (roomMock as unknown as { getLocalDevices: ReturnType<typeof vi.fn> }).getLocalDevices = vi
    .fn()
    .mockResolvedValue([]);

  return {
    RoomMock: roomMock,
    getLastRoom: () => lastRoom,
    requestClassroomTokenMock: vi.fn(),
    fetchClassroomSessionMock: vi.fn(),
    fetchLessonRecordingMock: vi.fn(),
    endLessonMock: vi.fn(),
    fetchScenarioMock: vi.fn(),
    rerollSituationMock: vi.fn(),
    retrySituationMock: vi.fn(),
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
    setRemotePresent: (value: boolean) => {
      remotePresent = value;
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

vi.mock('@/lib/recording', () => ({
  fetchLessonRecording: fetchLessonRecordingMock,
}));

vi.mock('@/lib/scenario', () => ({
  fetchScenario: fetchScenarioMock,
  rerollSituation: rerollSituationMock,
  retrySituation: retrySituationMock,
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

const IDLE_RECORDING: LiveRecording = { status: 'idle', since: null, mine: { status: 'not_started', capturedSeconds: 0 } };

const SESSION_RESPONSE = {
  lessonId: TOKEN_RESPONSE.lessonId,
  status: 'waiting' as const,
  openedBy: 'local-user',
  startedAt: null,
  maxParticipants: 2,
  participants: [],
  awaiting: [{ userId: 'bob-id', displayName: 'Bob' }],
  recording: IDLE_RECORDING,
};

function sessionWithRecording(recording: LiveRecording) {
  return { ...SESSION_RESPONSE, recording };
}

async function joinClassroom() {
  render(<ClassroomScreen userId="local-user" />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Join classroom' })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Join classroom' }));
}

beforeEach(() => {
  setAudioBehavior('grant');
  setVideoBehavior('grant');
  setCameraEnabledBehavior('grant');
  setRemotePresent(false);
  requestClassroomTokenMock.mockReset().mockResolvedValue(TOKEN_RESPONSE);
  fetchClassroomSessionMock.mockReset().mockResolvedValue(SESSION_RESPONSE);
  fetchScenarioMock.mockReset().mockResolvedValue(null);
  rerollSituationMock.mockReset();
  retrySituationMock.mockReset();
  endLessonMock.mockReset().mockResolvedValue({
    lessonId: TOKEN_RESPONSE.lessonId,
    status: 'ended',
    endedAt: new Date().toISOString(),
    durationSeconds: 42,
  });
  fetchLessonRecordingMock.mockReset().mockResolvedValue({ endReason: 'ended_by_participant' });
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
    render(<ClassroomScreen userId="local-user" />);

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

    // The PRD's wording, split across the mockup's heading and information box.
    const confirmation = screen.getByRole('alertdialog');
    expect(within(confirmation).getByText('End the lesson for everyone?')).toBeInTheDocument();
    expect(
      within(confirmation).getByText('Processing will start and results will be ready in about 30 minutes.'),
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

  it('shows_the_scenario_as_the_waiting_rooms_main_column', async () => {
    await joinClassroom();
    await waitFor(() => expect(screen.getByLabelText('Elapsed time')).toBeInTheDocument());

    // Before anyone else connects the scenario is already on the page, so the
    // toggle reads as pressed and opens nothing.
    const toggle = screen.getByRole('button', { name: 'Scenario shown on this page' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText("Preparing today's scenario…")).toBeInTheDocument();
  });

  it('opens_the_in_call_scenario_panel_from_the_control_bar', async () => {
    setRemotePresent(true);
    await joinClassroom();
    await waitFor(() => expect(screen.getByLabelText('Elapsed time')).toBeInTheDocument());

    const scenarioButton = screen.getByRole('button', { name: 'Show scenario panel' });
    expect(scenarioButton).toBeEnabled();
    expect(screen.queryByRole('complementary', { name: 'Scenario panel' })).not.toBeInTheDocument();

    await userEvent.click(scenarioButton);
    expect(screen.getByRole('complementary', { name: 'Scenario panel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide scenario panel' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close scenario panel' }));
    expect(screen.queryByRole('complementary', { name: 'Scenario panel' })).not.toBeInTheDocument();
  });

  it('refetches_the_session_when_the_room_recording_status_changes', async () => {
    setRemotePresent(true);
    await joinClassroom();
    await waitFor(() => expect(screen.getByLabelText('Elapsed time')).toBeInTheDocument());

    const callsBefore = fetchClassroomSessionMock.mock.calls.length;
    fetchClassroomSessionMock.mockResolvedValue(
      sessionWithRecording({ status: 'recording', since: new Date().toISOString(), mine: { status: 'recording', capturedSeconds: 5 } }),
    );

    act(() => {
      getLastRoom()!.emit(RoomEvent.RecordingStatusChanged);
    });

    // The default waitFor timeout (1s) is well under the regular 3s poll
    // interval, so this only passes if the refetch fired immediately.
    await waitFor(() => expect(fetchClassroomSessionMock.mock.calls.length).toBeGreaterThan(callsBefore));
    await waitFor(() => expect(screen.getByText('Recording')).toBeInTheDocument());
  });

  it('shows_the_cap_notice_when_the_lesson_ended_at_two_hours', async () => {
    await joinClassroom();
    await waitFor(() => expect(screen.getByLabelText('Elapsed time')).toBeInTheDocument());
    fetchLessonRecordingMock.mockResolvedValue({ endReason: 'max_duration' });

    act(() => {
      getLastRoom()!.emit(RoomEvent.Disconnected);
    });

    await waitFor(() =>
      expect(screen.getByText('Lesson ended automatically after 2 hours.')).toBeInTheDocument(),
    );
    expect(routerPushMock).not.toHaveBeenCalledWith('/dashboard');
  });

  it('returns_to_the_dashboard_for_any_other_ending', async () => {
    await joinClassroom();
    await waitFor(() => expect(screen.getByLabelText('Elapsed time')).toBeInTheDocument());
    fetchLessonRecordingMock.mockResolvedValue({ endReason: 'ended_by_participant' });

    act(() => {
      getLastRoom()!.emit(RoomEvent.Disconnected);
    });

    await waitFor(() => expect(routerPushMock).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByText('Lesson ended automatically after 2 hours.')).not.toBeInTheDocument();
  });

  it('the_end_dialog_states_the_callers_captured_audio', async () => {
    fetchClassroomSessionMock.mockResolvedValue(
      sessionWithRecording({ status: 'recording', since: new Date().toISOString(), mine: { status: 'recording', capturedSeconds: 1458 } }),
    );
    await joinClassroom();
    await waitFor(() => expect(screen.getByLabelText('Elapsed time')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'End lesson' }));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('24m 18s audio recorded safely')).toBeInTheDocument();
  });

  it('the_end_dialog_states_when_nothing_is_recorded', async () => {
    fetchClassroomSessionMock.mockResolvedValue(
      sessionWithRecording({ status: 'not_recording', since: new Date().toISOString(), mine: { status: 'failed_to_start', capturedSeconds: 0 } }),
    );
    await joinClassroom();
    await waitFor(() => expect(screen.getByLabelText('Elapsed time')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'End lesson' }));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('This lesson is not being recorded.')).toBeInTheDocument();
  });
});
