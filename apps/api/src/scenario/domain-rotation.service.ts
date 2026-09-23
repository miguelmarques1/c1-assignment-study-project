import { Injectable } from '@nestjs/common';
import type { VocabularyDomain } from '@english-quest/shared';

import { PrismaService } from '../prisma/prisma.service';
import { HISTORY_WINDOW_LESSONS, VOCABULARY_DOMAINS } from './scenario.constants';

/**
 * Picks the vocabulary domain for a new situation: one of the PRD's 15,
 * excluding whatever any registered participant has seen in their own last
 * 5 lessons. "Last 5" is per participant, ordered by that participant's own
 * `lesson_participants.joinedAt`; the union across every participant
 * registered at generation time is the exclusion set, per the spec's
 * decision to generalize the PRD's per-participant guarantee.
 */
@Injectable()
export class DomainRotationService {
  constructor(private readonly prisma: PrismaService) {}

  async chooseDomain(participantUserIds: string[]): Promise<VocabularyDomain> {
    const recentPerParticipant = await Promise.all(
      participantUserIds.map((userId) => this.recentDomains(userId)),
    );
    const excluded = new Set(recentPerParticipant.flat());
    const available = VOCABULARY_DOMAINS.filter((domain) => !excluded.has(domain));

    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)]!;
    }

    // Every domain has been seen recently by at least one participant — fall
    // back to the one used longest ago rather than throwing, so a lesson can
    // never fail to generate purely because rotation ran out of room.
    return this.leastRecentlyUsed(participantUserIds);
  }

  private async recentDomains(userId: string): Promise<VocabularyDomain[]> {
    const rows = await this.prisma.lessonParticipant.findMany({
      where: { userId },
      orderBy: { joinedAt: 'desc' },
      take: HISTORY_WINDOW_LESSONS,
      select: { lesson: { select: { scenario: { select: { vocabularyDomain: true } } } } },
    });

    return rows
      .map((row) => row.lesson.scenario?.vocabularyDomain)
      .filter((domain): domain is string => Boolean(domain)) as VocabularyDomain[];
  }

  private async leastRecentlyUsed(participantUserIds: string[]): Promise<VocabularyDomain> {
    const rows = await this.prisma.lessonScenario.findMany({
      where: {
        vocabularyDomain: { not: null },
        lesson: { participants: { some: { userId: { in: participantUserIds } } } },
      },
      orderBy: { createdAt: 'desc' },
      select: { vocabularyDomain: true, createdAt: true },
    });

    const lastUsedAt = new Map<string, Date>();
    for (const row of rows) {
      if (row.vocabularyDomain && !lastUsedAt.has(row.vocabularyDomain)) {
        lastUsedAt.set(row.vocabularyDomain, row.createdAt);
      }
    }

    // A domain with no recorded use sorts before any that has one.
    const [oldest] = [...VOCABULARY_DOMAINS].sort((a, b) => {
      const aTime = lastUsedAt.get(a)?.getTime() ?? -Infinity;
      const bTime = lastUsedAt.get(b)?.getTime() ?? -Infinity;
      return aTime - bTime;
    });
    return oldest!;
  }
}
