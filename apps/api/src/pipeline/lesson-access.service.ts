import { Injectable } from '@nestjs/common';
import type { Lesson } from '@prisma/client';

import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The participant check every per-lesson read after the lesson shares.
 * Following F05's precedent, an unknown lesson id reads the same as "not a
 * participant", so a caller cannot probe which ids exist.
 */
@Injectable()
export class LessonAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireParticipant(lessonId: string, userId: string): Promise<Lesson> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) {
      throw AppError.notAParticipant();
    }
    const participant = await this.prisma.lessonParticipant.findUnique({
      where: { lessonId_userId: { lessonId, userId } },
      select: { id: true },
    });
    if (!participant) {
      throw AppError.notAParticipant();
    }
    return lesson;
  }
}
