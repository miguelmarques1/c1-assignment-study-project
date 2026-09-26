import { z } from 'zod';

/**
 * The content bank's contract (F13). One definition serves three doors: the
 * curator's `meta.json` (snake_case, a file format mirroring the PRD's
 * columns), F14's generated items (camelCase, a code contract) and the
 * candidate and payload shapes F15 and F16 read back. Membership of
 * `target_tags` in the error taxonomy is checked API-side, against the file
 * in force, and never here: the taxonomy's spelling rules belong to F11/F12.
 */

export const contentItemTypeSchema = z.enum(['listening', 'reading', 'vocabulary', 'grammar', 'error_review']);
export type ContentItemType = z.infer<typeof contentItemTypeSchema>;

/** Types a curator can import from `assignment-content/<type>/`. `error_review` only ever comes from F14. */
export const importableContentTypeSchema = z.enum(['listening', 'reading', 'vocabulary', 'grammar']);
export type ImportableContentType = z.infer<typeof importableContentTypeSchema>;

/** Types F14 can generate. Listening is never generated: it needs authentic audio. */
export const generatedContentTypeSchema = z.enum(['reading', 'vocabulary', 'grammar', 'error_review'], {
  error: 'must be one of reading, vocabulary, grammar, error_review (listening is never generated)',
});
export type GeneratedContentType = z.infer<typeof generatedContentTypeSchema>;

export const contentProvenanceSchema = z.enum(['curated', 'generated']);
export type ContentProvenance = z.infer<typeof contentProvenanceSchema>;

export const cefrLevelSchema = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
export type CefrLevel = z.infer<typeof cefrLevelSchema>;

/** A controlled vocabulary, because the corpus target counts distinct accents and free text would fragment them. */
export const contentAccentSchema = z.enum([
  'american',
  'british',
  'australian',
  'canadian',
  'irish',
  'scottish',
  'new_zealand',
  'south_african',
  'indian',
  'other',
]);
export type ContentAccent = z.infer<typeof contentAccentSchema>;

/** The skills a bank item can train. Speaking and writing are F17/F18 tasks, not bank items. */
export const contentSkillSchema = z.enum(['listening', 'reading', 'vocabulary', 'grammar']);
export type ContentSkill = z.infer<typeof contentSkillSchema>;

export const questionFormatSchema = z.enum(['multiple_choice', 'fill_blank', 'ordering', 'matching']);
export type QuestionFormat = z.infer<typeof questionFormatSchema>;

/** The idempotency key for both the importer and `saveGenerated`, unique across types and provenances. */
export const CONTENT_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const CONTENT_SLUG_MAX_LENGTH = 80;
export const QUESTIONS_PER_ITEM = 5;
export const CONTENT_BODY_MAX_LENGTH = 20_000;
/** A run of three or more underscores marks the one blank of a `fill_blank` prompt. */
const BLANK_MARKER = /_{3,}/g;

function text(max: number) {
  return z.string().trim().min(1, 'must not be empty').max(max, `must be at most ${max} characters`);
}

/** Compared trimmed and case-insensitively: `Paris` and ` paris` would make a text answer ambiguous. */
function hasDuplicates(values: string[]): boolean {
  const seen = new Set(values.map((value) => value.trim().toLowerCase()));
  return seen.size !== values.length;
}

function uniqueList<T extends z.ZodType<string>>(item: T, min: number, max: number, noun: string) {
  return z
    .array(item)
    .min(min, `must contain at least ${min} ${noun}`)
    .max(max, `must contain at most ${max} ${noun}`)
    .refine((values) => !hasDuplicates(values), 'must not contain duplicates')
    .meta({ uniqueItems: true });
}

export const contentSlugField = z
  .string()
  .max(CONTENT_SLUG_MAX_LENGTH, `must be at most ${CONTENT_SLUG_MAX_LENGTH} characters`)
  .regex(CONTENT_SLUG_PATTERN, 'must be lowercase letters and digits separated by single hyphens');

/** 1–10 unique tags. Whether each one is in the error taxonomy in force is the API's check, not this schema's. */
export const targetTagsField = z
  .array(z.string().trim().min(1, 'must not be empty').max(64, 'must be at most 64 characters'))
  .min(1, 'must contain at least 1 tag')
  .max(10, 'must contain at most 10 tags')
  .refine((tags) => new Set(tags).size === tags.length, 'must not contain duplicates')
  .meta({ uniqueItems: true, description: 'Error taxonomy tags this item trains, e.g. grammar:conditional-3' });

const skillsField = uniqueList(contentSkillSchema, 1, 4, 'skills');

const difficultyField = z
  .number()
  .int('must be an integer')
  .min(1, 'must be between 1 and 5')
  .max(5, 'must be between 1 and 5');

const bodyField = text(CONTENT_BODY_MAX_LENGTH);

