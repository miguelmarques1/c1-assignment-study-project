import { z } from 'zod';

export interface LessonCursor {
  startedAt: Date;
  id: string;
}

const cursorPayloadSchema = z.object({
  s: z.iso.datetime(),
  i: z.uuid(),
});

/**
 * The keyset position after a page (F19, A7): the last row's
 * `(started_at, id)`, as base64url JSON. Opaque to clients, which only ever
 * hand back the `nextCursor` they were given.
 */
export function encodeCursor(cursor: LessonCursor): string {
  return Buffer.from(JSON.stringify({ s: cursor.startedAt.toISOString(), i: cursor.id }), 'utf8').toString('base64url');
}

/** The position a cursor encodes, or null for anything this API did not produce. */
export function decodeCursor(text: string): LessonCursor | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = cursorPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  return { startedAt: new Date(parsed.data.s), id: parsed.data.i };
}
