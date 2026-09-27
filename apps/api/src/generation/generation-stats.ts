import type { PrismaClient } from '@prisma/client';

/** The section reads the last 90 days, so a retired prompt version ages out of the table. */
export const GENERATION_STATS_WINDOW_DAYS = 90;

export interface PromptVersionStats {
  promptId: string;
  promptVersion: string;
  /** Slots whose first attempt ran under this version and reached a gate verdict. */
  slots: number;
  /** Share of those slots that passed on attempt 1. */
  firstPassRate: number;
  /** Share generated on attempt 1 or 2: the PRD's "pass within one regeneration" objective. */
  withinRegenerationRate: number;
  /** Slots discarded after two gate failures. */
  discarded: number;
  /** Failed checks across this version's gate failures, most frequent first. */
  failedChecks: Array<{ check: string; count: number }>;
  /** Means over the passing attempts; null when none passed. */
  passingMeans: {
    wordCount: number;
    meanSentenceLength: number;
    typeTokenRatio: number;
    outOfFrequencyRatio: number;
  } | null;
}

export interface GenerationStats {
  versions: PromptVersionStats[];
  runs: number;
  abandoned: Record<string, number>;
}

interface GateNumbers {
  word_count?: number;
  mean_sentence_length?: number;
  type_token_ratio?: number;
  out_of_frequency_ratio?: number;
}

const GATE_OUTCOMES = new Set(['passed', 'gate_failed']);

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * The curator's view of the gate per prompt version (spec §5): how often the
 * first draft passes, how often the one regeneration rescues it, what fails
 * most, and what passing items measure. A slot is counted under the version
 * its first attempt ran with. Slots that never reached the gate (abandoned
 * before a call, or only transport failures) are left out, since they say
 * nothing about the prompt.
 */
export async function collectGenerationStats(prisma: PrismaClient, now: Date = new Date()): Promise<GenerationStats> {
  const since = new Date(now.getTime() - GENERATION_STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const slots = await prisma.contentGenerationSlot.findMany({
    where: { attempts: { some: { createdAt: { gte: since } } } },
    select: {
      status: true,
      reason: true,
      attempts: {
        orderBy: { attempt: 'asc' },
        select: { attempt: true, promptId: true, promptVersion: true, outcome: true, failedChecks: true, gateMetrics: true },
      },
    },
  });

  const byVersion = new Map<string, { promptId: string; promptVersion: string; judged: typeof slots }>();
  for (const slot of slots) {
    const first = slot.attempts[0];
    if (!first || !slot.attempts.some((attempt) => GATE_OUTCOMES.has(attempt.outcome))) {
      continue;
    }
    const key = `${first.promptId}@${first.promptVersion}`;
    const entry = byVersion.get(key) ?? { promptId: first.promptId, promptVersion: first.promptVersion, judged: [] };
    entry.judged.push(slot);
    byVersion.set(key, entry);
  }

  const versions = [...byVersion.values()]
    .map(({ promptId, promptVersion, judged }): PromptVersionStats => {
      const checks = new Map<string, number>();
      const passing: GateNumbers[] = [];
      for (const slot of judged) {
        for (const attempt of slot.attempts) {
          if (attempt.outcome === 'gate_failed') {
            attempt.failedChecks.forEach((check) => checks.set(check, (checks.get(check) ?? 0) + 1));
          }
          if (attempt.outcome === 'passed') {
            passing.push((attempt.gateMetrics ?? {}) as GateNumbers);
          }
        }
      }
      const numbers = (key: keyof GateNumbers) => passing.flatMap((metrics) => (typeof metrics[key] === 'number' ? [metrics[key]] : []));
      return {
        promptId,
        promptVersion,
        slots: judged.length,
        firstPassRate: judged.filter((slot) => slot.attempts[0]?.outcome === 'passed').length / judged.length,
        withinRegenerationRate: judged.filter((slot) => slot.status === 'generated').length / judged.length,
        discarded: judged.filter((slot) => slot.reason === 'gate_failed_twice').length,
        failedChecks: [...checks.entries()]
          .map(([check, count]) => ({ check, count }))
          .sort((a, b) => b.count - a.count || (a.check < b.check ? -1 : 1)),
        passingMeans:
          passing.length === 0
            ? null
            : {
                wordCount: mean(numbers('word_count')),
                meanSentenceLength: mean(numbers('mean_sentence_length')),
                typeTokenRatio: mean(numbers('type_token_ratio')),
                outOfFrequencyRatio: mean(numbers('out_of_frequency_ratio')),
              },
      };
    })
    .sort((a, b) => (a.promptId < b.promptId ? -1 : a.promptId > b.promptId ? 1 : a.promptVersion.localeCompare(b.promptVersion)));

  const runs = await prisma.contentGenerationRun.groupBy({
    by: ['abandonReason'],
    where: { startedAt: { gte: since } },
    _count: { _all: true },
  });
  const abandoned: Record<string, number> = {};
  let total = 0;
  for (const group of runs) {
    total += group._count._all;
    if (group.abandonReason) {
      abandoned[group.abandonReason] = group._count._all;
    }
  }
  return { versions, runs: total, abandoned };
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

const ABANDON_LABELS: Record<string, string> = {
  credential_missing: 'credential missing',
  credential_rejected: 'credential rejected',
  quota_exhausted: 'quota',
};

/** The Generation section of `content:stats`; empty when no run exists in the window. */
export function renderGenerationStats(stats: GenerationStats): string[] {
  if (stats.runs === 0 && stats.versions.length === 0) {
    return [];
  }
  const rows = stats.versions.map((version) => [
    version.promptId,
    version.promptVersion,
    String(version.slots),
    percent(version.firstPassRate),
    percent(version.withinRegenerationRate),
    String(version.discarded),
    version.failedChecks.slice(0, 3).map((entry) => `${entry.check} ${entry.count}`).join(', ') || '—',
  ]);
  const header = ['prompt', 'ver', 'slots', '1st pass', '≤1 regen', 'discarded', 'most failed checks'];
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column]!.length)));
  const line = (cells: string[]) => cells.map((cell, column) => cell.padEnd(widths[column]!)).join('  ').trimEnd();

  const means = stats.versions.flatMap((version) =>
    version.passingMeans
      ? [
          `Passing means: ${version.promptId} v${version.promptVersion} — ${Math.round(version.passingMeans.wordCount)} words, ` +
            `MSL ${version.passingMeans.meanSentenceLength.toFixed(1)}, TTR ${version.passingMeans.typeTokenRatio.toFixed(2)}, ` +
            `OOF ${(version.passingMeans.outOfFrequencyRatio * 100).toFixed(1)}%`,
        ]
      : [],
  );
  const abandoned = Object.entries(stats.abandoned)
    .map(([reason, count]) => `${count} ${ABANDON_LABELS[reason] ?? reason}`)
    .join(', ');

  return [
    '',
    `Generation by prompt version (last ${GENERATION_STATS_WINDOW_DAYS} days)`,
    ...(rows.length > 0 ? [line(header), ...rows.map(line)] : ['No slot reached the gate yet.']),
    ...means,
    `Runs: ${stats.runs}${abandoned ? ` (abandoned: ${abandoned})` : ''}`,
  ];
}