const promptField = text(500);
const explanationField = text(1000).meta({
  description: 'Shown after the activity is submitted, whatever the answer was',
});
const choiceField = text(300);
const indexField = z.number().int('must be an integer').min(0, 'must not be negative');

// ---------------------------------------------------------------------------
// Questions. Each format's own shape lives on its schema; the answer key is
// checked by `questionsField`, which knows each question's index and can name
// the sibling field by its absolute pointer, as the PRD's wording requires
// (`/questions/2/answer must be one of /questions/2/options`).
// ---------------------------------------------------------------------------

export const multipleChoiceQuestionSchema = z.strictObject({
  format: z.literal('multiple_choice'),
  prompt: promptField,
  options: z
    .array(choiceField)
    .length(4, 'must contain exactly 4 options')
    .refine((options) => !hasDuplicates(options), 'must not contain duplicates'),
  /** The correct option's text, exactly as it appears in `options`. */
  answer: choiceField,
  explanation: explanationField,
});

export const fillBlankQuestionSchema = z.strictObject({
  format: z.literal('fill_blank'),
  prompt: promptField.refine(
    (prompt) => (prompt.match(BLANK_MARKER) ?? []).length === 1,
    'must contain exactly one blank (___)',
  ),
  /** Accepted variants, matched case-insensitively and ignoring surrounding whitespace (F16). */
  answer: uniqueList(text(100), 1, 5, 'accepted answers'),
  explanation: explanationField,
});

export const orderingQuestionSchema = z.strictObject({
  format: z.literal('ordering'),
  prompt: promptField,
  /** Shown in this order. */
  segments: uniqueList(choiceField, 3, 8, 'segments'),
  /** `answer[k]` is the index in `segments` of the k-th item in the correct order. */
  answer: z.array(indexField),
  explanation: explanationField,
});

export const matchingQuestionSchema = z
  .strictObject({
    format: z.literal('matching'),
    prompt: promptField,
    left: uniqueList(choiceField, 3, 6, 'items'),
    right: uniqueList(choiceField, 3, 6, 'items'),
    /** `answer[i]` is the index in `right` paired with `left[i]`. */
    answer: z.array(indexField),
    explanation: explanationField,
  })
  .superRefine((question, ctx) => {
    if (question.left.length !== question.right.length) {
      ctx.addIssue({ code: 'custom', path: ['right'], message: 'must have as many items as left' });
    }
  });

export const questionSchema = z.discriminatedUnion(
  'format',
  [multipleChoiceQuestionSchema, fillBlankQuestionSchema, orderingQuestionSchema, matchingQuestionSchema],
  { error: 'must have a format of multiple_choice, fill_blank, ordering or matching' },
);
export type Question = z.infer<typeof questionSchema>;

function isPermutation(answer: number[], size: number): boolean {
  return answer.length === size && new Set(answer).size === size && answer.every((index) => index >= 0 && index < size);
}

function isIdentity(answer: number[]): boolean {
  return answer.every((value, index) => value === index);
}

/**
 * The answer-key rules for one question at `index`, as `[path, message]`
 * relative to the questions array. A malformed key produces an activity that
 * can never be answered correctly, and is invisible until a user hits it.
 */
export function answerKeyIssues(question: Question, index: number): Array<{ path: (string | number)[]; message: string }> {
  const pointer = `/questions/${index}`;
  switch (question.format) {
    case 'multiple_choice':
      return question.options.includes(question.answer)
        ? []
        : [{ path: [index, 'answer'], message: `must be one of ${pointer}/options` }];
    case 'fill_blank':
      return [];
    case 'ordering':
      if (!isPermutation(question.answer, question.segments.length)) {
        return [{ path: [index, 'answer'], message: `must be a permutation of the indexes of ${pointer}/segments` }];
      }
      return isIdentity(question.answer)
        ? [{ path: [index, 'answer'], message: 'must differ from the displayed order' }]
        : [];
    case 'matching':
      if (question.answer.length !== question.left.length || !isPermutation(question.answer, question.right.length)) {
        return [{ path: [index, 'answer'], message: 'must pair every left item with exactly one right item' }];
      }
      return isIdentity(question.answer)
        ? [{ path: [index, 'answer'], message: 'must differ from the displayed order' }]
        : [];
  }
}

export const questionsField = z
  .array(questionSchema)
  .length(QUESTIONS_PER_ITEM, `must contain exactly ${QUESTIONS_PER_ITEM} questions`)
  .superRefine((questions, ctx) => {
    questions.forEach((question, index) => {
      for (const issue of answerKeyIssues(question, index)) {
        ctx.addIssue({ code: 'custom', ...issue });
      }
    });
  });

// ---------------------------------------------------------------------------
// Curated `meta.json`, one strict schema per importable type. `type` and
// `slug` come from the folder path and `provenance` is always `curated`, so
// none of the three is a field here.
// ---------------------------------------------------------------------------

