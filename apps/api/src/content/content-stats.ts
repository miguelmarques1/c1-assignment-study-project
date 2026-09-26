import type { PrismaClient } from '@prisma/client';

import type { LoadedErrorTaxonomy } from '../taxonomy/error-taxonomy';
import { formatSize } from './import/media-probe';

/** The PRD's MVP corpus target for curated listening (F13). */
export const CORPUS_TARGET = {
  listeningItems: 20,
  distinctAccents: 3,
  difficulties: [3, 4, 5],
} as const;

const CONTENT_TYPES = ['listening', 'reading', 'vocabulary', 'grammar', 'error_review'] as const;

export interface CorpusCheck {
  met: boolean;
  line: string;
}

export interface ServedItem {
  slug: string;
  type: string;
  servings: number;
  distinctUsers: number;
  lastServedAt: Date;
}

export interface ContentStats {
  total: number;
  byTypeAndProvenance: Array<{ type: string; curated: number; generated: number }>;
  byCefrLevel: Array<{ level: string; count: number }>;
  byDifficulty: Array<{ difficulty: number; count: number }>;
  /** Listening only: the one type that has an accent. */
  byAccent: Array<{ accent: string; count: number }>;
  media: { objects: number; bytes: number };
  corpusTarget: CorpusCheck[];
  served: ServedItem[];
  neverServed: string[];
  /** Items carrying tags the taxonomy in force no longer lists. History, not corruption. */
  taxonomyDrift: Array<{ slug: string; provenance: string; tags: string[] }>;
  taxonomyVersion: string;
}

function evaluateCorpus(listening: Array<{ accent: string | null; difficulty: number }>): CorpusCheck[] {
  const accents = [...new Set(listening.map((item) => item.accent).filter((accent): accent is string => !!accent))].sort();
  const covered = new Set(listening.map((item) => item.difficulty));
  const missing = CORPUS_TARGET.difficulties.filter((difficulty) => !covered.has(difficulty));

  return [
    {
      met: listening.length >= CORPUS_TARGET.listeningItems,
      line: `${listening.length} listening item${listening.length === 1 ? '' : 's'} (target: at least ${CORPUS_TARGET.listeningItems})`,
    },
    {
      met: accents.length >= CORPUS_TARGET.distinctAccents,
      line: `${accents.length} distinct accent${accents.length === 1 ? '' : 's'}${accents.length ? `: ${accents.join(', ')}` : ''} (target: at least ${CORPUS_TARGET.distinctAccents})`,
    },
    {
      met: missing.length === 0,
      line:
        missing.length === 0
          ? 'listening at difficulty 3, 4 and 5 (target: at least one at each)'
          : `no listening item at difficulty ${missing.join(', ')} (target: at least one at each of 3, 4 and 5)`,
    },
  ];
}

/** Everything `content:stats` reports. Read-only, and only over data F13 owns. */
export async function collectContentStats(prisma: PrismaClient, taxonomy: LoadedErrorTaxonomy): Promise<ContentStats> {
  const [typeGroups, levelGroups, difficultyGroups, accentGroups, media, listening, servingRows, neverServed] =
    await Promise.all([
      prisma.contentItem.groupBy({ by: ['type', 'provenance'], _count: { _all: true } }),
      prisma.contentItem.groupBy({ by: ['cefrLevel'], _count: { _all: true }, orderBy: { cefrLevel: 'asc' } }),
      prisma.contentItem.groupBy({ by: ['difficulty'], _count: { _all: true }, orderBy: { difficulty: 'asc' } }),
      prisma.contentItem.groupBy({
        by: ['accent'],
        where: { type: 'listening' },
        _count: { _all: true },
        orderBy: { accent: 'asc' },
      }),
      prisma.contentItem.aggregate({ _sum: { mediaBytes: true }, _count: { mediaObjectKey: true } }),
      prisma.contentItem.findMany({ where: { type: 'listening' }, select: { accent: true, difficulty: true } }),
      prisma.$queryRaw<Array<{ slug: string; type: string; servings: number; users: number; last: Date }>>`
        SELECT c.slug, c.type, COUNT(*)::int AS servings, COUNT(DISTINCT s.user_id)::int AS users, MAX(s.served_at) AS last
        FROM content_item_serving s
        JOIN content_item c ON c.id = s.content_item_id
        GROUP BY c.id, c.slug, c.type
        ORDER BY servings DESC, c.slug ASC
      `,
      prisma.contentItem.findMany({ where: { servings: { none: {} } }, select: { slug: true }, orderBy: { slug: 'asc' } }),
    ]);

  const inForce = taxonomy.tags.map((entry) => entry.tag);
  const drifted = await prisma.$queryRaw<Array<{ slug: string; provenance: string; target_tags: string[] }>>`
    SELECT slug, provenance, target_tags FROM content_item
    WHERE NOT (target_tags <@ ${inForce}::text[])
    ORDER BY slug
  `;
  const inForceSet = new Set(inForce);

  const byType = new Map<string, { type: string; curated: number; generated: number }>();
  for (const group of typeGroups) {
    const entry = byType.get(group.type) ?? { type: group.type, curated: 0, generated: 0 };
    entry[group.provenance === 'generated' ? 'generated' : 'curated'] += group._count._all;
    byType.set(group.type, entry);
  }

  return {
    total: typeGroups.reduce((sum, group) => sum + group._count._all, 0),
    byTypeAndProvenance: CONTENT_TYPES.filter((type) => byType.has(type)).map((type) => byType.get(type)!),
    byCefrLevel: levelGroups.map((group) => ({ level: group.cefrLevel, count: group._count._all })),
    byDifficulty: difficultyGroups.map((group) => ({ difficulty: group.difficulty, count: group._count._all })),
    byAccent: accentGroups.map((group) => ({ accent: group.accent ?? '(none)', count: group._count._all })),
    media: { objects: media._count.mediaObjectKey, bytes: media._sum.mediaBytes ?? 0 },
    corpusTarget: evaluateCorpus(listening),
    served: servingRows.map((row) => ({
      slug: row.slug,
      type: row.type,
      servings: row.servings,
      distinctUsers: row.users,
      lastServedAt: row.last,
    })),
    neverServed: neverServed.map((row) => row.slug),
    taxonomyDrift: drifted.map((row) => ({
      slug: row.slug,
      provenance: row.provenance,
      tags: row.target_tags.filter((tag) => !inForceSet.has(tag)),
    })),
    taxonomyVersion: taxonomy.version,
  };
}

