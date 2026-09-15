import type { Tokens } from './schema';

const GENERATED_BANNER =
  '// GENERATED FILE — do not edit by hand.\n' +
  '// Source: packages/design-tokens/tokens.json\n' +
  '// Regenerate with `pnpm tokens:build`.\n';

const SPACING_STEP_ORDER = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

function objectLiteral(entries: Record<string, string>): string {
  const lines = Object.entries(entries).map(([key, value]) => `  '${key}': '${value}',`);
  return ['{', ...lines, '} as const'].join('\n');
}

function badgeStatusesFrom(lightRoles: Record<string, string>): string[] {
  const statuses: string[] = [];
  for (const key of Object.keys(lightRoles)) {
    const match = /^badge-(.+)-bg$/.exec(key);
    if (match) statuses.push(match[1]!);
  }
  return statuses;
}

export function emitTs(tokens: Tokens): string {
  const badgeStatuses = badgeStatusesFrom(tokens.color.light);
  const spacingSteps = SPACING_STEP_ORDER.filter((step) => step in tokens.spacing);

  const typeEntries: Record<string, string> = {};
  for (const [step, { size, lineHeight, weight }] of Object.entries(tokens.type)) {
    typeEntries[step] = `${size} / ${lineHeight} / ${weight}`;
  }

  return `${GENERATED_BANNER}
export const fontFamily = '${tokens.meta.fontFamily}';

export const color = ${objectLiteral(tokens.color.light)};

export const darkColor = ${objectLiteral(tokens.color.dark)};

export const spacing = ${objectLiteral(tokens.spacing)};

export const radius = ${objectLiteral(tokens.radius)};

/** Each value is "size / lineHeight / weight", exactly as declared in tokens.json. */
export const typeScale = ${objectLiteral(typeEntries)};

/** Names only — shadow values differ by theme and reference a colour role, so they aren't a static JS value. */
export const shadowNames = [${Object.keys(tokens.shadow.light)
    .map((name) => `'${name}'`)
    .join(', ')}] as const;

export const motion = ${objectLiteral(tokens.motion)};

export type ColorRole = keyof typeof color;
export type ShadowName = (typeof shadowNames)[number];
export type MotionToken = keyof typeof motion;
export type SpacingToken = ${spacingSteps.map((step) => `'${step}'`).join(' | ')};
export type RadiusToken = keyof typeof radius;
export type TypeStep = keyof typeof typeScale;

export type ButtonVariant = 'primary' | 'secondary' | 'neutral' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type BadgeStatus = ${badgeStatuses.map((status) => `'${status}'`).join(' | ')};
export type MeterState = 'scored' | 'warming-up';
export type CardTone = 'neutral' | 'primary' | 'info' | 'success';
export type ChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
`;
}
