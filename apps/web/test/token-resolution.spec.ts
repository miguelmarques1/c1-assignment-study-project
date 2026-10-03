import { color, motion, radius, shadowNames, spacing, typeScale } from '@english-quest/design-tokens';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(__dirname, '..', 'src');
const GLOBALS_CSS = join(SRC_ROOT, 'app', 'globals.css');

const COLOR_ROLES = new Set(Object.keys(color));
const RADIUS_TOKENS = new Set(Object.keys(radius).map((name) => (name === 'DEFAULT' ? '' : name)));
const SPACING_TOKENS = new Set(Object.keys(spacing));
const TYPE_STEPS = new Set(Object.keys(typeScale));
const SHADOW_TOKENS = new Set(shadowNames as readonly string[]);

/**
 * Tailwind's own built-in utilities that share a prefix this guard checks
 * but that this project never overrides with a token — alignment and
 * automatic-margin utilities, and the numeric/side border-width scale
 * (`border-2`, `border-b-2`, ...), which uses the same `border-` prefix as
 * our border *colour* roles but means something structurally different.
 */
const BUILTIN_TAILWIND_UTILITIES = new Set([
  'text-center',
  'text-left',
  'text-right',
  'mx-auto',
  'my-auto',
  // A border *style*, sharing the `border-` prefix with the colour roles.
  'border-dashed',
]);
const BORDER_WIDTH_PATTERN = /^([trbl]-)?\d+$/;

/**
 * Domain string literals that happen to be spelled like a token-prefixed
 * utility class but are not one — the scanner can't see whether a string
 * sits inside `className` or an unrelated prop, so exact, justified
 * exceptions live here instead of a false failure.
 */
const NON_UTILITY_ALLOWLIST = new Set([
  'text-block', // LoadingVariant discriminant in loading-state.tsx, not a Tailwind class
  'text-area', // the design-system gallery's vrId for TextArea's section, not a Tailwind class
]);

function listSourceFiles(): string[] {
  const entries = readdirSync(SRC_ROOT, { recursive: true, withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (extname(entry.name) !== '.tsx') continue;
    files.push(join(entry.parentPath ?? entry.path, entry.name));
  }
  return files;
}

interface CandidateUtility {
  prefix: string;
  suffix: string;
  raw: string;
}

const TRACKED_PREFIXES = [
  'bg',
  'text',
  'border',
  'fill',
  'stroke',
  'rounded',
  'shadow',
  'p',
  'px',
  'py',
  'pt',
  'pb',
  'pl',
  'pr',
  'm',
  'mx',
  'my',
  'mt',
  'mb',
  'ml',
  'mr',
  'gap',
];

/**
 * A worked example inside a comment (like the one in stack.tsx explaining
 * why a template literal can't hold a class name) is still backtick-quoted
 * text as far as a regex is concerned. Comments are stripped first so an
 * illustrative code snippet in prose never becomes a scan candidate.
 */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function extractCandidates(content: string): CandidateUtility[] {
  const candidates: CandidateUtility[] = [];
  // Every quoted or templated string chunk is a candidate source of class
  // names — cn() calls, lookup tables and literal className attributes all
  // hold their classes this way. Filtering by tracked prefix afterwards
  // keeps unrelated string content (copy, ids, JS values) from mattering.
  const stringChunks = stripComments(content).match(/'[^']*'|"[^"]*"|`[^`]*`/g) ?? [];

  for (const chunk of stringChunks) {
    const words = chunk.slice(1, -1).split(/[\s`${}]+/);
    for (const word of words) {
      for (const prefix of TRACKED_PREFIXES) {
        // Requiring the hyphen (never a bare "text", "p", "m", ...) is what
        // keeps this from matching an unrelated attribute value that happens
        // to equal a prefix verbatim, e.g. type="text".
        if (word.startsWith(`${prefix}-`)) {
          candidates.push({ prefix, suffix: word.slice(prefix.length + 1), raw: word });
        }
      }
    }
  }

  return candidates;
}

/**
 * `bg-outline-strong/60` is the `outline-strong` role at 60% opacity — the
 * modifier scales a token, it never introduces a value, so the suffix is
 * checked without it.
 */
const OPACITY_MODIFIER = /\/\d{1,3}$/;

function isDeclared({ prefix, suffix: rawSuffix, raw }: CandidateUtility): boolean {
  if (BUILTIN_TAILWIND_UTILITIES.has(raw)) return true;
  const suffix = rawSuffix.replace(OPACITY_MODIFIER, '');
  if (NON_UTILITY_ALLOWLIST.has(raw)) return true;

  switch (prefix) {
    case 'bg':
    case 'border':
    case 'fill':
    case 'stroke':
      if (prefix === 'border' && BORDER_WIDTH_PATTERN.test(suffix)) return true;
      return COLOR_ROLES.has(suffix);
    case 'text':
      return COLOR_ROLES.has(suffix) || TYPE_STEPS.has(suffix) || BUILTIN_TAILWIND_UTILITIES.has(raw);
    case 'rounded':
      return RADIUS_TOKENS.has(suffix);
    case 'shadow':
      return SHADOW_TOKENS.has(suffix);
    default:
      // The spacing family: p/px/py/pt/pb/pl/pr, m/mx/my/mt/mb/ml/mr, gap.
      return SPACING_TOKENS.has(suffix) || BUILTIN_TAILWIND_UTILITIES.has(raw);
  }
}

describe('token resolution', () => {
  it('every_token_utility_in_source_resolves_to_a_declared_token', () => {
    for (const file of listSourceFiles()) {
      const relative = file.slice(SRC_ROOT.length + 1).replace(/\\/g, '/');
      const content = readFileSync(file, 'utf-8');

      for (const candidate of extractCandidates(content)) {
        expect(
          isDeclared(candidate),
          `${relative} uses "${candidate.raw}", which does not resolve to any declared token`,
        ).toBe(true);
      }
    }
  });

  it('every_css_variable_reference_is_declared', () => {
    const css = readFileSync(GLOBALS_CSS, 'utf-8');
    const references = new Set(
      [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!),
    );

    const declaredCssVariables = new Set<string>([
      'font-sans',
      'font-plus-jakarta-sans',
      ...[...COLOR_ROLES].map((role) => `color-${role}`),
      ...[...SHADOW_TOKENS].map((name) => `shadow-${name}`),
      ...Object.keys(motion),
    ]);

    for (const reference of references) {
      expect(declaredCssVariables.has(reference), `globals.css references undeclared --${reference}`).toBe(true);
    }
  });

  it('an_unknown_utility_is_detected', () => {
    const fixture = 'bg-surfce text-body-md';
    const candidates = extractCandidates(`"${fixture}"`);
    const bogus = candidates.find((candidate) => candidate.raw === 'bg-surfce');
    expect(bogus).toBeDefined();
    expect(isDeclared(bogus!)).toBe(false);
  });
});
