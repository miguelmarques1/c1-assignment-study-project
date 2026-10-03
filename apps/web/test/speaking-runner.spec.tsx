import type { SpeakingActivityView, SpeakingAttemptView } from '@english-quest/shared';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@/lib/api-client';
import { SpeakingRunner } from '@/components/speaking/speaking-runner';

const { encodeWavMock, resampleTo16kMonoMock, fetchSpeakingActivityMock, uploadAttemptMock, rescoreAttemptMock, rateSpeakingActivityMock } = vi.hoisted(
  () => ({
    encodeWavMock: vi.fn(() => new Uint8Array([1, 2, 3])),
    resampleTo16kMonoMock: vi.fn(async () => new Float32Array([0])),
    fetchSpeakingActivityMock: vi.fn(),
    uploadAttemptMock: vi.fn(),
    rescoreAttemptMock: vi.fn(),
    rateSpeakingActivityMock: vi.fn(),
  }),
);

vi.mock('@/lib/wav-encoder', () => ({
  encodeWav: encodeWavMock,
  resampleTo16kMono: resampleTo16kMonoMock,
}));

vi.mock('@/lib/speaking', () => ({
  fetchSpeakingActivity: fetchSpeakingActivityMock,
  uploadAttempt: uploadAttemptMock,
  rescoreAttempt: rescoreAttemptMock,
  rateSpeakingActivity: rateSpeakingActivityMock,
}));

vi.mock('@/components/classroom/use-audio-level', () => ({
  useAudioLevel: () => null,
}));

class FakeMediaStreamTrack {
  stop = vi.fn();
}

class FakeMediaStream {
  private tracks = [new FakeMediaStreamTrack()];
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
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
  decodeAudioData = vi.fn(async () => ({ duration: 2 }) as unknown as AudioBuffer);
  createBufferSource = vi.fn(() => ({
    buffer: null,
    onended: null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }));
  destination = {};
  close = vi.fn(async () => undefined);
}

const getUserMediaMock = vi.fn();

function activity(overrides: Partial<SpeakingActivityView> = {}): SpeakingActivityView {
  return {
    activityId: '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d',
    kind: 'pronunciation',
    title: 'Read aloud: /θ/ as in "think"',
    state: 'pending',
    planStatus: 'active',
    estimatedMinutes: 4,
    targetTags: [{ tag: 'phoneme:/θ/', label: '/θ/ as in "think"' }],
    task: {
      shape: 'read_aloud',
      referenceText: 'Nothing in the southern valley was thought through.',
      prompt: null,
      hint: null,
      wordCount: 9,
      focusTags: [{ tag: 'phoneme:/θ/', label: '/θ/ as in "think"' }],
      targetSeconds: null,
    },
    block: null,
    limits: { maxAttempts: 3, maxRecordingSeconds: 120, minRecognizedWords: 10 },
    attemptsUsed: 0,
    attemptsRemaining: 3,
    bestAttemptId: null,
    attempts: [],
    rating: null,
    ...overrides,
  };
}

function scoredAttempt(overrides: Partial<SpeakingAttemptView> = {}): SpeakingAttemptView {
  return {
    id: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
    clientAttemptId: '0f1e2d3c-4b5a-4968-8776-655443322110',
    ordinal: 1,
    state: 'scored',
    createdAt: '2026-10-02T07:31:12.000Z',
    scoredAt: '2026-10-02T07:31:16.000Z',
    durationMs: 22480,
    isBest: true,
    failure: null,
    result: {
      scores: { pronunciation: 71.6, accuracy: 74.2, fluency: 80.1, prosody: 66.5, completeness: 97.9 },
      recognizedWordCount: 9,
      transcript: null,
      words: [{ text: 'Nothing', band: 'good', accuracy: 92, errorTypes: [], startMs: 0, durationMs: 400 }],
      failingPhonemes: [],
    },
    ...overrides,
  };
}

beforeEach(() => {
  getUserMediaMock.mockReset();
  fetchSpeakingActivityMock.mockReset();
  uploadAttemptMock.mockReset();
  rescoreAttemptMock.mockReset();
  rateSpeakingActivityMock.mockReset();
  encodeWavMock.mockClear();
  resampleTo16kMonoMock.mockClear();
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('Blob', NodeBlob);
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: getUserMediaMock },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SpeakingRunner', () => {
  it('records_reviews_and_submits_a_first_attempt', async () => {
    const user = userEvent.setup();
    getUserMediaMock.mockResolvedValue(new FakeMediaStream());
    const attempt = scoredAttempt();
    uploadAttemptMock.mockResolvedValue(attempt);
    fetchSpeakingActivityMock.mockResolvedValue(
      activity({ attemptsUsed: 1, attemptsRemaining: 2, bestAttemptId: attempt.id, attempts: [attempt] }),
    );

    render(<SpeakingRunner activity={activity()} />);

    await user.click(screen.getByRole('button', { name: 'Start recording' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop recording' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(uploadAttemptMock).toHaveBeenCalledTimes(1));
    expect(uploadAttemptMock).toHaveBeenCalledWith(activity().activityId, expect.any(String), new Uint8Array([1, 2, 3]));
    await waitFor(() => expect(screen.getByText('Pronunciation')).toBeInTheDocument());
  });

  it('shows_the_azure_key_gate_instead_of_the_recorder', () => {
    render(<SpeakingRunner activity={activity({ block: 'azure_key_missing' })} />);

    expect(screen.getByRole('link', { name: 'Open settings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start recording' })).not.toBeInTheDocument();
  });

  it('shows_a_read_only_view_with_no_rating_when_the_plan_is_archived', () => {
    const attempt = scoredAttempt();
    render(<SpeakingRunner activity={activity({ block: 'plan_archived', attempts: [attempt], bestAttemptId: attempt.id })} />);

    expect(screen.getByText('This activity is no longer in your current plan.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start recording' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: "Rate this activity's difficulty" })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Previous attempts')).toBeInTheDocument();
  });

  it('maps_a_denied_microphone_to_the_blocked_gate', async () => {
    const user = userEvent.setup();
    getUserMediaMock.mockRejectedValue(Object.assign(new Error('nope'), { name: 'NotAllowedError' }));

    render(<SpeakingRunner activity={activity()} />);

    await user.click(screen.getByRole('button', { name: 'Start recording' }));

    await waitFor(() => expect(screen.getByText('English Quest needs microphone access for speaking activities.')).toBeInTheDocument());
  });

  it('shows_the_credential_sentence_when_the_upload_is_rejected_with_cred002', async () => {
    const user = userEvent.setup();
    getUserMediaMock.mockResolvedValue(new FakeMediaStream());
    uploadAttemptMock.mockRejectedValue(
      new ApiRequestError(409, { error: { code: 'CRED002', message: 'No usable key for this provider.', details: undefined } }),
    );

    render(<SpeakingRunner activity={activity()} />);

    await user.click(screen.getByRole('button', { name: 'Start recording' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop recording' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByText('Add your Azure Speech key to use speaking activities.')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Open settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
