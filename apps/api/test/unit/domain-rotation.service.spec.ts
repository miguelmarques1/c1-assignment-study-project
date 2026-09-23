import { describe, expect, it, vi } from 'vitest';
import type { VocabularyDomain } from '@english-quest/shared';

import { DomainRotationService } from '../../src/scenario/domain-rotation.service';
import { VOCABULARY_DOMAINS } from '../../src/scenario/scenario.constants';
import type { PrismaService } from '../../src/prisma/prisma.service';

interface FakeParticipation {
  userId: string;
  joinedAt: Date;
  domain: VocabularyDomain | null;
}

interface FakeScenarioRow {
  vocabularyDomain: VocabularyDomain;
  createdAt: Date;
  participantUserIds: string[];
}

/**
 * A hand-rolled double for the two read shapes DomainRotationService issues,
 * rather than a real Prisma client — this unit exercises the rotation logic
 * itself, not Postgres. `take` and the participant filter are honoured the
 * same way the real query would apply them.
 */
function makePrisma(
  participationsByUser: Record<string, FakeParticipation[]>,
  scenarioRows: FakeScenarioRow[] = [],
): PrismaService {
  return {
    lessonParticipant: {
      findMany: vi.fn(
        async ({ where, take }: { where: { userId: string }; take: number }) => {
          const rows = (participationsByUser[where.userId] ?? [])
            .slice()
            .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime())
            .slice(0, take);
          return rows.map((row) => ({
            lesson: { scenario: row.domain ? { vocabularyDomain: row.domain } : null },
          }));
        },
      ),
    },
    lessonScenario: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { lesson: { participants: { some: { userId: { in: string[] } } } } };
        }) => {
          const participantIds = where.lesson.participants.some.userId.in;
          return scenarioRows
            .filter((row) => row.participantUserIds.some((id) => participantIds.includes(id)))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((row) => ({ vocabularyDomain: row.vocabularyDomain, createdAt: row.createdAt }));
        },
      ),
    },
  } as unknown as PrismaService;
}

function daysAgo(days: number): Date {
  return new Date(Date.UTC(2026, 0, 20) - days * 24 * 60 * 60 * 1000);
}

describe('DomainRotationService', () => {
  it('picks_from_the_fifteen_domains', async () => {
    const service = new DomainRotationService(makePrisma({ 'user-1': [] }));

    const domain = await service.chooseDomain(['user-1']);

    expect(VOCABULARY_DOMAINS).toContain(domain);
  });

  it('excludes_domains_from_the_last_five_lessons', async () => {
    const excluded = VOCABULARY_DOMAINS.slice(0, 5);
    const history = excluded.map((domain, index) => ({
      userId: 'user-1',
      joinedAt: daysAgo(index),
      domain,
    }));
    const service = new DomainRotationService(makePrisma({ 'user-1': history }));

    for (let i = 0; i < 20; i++) {
      const domain = await service.chooseDomain(['user-1']);
      expect(excluded).not.toContain(domain);
    }
  });

  it('considers_every_registered_participants_history', async () => {
    const domainsA = VOCABULARY_DOMAINS.slice(0, 5);
    const domainsB = VOCABULARY_DOMAINS.slice(5, 10);
    const historyA = domainsA.map((domain, index) => ({
      userId: 'user-a',
      joinedAt: daysAgo(index),
      domain,
    }));
    const historyB = domainsB.map((domain, index) => ({
      userId: 'user-b',
      joinedAt: daysAgo(index),
      domain,
    }));
    const service = new DomainRotationService(
      makePrisma({ 'user-a': historyA, 'user-b': historyB }),
    );

    for (let i = 0; i < 20; i++) {
      const domain = await service.chooseDomain(['user-a', 'user-b']);
      expect(domainsA).not.toContain(domain);
      expect(domainsB).not.toContain(domain);
    }
  });

  it('ignores_lessons_beyond_the_window', async () => {
    // 7 distinct domains, most recent first — the window only covers 5.
    const domains = VOCABULARY_DOMAINS.slice(0, 7);
    const history = domains.map((domain, index) => ({
      userId: 'user-1',
      joinedAt: daysAgo(index),
      domain,
    }));
    const service = new DomainRotationService(makePrisma({ 'user-1': history }));

    const seen = new Set<VocabularyDomain>();
    for (let i = 0; i < 40; i++) {
      seen.add(await service.chooseDomain(['user-1']));
    }

    // The 2 oldest (indices 5 and 6) fall outside the 5-lesson window.
    expect(seen.has(domains[5]!)).toBe(true);
    expect(seen.has(domains[6]!)).toBe(true);
    // The 5 most recent stay excluded across every draw.
    for (const domain of domains.slice(0, 5)) {
      expect(seen.has(domain)).toBe(false);
    }
  });

  it('falls_back_when_every_domain_is_excluded', async () => {
    // Three participants whose own last-5 windows jointly cover all 15
    // domains, so no domain is available — contrived, but exactly the
    // exhaustion case the fallback exists for.
    const groups = [
      VOCABULARY_DOMAINS.slice(0, 5),
      VOCABULARY_DOMAINS.slice(5, 10),
      VOCABULARY_DOMAINS.slice(10, 15),
    ];
    const participationsByUser: Record<string, FakeParticipation[]> = {};
    const scenarioRows: FakeScenarioRow[] = [];

    groups.forEach((domains, groupIndex) => {
      const userId = `user-${groupIndex}`;
      participationsByUser[userId] = domains.map((domain, index) => ({
        userId,
        joinedAt: daysAgo(index),
        domain,
      }));
      domains.forEach((domain, index) => {
        scenarioRows.push({
          vocabularyDomain: domain,
          // Group 2's oldest entry is deliberately the single oldest row
          // overall, so the fallback has one unambiguous answer to prefer.
          createdAt: daysAgo(index + groupIndex * 20),
          participantUserIds: [userId],
        });
      });
    });

    const participantIds = ['user-0', 'user-1', 'user-2'];
    const service = new DomainRotationService(makePrisma(participationsByUser, scenarioRows));

    const domain = await service.chooseDomain(participantIds);

    expect(VOCABULARY_DOMAINS).toContain(domain);
    // The least recently used domain overall: group 2's oldest entry.
    expect(domain).toBe(groups[2]![4]);
  });
});
