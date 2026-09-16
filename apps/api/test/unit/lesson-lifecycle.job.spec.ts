import type { Lesson } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LessonLifecycleJob } from '../../src/classroom/lesson-lifecycle.job';
import type { LessonService } from '../../src/classroom/lesson.service';
import type { LiveKitService } from '../../src/classroom/livekit.service';

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson-1',
    room: 'classroom-main',
    status: 'live',
    openedBy: 'user-1',
    openedAt: new Date(),
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    endReason: null,
    endedBy: null,
    allDisconnectedSince: null,
    maxParticipants: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Lesson;
}

describe('LessonLifecycleJob', () => {
  let lessons: { findSweepable: ReturnType<typeof vi.fn>; finalizeLesson: ReturnType<typeof vi.fn> };
  let liveKit: { deleteRoom: ReturnType<typeof vi.fn> };
  let job: LessonLifecycleJob;

  beforeEach(() => {
    lessons = {
      findSweepable: vi.fn(),
      finalizeLesson: vi.fn().mockResolvedValue(undefined),
    };
    liveKit = { deleteRoom: vi.fn().mockResolvedValue(undefined) };
    job = new LessonLifecycleJob(
      lessons as unknown as LessonService,
      liveKit as unknown as LiveKitService,
    );
  });

  it('ends_a_live_lesson_all_disconnected_for_over_60_seconds', async () => {
    const lesson = makeLesson({ allDisconnectedSince: new Date(Date.now() - 61_000) });
    lessons.findSweepable.mockResolvedValue([lesson]);

    await job.run();

    expect(lessons.finalizeLesson).toHaveBeenCalledWith(
      lesson.id,
      'all_disconnected',
      expect.objectContaining({ endedAt: expect.any(Date) }),
    );
  });

  it('leaves_a_live_lesson_with_someone_connected_alone', async () => {
    const lesson = makeLesson({ allDisconnectedSince: null });
    lessons.findSweepable.mockResolvedValue([lesson]);

    await job.run();

    expect(lessons.finalizeLesson).not.toHaveBeenCalled();
  });

  it('leaves_a_lesson_disconnected_for_under_60_seconds_alone', async () => {
    const lesson = makeLesson({ allDisconnectedSince: new Date(Date.now() - 30_000) });
    lessons.findSweepable.mockResolvedValue([lesson]);

    await job.run();

    expect(lessons.finalizeLesson).not.toHaveBeenCalled();
  });

  it('ends_a_lesson_at_the_120_minute_cap', async () => {
    const lesson = makeLesson({ startedAt: new Date(Date.now() - 121 * 60 * 1000) });
    lessons.findSweepable.mockResolvedValue([lesson]);

    await job.run();

    expect(lessons.finalizeLesson).toHaveBeenCalledWith(
      lesson.id,
      'max_duration',
      expect.objectContaining({ endedAt: expect.any(Date) }),
    );
    expect(liveKit.deleteRoom).toHaveBeenCalledWith(lesson.room);
  });

  it('abandons_a_waiting_lesson_disconnected_for_over_60_seconds', async () => {
    const lesson = makeLesson({
      status: 'waiting',
      startedAt: null,
      allDisconnectedSince: new Date(Date.now() - 61_000),
    });
    lessons.findSweepable.mockResolvedValue([lesson]);

    await job.run();

    expect(lessons.finalizeLesson).toHaveBeenCalledWith(
      lesson.id,
      'abandoned_before_start',
      expect.objectContaining({ endedAt: expect.any(Date) }),
    );
    expect(liveKit.deleteRoom).not.toHaveBeenCalled();
  });

  it('never_touches_a_terminal_lesson', async () => {
    const lesson = makeLesson({ status: 'ended', endedAt: new Date() });
    lessons.findSweepable.mockResolvedValue([lesson]);

    await job.run();

    expect(lessons.finalizeLesson).not.toHaveBeenCalled();
    expect(liveKit.deleteRoom).not.toHaveBeenCalled();
  });
});
