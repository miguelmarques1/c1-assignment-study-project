import {
  cefrLevelSchema,
  contentItemTypeSchema,
  contentProvenanceSchema,
  contentSkillSchema,
  type ContentAccent,
  type ContentItemCandidate,
  type ContentItemPayload,
  type ContentItemType,
  type ContentProvenance,
  type ContentSkill,
  type CefrLevel,
  type Question,
} from '@english-quest/shared';
import { Injectable } from '@nestjs/common';
import type { ContentItem, Prisma } from '@prisma/client';
import { z } from 'zod';

import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import {
  DEFAULT_CANDIDATE_LIMIT,
  MAX_CANDIDATE_LIMIT,
  mediaContentTypeOf,
  RECENTLY_SERVED_WINDOW_DAYS,
} from './content-constants';
import { ContentItemRepository, ContentSlugConflictError, type UpsertAction } from './content-item.repository';
import { validateGeneratedInput } from './content-item.validation';

/** Filters are any-of; an omitted or empty list does not filter. */
export interface CandidateQuery {
  userId: string;
  types?: ContentItemType[];
  cefrLevels?: CefrLevel[];
  /** Array overlap: an item matches when it trains at least one of these. */
  skills?: ContentSkill[];
  /** Array overlap: an item matches when it targets at least one of these. */
  targetTags?: string[];
  provenance?: ContentProvenance;
  /** Default 30 (the PRD's rule); `0` turns the recently-served exclusion off. */
  excludeServedWithinDays?: number;
  /** 1–500, default 200. */
  limit?: number;
}

const candidateQuerySchema = z.object({
  userId: z.uuid(),
  types: z.array(contentItemTypeSchema).optional(),
  cefrLevels: z.array(cefrLevelSchema).optional(),
  skills: z.array(contentSkillSchema).optional(),
  targetTags: z.array(z.string()).optional(),
  provenance: contentProvenanceSchema.optional(),
  excludeServedWithinDays: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(MAX_CANDIDATE_LIMIT).optional(),
});

const UUID = z.uuid();

const candidateSelect = {
  id: true,
  slug: true,
  type: true,
  provenance: true,
  cefrLevel: true,
  title: true,
  topic: true,
  accent: true,
  durationSeconds: true,
  wordCount: true,
  skills: true,
  difficulty: true,
  targetTags: true,
} satisfies Prisma.ContentItemSelect;

type CandidateRow = Prisma.ContentItemGetPayload<{ select: typeof candidateSelect }>;

function toCandidate(row: CandidateRow): ContentItemCandidate {
  return {
    id: row.id,
    slug: row.slug,
    type: row.type as ContentItemType,
    provenance: row.provenance as ContentProvenance,
    cefrLevel: row.cefrLevel as CefrLevel,
    title: row.title,
    topic: row.topic,
    accent: row.accent as ContentAccent | null,
    durationSeconds: row.durationSeconds,
    wordCount: row.wordCount,
    skills: row.skills as ContentSkill[],
    difficulty: row.difficulty,
    targetTags: row.targetTags,
  };
}

function toPayload(row: ContentItem): ContentItemPayload {
  return {
    ...toCandidate(row),
    body: row.body,
    questions: row.questions as Question[],
    mediaObjectKey: row.mediaObjectKey,
    mediaContentType: mediaContentTypeOf(row.mediaObjectKey),
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    promptId: row.promptId,
    promptVersion: row.promptVersion,
  };
}

function anyOf<T>(values: T[] | undefined): { in: T[] } | undefined {
  return values && values.length > 0 ? { in: values } : undefined;
}

function overlap(values: string[] | undefined): { hasSome: string[] } | undefined {
  return values && values.length > 0 ? { hasSome: values } : undefined;
}

/**
 * The content bank's one door for the rest of the API (F13). F14 writes
 * generated items through `saveGenerated`; F15 selects by metadata with
 * `findCandidates`, checks ids with `existingIds` and records what a plan
 * served with `recordServed`; F16 resolves full items with `getPayload`.
 *
 * There is deliberately no HTTP route: items have no browsing interface,
 * and a payload carries answer keys that F16 strips before any client sees
 * an activity.
 */
