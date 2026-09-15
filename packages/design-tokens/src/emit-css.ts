import type { Tokens } from './schema';

const GENERATED_BANNER =
  '/* GENERATED FILE — do not edit by hand.\n' +
  ' * Source: packages/design-tokens/tokens.json\n' +
  ' * Regenerate with `pnpm tokens:build`. */\n';

function colorLines(roles: Record<string, string>): string[] {
  return Object.entries(roles).map(([role, value]) => `  --color-${role}: ${value};`);
}

function typeLines(type: Tokens['type']): string[] {
  const lines: string[] = [];
  for (const [step, { size, lineHeight, weight }] of Object.entries(type)) {
    lines.push(`  --text-${step}: ${size};`);
    lines.push(`  --text-${step}--line-height: ${lineHeight};`);
    lines.push(`  --text-${step}--font-weight: ${weight};`);
  }
  return lines;
}

function radiusLines(radius: Record<string, string>): string[] {
  return Object.entries(radius).map(([name, value]) =>
    name === 'DEFAULT' ? `  --radius: ${value};` : `  --radius-${name}: ${value};`,
  );
}

function spacingLines(spacing: Record<string, string>): string[] {
  return Object.entries(spacing).map(([name, value]) => `  --spacing-${name}: ${value};`);
}

function shadowLines(shadow: Record<string, string>): string[] {
  return Object.entries(shadow).map(([name, value]) => `  --shadow-${name}: ${value};`);
}

function motionLines(motion: Record<string, string>): string[] {
  return Object.entries(motion).map(([name, value]) => `  --${name}: ${value};`);
}

export function emitCss(tokens: Tokens): string {
  const themeBlock = [
    '@theme {',
    `  --font-sans: "${tokens.meta.fontFamily}", ui-sans-serif, system-ui, -apple-system, sans-serif;`,
    '',
    ...colorLines(tokens.color.light),
    '',
    ...typeLines(tokens.type),
    '',
    ...radiusLines(tokens.radius),
    '',
    ...spacingLines(tokens.spacing),
    '',
    ...shadowLines(tokens.shadow.light),
    '',
    ...motionLines(tokens.motion),
    '}',
  ].join('\n');

  const darkAttributeBlock = [
    ":root[data-theme='dark'] {",
    ...colorLines(tokens.color.dark),
    '',
    ...shadowLines(tokens.shadow.dark),
    '}',
  ].join('\n');

  // No prefers-color-scheme fallback: light is the product's designed
  // default regardless of OS preference, so nothing here should key off it.
  // Dark is reachable only through an explicit choice, applied via the
  // data-theme attribute above — by the init script, or by JS disabled
  // (which simply leaves the @theme block's light values in effect).
  return [GENERATED_BANNER, themeBlock, '', darkAttributeBlock, ''].join('\n');
}