export const contentSourceSchema = z.strictObject({
  name: text(200),
  url: z.url({ protocol: /^https?$/, error: 'must be an http(s) URL' }).max(2048, 'must be at most 2048 characters').optional(),
});

function skillsIncluding(type: ContentSkill) {
  return skillsField.refine((skills) => skills.includes(type), `must include "${type}"`);
}

/** Present on a non-listening `meta.json`, `accent` is an error rather than an ignored key. */
const listeningOnly = z.never({ error: 'is only allowed for listening items' }).optional();

function curatedItemMetaSchema<A extends z.ZodType, B extends z.ZodType>(type: ImportableContentType, accent: A, body: B) {
  return z.strictObject({
    /** Points the editor at `../meta.schema.json`; ignored by the importer. */
    $schema: z.string().optional(),
    title: text(200).meta({ description: 'Display title' }),
    cefr_level: cefrLevelSchema,
    topic: text(80).meta({ description: 'Free topic label, e.g. climate policy' }),
    accent,
    skills: skillsIncluding(type),
    difficulty: difficultyField,
    source: contentSourceSchema.meta({ description: 'Attribution for the original material' }),
    body,
    questions: questionsField,
    target_tags: targetTagsField,
  });
}

export const curatedItemMetaSchemas = {
  listening: curatedItemMetaSchema(
    'listening',
    contentAccentSchema,
    bodyField.meta({ description: 'The transcript, revealed after submission' }),
  ),
  reading: curatedItemMetaSchema('reading', listeningOnly, bodyField.meta({ description: 'The reading text' })),
  vocabulary: curatedItemMetaSchema('vocabulary', listeningOnly, bodyField.optional()),
  grammar: curatedItemMetaSchema('grammar', listeningOnly, bodyField.optional()),
};

export function curatedItemMetaSchemaFor(type: ImportableContentType) {
  return curatedItemMetaSchemas[type];
}

export type CuratedItemMeta = z.infer<(typeof curatedItemMetaSchemas)[ImportableContentType]>;

/**
 * The JSON Schema form of a type's `meta.json`, for the curator's editor.
 * Emitted here rather than by the caller because `.meta()` descriptions live
 * in the registry of the Zod instance that built the schema.
 */
export function curatedItemMetaJsonSchema(type: ImportableContentType): Record<string, unknown> {
  return z.toJSONSchema(curatedItemMetaSchemas[type], { io: 'input' }) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Generated items (F14 → `ContentBankService.saveGenerated`).
// ---------------------------------------------------------------------------

export const generatedItemInputSchema = z
  .strictObject({
    slug: contentSlugField,
    type: generatedContentTypeSchema,
    cefrLevel: cefrLevelSchema,
    title: text(200),
    topic: text(80),
    skills: skillsField,
    difficulty: difficultyField,
    body: bodyField,
    questions: questionsField,
    targetTags: targetTagsField,
    promptId: text(64),
    promptVersion: text(16),
    /** F14's difficulty-gate measurements. Opaque to F13, which stores and returns them. */
    gateMetrics: z
      .record(z.string(), z.unknown())
      .refine((metrics) => Object.keys(metrics).length > 0, 'must not be empty'),
  })
  .superRefine((input, ctx) => {
    if (input.type !== 'error_review' && !input.skills.includes(input.type)) {
      ctx.addIssue({ code: 'custom', path: ['skills'], message: `must include "${input.type}"` });
    }
  });
export type GeneratedItemInput = z.infer<typeof generatedItemInputSchema>;

// ---------------------------------------------------------------------------
// What the bank hands back. Candidates carry metadata only (F15 never loads
// bodies); a payload is the full item, answer keys included, for F16 to
// project before any client sees it.
// ---------------------------------------------------------------------------

export const contentItemCandidateSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  type: contentItemTypeSchema,
  provenance: contentProvenanceSchema,
  cefrLevel: cefrLevelSchema,
  title: z.string(),
  topic: z.string(),
  accent: contentAccentSchema.nullable(),
  durationSeconds: z.number().int().nullable(),
  wordCount: z.number().int().nullable(),
  skills: z.array(contentSkillSchema),
  difficulty: z.number().int(),
  targetTags: z.array(z.string()),
});
export type ContentItemCandidate = z.infer<typeof contentItemCandidateSchema>;

export const contentItemPayloadSchema = contentItemCandidateSchema.extend({
  body: z.string().nullable(),
  questions: z.array(questionSchema),
  mediaObjectKey: z.string().nullable(),
  /** Derived from the key's extension, not stored. */
  mediaContentType: z.string().nullable(),
  sourceName: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  /** Null for curated items. F16 stores difficulty ratings against the prompt version. */
  promptId: z.string().nullable(),
  promptVersion: z.string().nullable(),
});
export type ContentItemPayload = z.infer<typeof contentItemPayloadSchema>;