/** `3 days ago`, `5 hours ago`, `just now`. */
export function relativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  const units: Array<[string, number]> = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    const count = Math.floor(seconds / size);
    if (count >= 1) {
      return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
}

/** Aligned plain-text columns; counts are right-aligned, text left-aligned. */
function columns(rows: string[][], numeric: readonly number[]): string[] {
  const widths = rows[0]!.map((_, index) => Math.max(...rows.map((row) => row[index]!.length)));
  return rows.map((row) =>
    row
      .map((cell, index) => (numeric.includes(index) ? cell.padStart(widths[index]!) : cell.padEnd(widths[index]!)))
      .join('  ')
      .trimEnd(),
  );
}

function inline(entries: Array<[string | number, number]>): string {
  return entries.length === 0 ? '—' : entries.map(([key, count]) => `${key}: ${count}`).join(' · ');
}

export function renderContentStats(stats: ContentStats, now: Date = new Date()): string[] {
  const lines: string[] = [];
  lines.push(`Content bank: ${stats.total} item${stats.total === 1 ? '' : 's'}`, '', 'Inventory');

  if (stats.byTypeAndProvenance.length > 0) {
    const table = columns([
      ['type', 'curated', 'generated', 'total'],
      ...stats.byTypeAndProvenance.map((row) => [
        row.type,
        String(row.curated),
        String(row.generated),
        String(row.curated + row.generated),
      ]),
    ], [1, 2, 3]);
    lines.push(...table.map((line) => `  ${line}`));
  }
  lines.push(
    `  By CEFR level: ${inline(stats.byCefrLevel.map((row) => [row.level, row.count]))}`,
    `  By difficulty: ${inline(stats.byDifficulty.map((row) => [row.difficulty, row.count]))}`,
    `  By accent (listening): ${inline(stats.byAccent.map((row) => [row.accent, row.count]))}`,
    `  Stored media: ${stats.media.objects} object${stats.media.objects === 1 ? '' : 's'}, ${formatSize(stats.media.bytes)}`,
    '',
    'Corpus target (PRD F13)',
    ...stats.corpusTarget.map((check) => `  ${check.met ? '✓' : '✗'} ${check.line}`),
    '',
    'Usage',
  );

  if (stats.served.length === 0) {
    lines.push('  No item has been served yet.');
  } else {
    const table = columns([
      ['slug', 'type', 'served', 'users', 'last served'],
      ...stats.served.map((row) => [
        row.slug,
        row.type,
        String(row.servings),
        String(row.distinctUsers),
        relativeTime(row.lastServedAt, now),
      ]),
    ], [2, 3]);
    lines.push(...table.map((line) => `  ${line}`));
  }
  lines.push(
    stats.neverServed.length === 0
      ? '  Every item has been served at least once.'
      : `  Never served (${stats.neverServed.length}): ${stats.neverServed.join(', ')}`,
  );

  if (stats.taxonomyDrift.length > 0) {
    lines.push('', `Taxonomy drift (tags not in error taxonomy v${stats.taxonomyVersion})`);
    lines.push(
      ...stats.taxonomyDrift.map((row) => `  ${row.slug} (${row.provenance}): ${row.tags.join(', ')}`),
      '  Curated items fail their next re-import until retagged.',
    );
  }

  return lines;
}
