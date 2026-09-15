import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { contrastFailures, loadTokens } from '../src/build';
import { contrastRatio } from '../src/contrast';
import { emitCss } from '../src/emit-css';
import { emitDart } from '../src/emit-dart';
import { emitTs } from '../src/emit-ts';
import { KIND_THRESHOLD, tokensSchema } from '../src/schema';

const PACKAGE_ROOT = join(__dirname, '..');
const RAW_TOKENS = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'tokens.json'), 'utf-8'));

function sourceFiles(): string[] {
  return readdirSync(join(PACKAGE_ROOT, 'src'))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => readFileSync(join(PACKAGE_ROOT, 'src', name), 'utf-8'));
}

describe('tokens.json shape', () => {
  it('tokens_json_satisfies_the_schema', () => {
    expect(() => tokensSchema.parse(RAW_TOKENS)).not.toThrow();
  });

  it('light_and_dark_declare_the_same_colour_roles', () => {
    const tokens = loadTokens();
    const lightRoles = Object.keys(tokens.color.light).sort();
    const darkRoles = Object.keys(tokens.color.dark).sort();
    expect(darkRoles).toEqual(lightRoles);
  });

  it('no_declared_pair_is_silently_absent_from_the_registry', () => {
    const tokens = loadTokens();
    const foregroundRoles = Object.keys(tokens.color.light).filter(
      (role) => role.startsWith('on-') || /^badge-.+-fg$/.test(role),
    );
    const registeredForegrounds = new Set(tokens.semanticPairs.map((pair) => pair.fg));

    for (const role of foregroundRoles) {
      expect(
        registeredForegrounds.has(role),
        `"${role}" looks like a foreground role but is not the fg of any semantic pair`,
      ).toBe(true);
    }
  });
});

describe('contrast', () => {
  it('every_reading_pair_meets_4_5_to_1_in_both_themes', () => {
    const tokens = loadTokens();
    const readingPairs = tokens.semanticPairs.filter((pair) => pair.kind === 'reading');
    expect(readingPairs.length).toBeGreaterThan(0);

    for (const pair of readingPairs) {
      for (const theme of ['light', 'dark'] as const) {
        const fg = tokens.color[theme][pair.fg]!;
        const bg = tokens.color[theme][pair.bg]!;
        const ratio = contrastRatio(fg, bg);
        expect(
          ratio,
          `${theme} "${pair.name}" (${pair.fg} ${fg} on ${pair.bg} ${bg}) measures ${ratio.toFixed(2)}:1, below its ${pair.min}:1 threshold`,
        ).toBeGreaterThanOrEqual(pair.min);
      }
    }
  });

  it('every_border_pair_meets_3_to_1_in_both_themes', () => {
    const tokens = loadTokens();
    const borderPairs = tokens.semanticPairs.filter((pair) => pair.kind === 'border');
    expect(borderPairs.length).toBeGreaterThan(0);

    for (const pair of borderPairs) {
      for (const theme of ['light', 'dark'] as const) {
        const fg = tokens.color[theme][pair.fg]!;
        const bg = tokens.color[theme][pair.bg]!;
        const ratio = contrastRatio(fg, bg);
        expect(
          ratio,
          `${theme} "${pair.name}" (${pair.fg} ${fg} on ${pair.bg} ${bg}) measures ${ratio.toFixed(2)}:1, below its ${pair.min}:1 threshold`,
        ).toBeGreaterThanOrEqual(pair.min);
      }
    }
  });

  it('the_exemption_list_is_empty_and_any_entry_carries_a_reason', () => {
    const tokens = loadTokens();
    expect(tokens.contrastExemptions).toEqual([]);

    for (const exemption of tokens.contrastExemptions) {
      expect(exemption.reason.length).toBeGreaterThan(0);
      expect(exemption.ratio).toBeGreaterThan(0);
    }
  });

  it('a_kind_and_its_min_agree_with_the_registered_threshold', () => {
    const tokens = loadTokens();
    for (const pair of tokens.semanticPairs) {
      expect(pair.min).toBe(KIND_THRESHOLD[pair.kind]);
    }
  });

  it('the_build_refuses_to_emit_when_a_pair_fails_its_threshold', () => {
    const tokens = loadTokens();
    const broken = {
      ...tokens,
      semanticPairs: [
        ...tokens.semanticPairs,
        { name: 'fixture-failure', fg: 'on-primary', bg: 'primary-container', kind: 'reading' as const, min: 4.5 },
      ],
    };
    expect(contrastFailures(broken).some((message) => message.includes('fixture-failure'))).toBe(true);
  });

  it('dark_elevation_substitutes_outline_for_shadow', () => {
    const tokens = loadTokens();
    for (const shadowName of Object.keys(tokens.shadow.dark)) {
      expect(tokens.shadow.dark[shadowName]).toBe('none');
    }

    const ratio = contrastRatio(tokens.color.dark['outline-strong']!, tokens.color.dark.surface!);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
});

describe('generation drift guard', () => {
  it('generated_files_match_a_fresh_generation', () => {
    const tokens = loadTokens();
    const generatedDir = join(PACKAGE_ROOT, 'generated');

    expect(emitCss(tokens)).toBe(readFileSync(join(generatedDir, 'tokens.css'), 'utf-8'));
    expect(emitTs(tokens)).toBe(readFileSync(join(generatedDir, 'tokens.ts'), 'utf-8'));
    expect(emitDart(tokens)).toBe(
      readFileSync(join(PACKAGE_ROOT, 'lib', 'english_quest_tokens.dart'), 'utf-8'),
    );
  });
});

describe('no literal values leak into the generator', () => {
  const realHexValues = new Set<string>();
  const realLengthValues = new Set<string>();

  const tokens = loadTokens();
  for (const theme of ['light', 'dark'] as const) {
    for (const value of Object.values(tokens.color[theme])) realHexValues.add(value.toLowerCase());
  }
  for (const value of Object.values(tokens.spacing)) realLengthValues.add(value);
  for (const value of Object.values(tokens.radius)) realLengthValues.add(value);

  it('the_generator_contains_no_literal_token_values', () => {
    for (const source of sourceFiles()) {
      const hexMatches = source.match(/#[0-9a-fA-F]{6}/g) ?? [];
      for (const hex of hexMatches) {
        expect(realHexValues.has(hex.toLowerCase()), `source contains real token value ${hex}`).toBe(false);
      }

      const lengthMatches = source.match(/\b\d+(\.\d+)?(px|rem)\b/g) ?? [];
      for (const length of lengthMatches) {
        expect(realLengthValues.has(length), `source contains real token value ${length}`).toBe(false);
      }
    }
  });

  it('the_literal_value_guard_can_actually_fail', () => {
    const fixtureSource = `const oops = '${[...realHexValues][0]}';`;
    const hexMatches = fixtureSource.match(/#[0-9a-fA-F]{6}/g) ?? [];
    expect(hexMatches.some((hex) => realHexValues.has(hex.toLowerCase()))).toBe(true);
  });
});
