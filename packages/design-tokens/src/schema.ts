import { z } from 'zod';

const hexColor = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, 'must be a 6-digit lowercase hex colour, e.g. #a1b2c3');

const cssLength = z
  .string()
  .regex(/^-?\d+(\.\d+)?(px|rem)$/, 'must be a px or rem length, e.g. N.Nrem or Npx');

const cssDuration = z.string().regex(/^\d+ms$/, 'must be a millisecond duration, e.g. 120ms');

const colorRoleMap = z.record(z.string(), hexColor);

const typeStep = z.object({
  size: z.string().regex(/^\d+(\.\d+)?px$/, 'font size must be in px'),
  lineHeight: z.string().regex(/^\d+(\.\d+)?px$/, 'line height must be in px'),
  weight: z.number().int().min(100).max(900),
});

const semanticPairKind = z.enum(['reading', 'border']);

export const KIND_THRESHOLD: Record<z.infer<typeof semanticPairKind>, number> = {
  reading: 4.5,
  border: 3.0,
};

const semanticPair = z.object({
  name: z.string().min(1),
  fg: z.string().min(1),
  bg: z.string().min(1),
  kind: semanticPairKind,
  min: z.number().positive(),
});

const contrastExemption = z.object({
  pair: z.string().min(1),
  ratio: z.number().positive(),
  reason: z.string().min(1, 'an exemption must record why it exists'),
});

export const tokensSchema = z.object({
  meta: z.object({
    source: z.string().min(1),
    fontFamily: z.string().min(1),
  }),
  color: z.object({
    light: colorRoleMap,
    dark: colorRoleMap,
  }),
  type: z.record(z.string(), typeStep),
  spacing: z.record(z.string(), cssLength),
  radius: z.record(z.string(), cssLength),
  shadow: z.object({
    light: z.record(z.string(), z.string().min(1)),
    dark: z.record(z.string(), z.string().min(1)),
  }),
  motion: z.record(z.string(), cssDuration.or(z.string().startsWith('cubic-bezier('))),
  semanticPairs: z.array(semanticPair),
  contrastExemptions: z.array(contrastExemption),
});

export type Tokens = z.infer<typeof tokensSchema>;
export type SemanticPair = z.infer<typeof semanticPair>;
export type ContrastExemption = z.infer<typeof contrastExemption>;

/**
 * Cross-field invariants Zod's shape validation cannot express on its own:
 * role parity between themes, pairs referencing roles that actually exist,
 * shadow keys matching between themes, and a kind's min matching its
 * registered threshold. Returns every problem found rather than the first,
 * so a single run reports the whole list.
 */
export function crossValidate(tokens: Tokens): string[] {
  const issues: string[] = [];

  const lightRoles = new Set(Object.keys(tokens.color.light));
  const darkRoles = new Set(Object.keys(tokens.color.dark));

  for (const role of lightRoles) {
    if (!darkRoles.has(role)) {
      issues.push(`color role "${role}" is defined in light but missing in dark`);
    }
  }
  for (const role of darkRoles) {
    if (!lightRoles.has(role)) {
      issues.push(`color role "${role}" is defined in dark but missing in light`);
    }
  }

  const lightShadowKeys = new Set(Object.keys(tokens.shadow.light));
  const darkShadowKeys = new Set(Object.keys(tokens.shadow.dark));
  for (const key of lightShadowKeys) {
    if (!darkShadowKeys.has(key)) {
      issues.push(`shadow "${key}" is defined in light but missing in dark`);
    }
  }
  for (const key of darkShadowKeys) {
    if (!lightShadowKeys.has(key)) {
      issues.push(`shadow "${key}" is defined in dark but missing in light`);
    }
  }

  for (const pair of tokens.semanticPairs) {
    if (!lightRoles.has(pair.fg)) {
      issues.push(`semantic pair "${pair.name}" references undeclared foreground role "${pair.fg}"`);
    }
    if (!lightRoles.has(pair.bg)) {
      issues.push(`semantic pair "${pair.name}" references undeclared background role "${pair.bg}"`);
    }
    const expectedMin = KIND_THRESHOLD[pair.kind];
    if (pair.min !== expectedMin) {
      issues.push(
        `semantic pair "${pair.name}" declares min ${pair.min} but kind "${pair.kind}" requires ${expectedMin}`,
      );
    }
  }

  const pairNames = new Set(tokens.semanticPairs.map((pair) => pair.name));
  for (const exemption of tokens.contrastExemptions) {
    if (!pairNames.has(exemption.pair)) {
      issues.push(`exemption references unknown pair "${exemption.pair}"`);
    }
  }

  return issues;
}
