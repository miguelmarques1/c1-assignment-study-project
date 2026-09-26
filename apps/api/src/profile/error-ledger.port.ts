import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * F19's seam for the lesson result's recurrence badge (`4th time`),
 * implemented by F12 from the owner's occurrence log. For each tag, it
 * counts the user's occurrences from sources up to and including the given
 * lesson — lessons by their start, activities by their completion — so an
 * old lesson's badge stays stable as later lessons add occurrences. A tag
 * with no occurrence by then is absent from the map (unknown), never 0.
 * Only ever reads `userId`'s own data.
 */
@Injectable()
export class ErrorLedgerPort {
  constructor(private readonly prisma: PrismaService) {}

  async occurrencesThrough(userId: string, lessonId: string, tags: readonly string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (tags.length === 0) {
      return counts;
    }
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { startedAt: true, openedAt: true },
    });
    if (!lesson) {
      return counts;
    }
    const through = lesson.startedAt ?? lesson.openedAt;
    const grouped = await this.prisma.errorLedgerOccurrence.groupBy({
      by: ['tag'],
      where: { userId, tag: { in: [...new Set(tags)] }, occurredAt: { lte: through } },
      _count: { _all: true },
    });
    for (const row of grouped) {
      counts.set(row.tag, row._count._all);
    }
    return counts;
  }
}