@Injectable()
export class ContentBankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxonomy: ErrorTaxonomyService,
  ) {}

  /**
   * Candidate metadata for plan composition, never bodies or answer keys.
   * Items served to `userId` within the window are excluded, so the same
   * reading does not reappear in consecutive plans. Ordering is
   * deterministic (`created_at DESC, id`); ranking belongs to F15.
   */
  async findCandidates(query: CandidateQuery): Promise<ContentItemCandidate[]> {
    const parsed = candidateQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw AppError.validationFailed(
        parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      );
    }
    const { userId, types, cefrLevels, skills, targetTags, provenance } = parsed.data;
    const windowDays = parsed.data.excludeServedWithinDays ?? RECENTLY_SERVED_WINDOW_DAYS;
    const servedSince = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.contentItem.findMany({
      where: {
        type: anyOf(types),
        cefrLevel: anyOf(cefrLevels),
        skills: overlap(skills),
        targetTags: overlap(targetTags),
        provenance,
        servings: windowDays > 0 ? { none: { userId, servedAt: { gte: servedSince } } } : undefined,
      },
      select: candidateSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: parsed.data.limit ?? DEFAULT_CANDIDATE_LIMIT,
    });
    return rows.map(toCandidate);
  }

  /**
   * Metadata for exactly the ids given, in no particular order, with no
   * served-window exclusion and no bodies (F15: an offer already knows
   * which ids F14's run produced and just needs their candidate shape).
   * An id that no longer exists is silently absent from the result.
   */
  async candidatesFor(ids: readonly string[]): Promise<ContentItemCandidate[]> {
    const unique = [...new Set(ids)].filter((id) => UUID.safeParse(id).success);
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.prisma.contentItem.findMany({ where: { id: { in: unique } }, select: candidateSelect });
    return rows.map(toCandidate);
  }

  /** The full item, answers and explanations included, for F16 to project before a client sees it. */
  async getPayload(itemId: string): Promise<ContentItemPayload> {
    const row = UUID.safeParse(itemId).success
      ? await this.prisma.contentItem.findUnique({ where: { id: itemId } })
      : null;
    if (!row) {
      throw AppError.contentItemNotFound(itemId);
    }
    return toPayload(row);
  }

  /** The subset of `ids` that exist, so F15 can reject invented ids without loading payloads. */
  async existingIds(ids: string[]): Promise<Set<string>> {
    const candidates = [...new Set(ids)].filter((id) => UUID.safeParse(id).success);
    if (candidates.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.contentItem.findMany({ where: { id: { in: candidates } }, select: { id: true } });
    return new Set(rows.map((row) => row.id));
  }

  /**
   * F14's persistence, idempotent by slug and validated by the same
   * chokepoint as the importer (schema, answer keys, taxonomy membership).
   * `VAL001` carries pointer details; `CONTENT002` means the slug belongs to
   * a curated item or to another type, which is never overwritten.
   */
  async saveGenerated(input: unknown): Promise<{ id: string; slug: string; action: UpsertAction }> {
    const validated = validateGeneratedInput(input, this.taxonomy.current());
    if (!validated.ok) {
      throw AppError.validationFailed(validated.issues);
    }
    try {
      const { id, action } = await new ContentItemRepository(this.prisma).upsertGenerated(validated.value);
      return { id, slug: validated.value.slug, action };
    } catch (error) {
      if (error instanceof ContentSlugConflictError) {
        throw AppError.contentSlugConflict(error.slug, error.existingType, error.existingProvenance);
      }
      throw error;
    }
  }

  /**
   * One serving row per item, at `now()`. F15 calls this inside its
   * plan-activation transaction (pass that transaction's client as `tx`), so
   * a failed activation leaves no phantom servings hiding items next time.
   */
  async recordServed(userId: string, itemIds: string[], tx?: Prisma.TransactionClient): Promise<void> {
    const unique = [...new Set(itemIds)];
    if (unique.length === 0) {
      return;
    }
    await (tx ?? this.prisma).contentItemServing.createMany({
      data: unique.map((contentItemId) => ({ userId, contentItemId })),
    });
  }
}
