import type { CuratedItemMeta, GeneratedItemInput, ImportableContentType } from '@english-quest/shared';
import { Prisma, type ContentItem, type PrismaClient } from '@prisma/client';

/** The media half of a listening row: all four set together, or none (a CHECK enforces it). */
export interface StoredMedia {
  objectKey: string;
  checksum: string;
  bytes: number;
  durationSeconds: number;
}

export interface CuratedItemRow {
  type: ImportableContentType;
  slug: string;
  meta: CuratedItemMeta;
  media: StoredMedia | null;
}

export type UpsertAction = 'created' | 'updated';

/**
 * The slug is owned by an item of another type or provenance. It is refused,
 * never overwritten: a plan may already reference that item.
 */
export class ContentSlugConflictError extends Error {
  override readonly name = 'ContentSlugConflictError';
  constructor(
    readonly slug: string,
    readonly existingType: string,
    readonly existingProvenance: string,
  ) {
    super(`slug already used by a ${existingProvenance === 'generated' ? 'generated' : existingType} item`);
  }
}

/** Whitespace tokens, so F15 can estimate reading time without ever loading a body. */
export function countWords(body: string | null | undefined): number | null {
  if (body === null || body === undefined) {
    return null;
  }
  return body.split(/\s+/).filter((token) => token.length > 0).length;
}

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Plain persistence over a Prisma client, so the standalone CLI and the Nest
 * service share one implementation. Every write checks the slug's owner
 * first: the same type and provenance update in place, anything else is a
 * `ContentSlugConflictError`.
 */
export class ContentItemRepository {
  constructor(private readonly prisma: Client) {}

  findBySlug(slug: string): Promise<ContentItem | null> {
    return this.prisma.contentItem.findUnique({ where: { slug } });
  }

  /** The conflict an item of `type` and `provenance` would hit on `existing`, or null when it may take the slug. */
  conflictWith(
    existing: Pick<ContentItem, 'slug' | 'type' | 'provenance'> | null,
    type: string,
    provenance: 'curated' | 'generated',
  ): ContentSlugConflictError | null {
    if (!existing || (existing.type === type && existing.provenance === provenance)) {
      return null;
    }
    return new ContentSlugConflictError(existing.slug, existing.type, existing.provenance);
  }

  async upsertCurated(row: CuratedItemRow): Promise<{ id: string; action: UpsertAction }> {
    const { meta, media } = row;
    const body = meta.body ?? null;
    const data = {
      provenance: 'curated',
      cefrLevel: meta.cefr_level,
      title: meta.title,
      topic: meta.topic,
      accent: meta.accent ?? null,
      durationSeconds: media?.durationSeconds ?? null,
      wordCount: countWords(body),
      skills: meta.skills,
      difficulty: meta.difficulty,
      sourceName: meta.source.name,
      sourceUrl: meta.source.url ?? null,
      body,
      questions: meta.questions as Prisma.InputJsonValue,
      targetTags: meta.target_tags,
      mediaObjectKey: media?.objectKey ?? null,
      mediaChecksum: media?.checksum ?? null,
      mediaBytes: media?.bytes ?? null,
    } satisfies Prisma.ContentItemUpdateInput;

    return this.write(row.slug, row.type, 'curated', data);
  }

  async upsertGenerated(input: GeneratedItemInput): Promise<{ id: string; action: UpsertAction }> {
    const data = {
      provenance: 'generated',
      cefrLevel: input.cefrLevel,
      title: input.title,
      topic: input.topic,
      wordCount: countWords(input.body),
      skills: input.skills,
      difficulty: input.difficulty,
      body: input.body,
      questions: input.questions as Prisma.InputJsonValue,
      targetTags: input.targetTags,
      promptId: input.promptId,
      promptVersion: input.promptVersion,
      gateMetrics: input.gateMetrics as Prisma.InputJsonValue,
    } satisfies Prisma.ContentItemUpdateInput;

    return this.write(input.slug, input.type, 'generated', data);
  }

  /** Every curated item of the given types, for the report of items whose folder is gone. */
  listCurated(types: readonly string[]): Promise<Array<{ slug: string; type: string }>> {
    return this.prisma.contentItem.findMany({
      where: { provenance: 'curated', type: { in: [...types] } },
      select: { slug: true, type: true },
      orderBy: { slug: 'asc' },
    });
  }

  /**
   * Updates by id only after the owner check, and creates otherwise. A
   * concurrent create of the same slug surfaces as a unique violation, which
   * is re-resolved once against the row that won.
   */
  private async write(
    slug: string,
    type: string,
    provenance: 'curated' | 'generated',
    data: Omit<Prisma.ContentItemCreateInput, 'slug' | 'type'>,
    attempt = 0,
  ): Promise<{ id: string; action: UpsertAction }> {
    const existing = await this.findBySlug(slug);
    const conflict = this.conflictWith(existing, type, provenance);
    if (conflict) {
      throw conflict;
    }
    if (existing) {
      await this.prisma.contentItem.update({ where: { id: existing.id }, data });
      return { id: existing.id, action: 'updated' };
    }
    try {
      const created = await this.prisma.contentItem.create({ data: { ...data, slug, type }, select: { id: true } });
      return { id: created.id, action: 'created' };
    } catch (error) {
      if (attempt === 0 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.write(slug, type, provenance, data, 1);
      }
      throw error;
    }
  }
}
