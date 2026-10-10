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

// ---------------------------------------------------------------------------
// F16's curator signals: what learners said about difficulty, and which
// questions the runner could not correct. The curator has no admin UI, so
// this report is where both are read (spec A28).
// ---------------------------------------------------------------------------

export interface RatingsByPromptVersion {
  /** `promptId@promptVersion` for a generated item, `curated` for the rest. */
  source: string;
  rated: number;
  tooEasy: number;
  justRight: number;
  tooHard: number;
  notUseful: number;
}

export interface UncorrectableItem {
  slug: string;
  /** 1-based question numbers. */
  questions: number[];
  attempts: number;
  lastSeen: Date;
}

export interface ActivityStats {
  ratings: RatingsByPromptVersion[];
  /** Questions whose answer key failed validation: a defect to fix with a re-import. */
  uncorrectable: UncorrectableItem[];
  /** Ordering and matching questions that F16 Core leaves unscored: not defects. */
  waitingForFullScope: { items: number; questions: number };
}

export async function collectActivityStats(prisma: PrismaClient, since: Date): Promise<ActivityStats> {
  const [ratingRows, unscoredRows] = await Promise.all([
    prisma.$queryRaw<
      Array<{ source: string; rated: number; too_easy: number; just_right: number; too_hard: number; not_useful: number }>
    >`
      SELECT COALESCE(prompt_id || '@' || prompt_version, 'curated') AS source,
             COUNT(*)::int AS rated,
             COUNT(*) FILTER (WHERE difficulty_rating = 'too_easy')::int AS too_easy,
             COUNT(*) FILTER (WHERE difficulty_rating = 'just_right')::int AS just_right,
             COUNT(*) FILTER (WHERE difficulty_rating = 'too_hard')::int AS too_hard,
             COUNT(*) FILTER (WHERE not_useful)::int AS not_useful
      FROM objective_attempts
      WHERE rated_at IS NOT NULL AND rated_at >= ${since}
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<Array<{ slug: string; reason: string; questions: number[]; attempts: number; last: Date }>>`
      SELECT c.slug,
             r->>'unscoredReason' AS reason,
             ARRAY_AGG(DISTINCT ((r->>'index')::int + 1) ORDER BY ((r->>'index')::int + 1)) AS questions,
             COUNT(DISTINCT a.id)::int AS attempts,
             MAX(a.submitted_at) AS last
      FROM objective_attempts a
      JOIN content_item c ON c.id = a.content_item_id
      CROSS JOIN LATERAL jsonb_array_elements(a.results) AS r
      WHERE a.status = 'submitted' AND a.submitted_at >= ${since} AND r->>'outcome' = 'unscored'
      GROUP BY c.slug, r->>'unscoredReason'
      ORDER BY c.slug
    `,
  ]);

  const waiting = unscoredRows.filter((row) => row.reason === 'format_unavailable');
  return {
    ratings: ratingRows.map((row) => ({
      source: row.source,
      rated: row.rated,
      tooEasy: row.too_easy,
      justRight: row.just_right,
      tooHard: row.too_hard,
      notUseful: row.not_useful,
    })),
    uncorrectable: unscoredRows
      .filter((row) => row.reason === 'answer_key_invalid')
      .map((row) => ({ slug: row.slug, questions: row.questions, attempts: row.attempts, lastSeen: row.last })),
    waitingForFullScope: {
      items: new Set(waiting.map((row) => row.slug)).size,
      questions: waiting.reduce((sum, row) => sum + row.questions.length, 0),
    },
  };
}

function share(count: number, of: number): string {
  return of === 0 ? '—' : `${Math.round((100 * count) / of)}%`;
}

export function renderActivityStats(stats: ActivityStats, windowDays: number, now: Date = new Date()): string[] {
  const lines: string[] = ['', `Difficulty ratings by prompt version (last ${windowDays} days)`];
  if (stats.ratings.length === 0) {
    lines.push('  No activity has been rated yet.');
  } else {
    const table = columns(
      [
        ['source', 'rated', 'too easy', 'just right', 'too hard', 'not useful'],
        ...stats.ratings.map((row) => {
          const judged = row.tooEasy + row.justRight + row.tooHard;
          return [row.source, String(row.rated), share(row.tooEasy, judged), share(row.justRight, judged), share(row.tooHard, judged), String(row.notUseful)];
        }),
      ],
      [1, 2, 3, 4, 5],
    );
    lines.push(...table.map((line) => `  ${line}`));
  }

  lines.push('', `Questions that could not be corrected (last ${windowDays} days)`);
  if (stats.uncorrectable.length === 0) {
    lines.push('  None. Every answer key was valid when it was used.');
  } else {
    const table = columns(
      [
        ['slug', 'questions', 'attempts', 'last seen'],
        ...stats.uncorrectable.map((row) => [row.slug, row.questions.join(', '), String(row.attempts), relativeTime(row.lastSeen, now)]),
      ],
      [2],
    );
    lines.push(...table.map((line) => `  ${line}`));
    lines.push('  Fix the key in meta.json and re-import. Attempts already started keep their snapshot.');
  }
  if (stats.waitingForFullScope.questions > 0) {
    const { items, questions } = stats.waitingForFullScope;
    lines.push(
      `  ${questions} ordering or matching question${questions === 1 ? '' : 's'} in ${items} item${items === 1 ? '' : 's'} waiting for F16 Full (shown unscored, not defects).`,
    );
  }
  return lines;
}
