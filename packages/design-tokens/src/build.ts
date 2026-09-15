import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { contrastRatio } from './contrast';
import { emitCss } from './emit-css';
import { emitDart } from './emit-dart';
import { emitTs } from './emit-ts';
import { crossValidate, tokensSchema, type Tokens } from './schema';

/**
 * Resolves to `packages/design-tokens` whether this runs as `src/build.ts`
 * via tsx or as the compiled `dist/build.js` — both sit one directory below
 * the package root.
 */
const PACKAGE_ROOT = dirname(__dirname);

export function loadTokens(sourcePath = join(PACKAGE_ROOT, 'tokens.json')): Tokens {
  const raw = readFileSync(sourcePath, 'utf-8');
  const parsed = tokensSchema.parse(JSON.parse(raw));

  const shapeIssues = crossValidate(parsed);
  if (shapeIssues.length > 0) {
    throw new Error(`tokens.json failed cross-field validation:\n- ${shapeIssues.join('\n- ')}`);
  }

  return parsed;
}

/**
 * Every registered pair must clear its threshold in both themes before a
 * single artifact is written. A colour pair below its threshold is exactly
 * the failure the PRD calls out as invisible until somebody notices — so the
 * build refuses to produce output rather than emit a token set that already
 * fails its own contract.
 */
export function contrastFailures(tokens: Tokens): string[] {
  const failures: string[] = [];

  for (const pair of tokens.semanticPairs) {
    const exemption = tokens.contrastExemptions.find((entry) => entry.pair === pair.name);
    if (exemption) continue;

    for (const theme of ['light', 'dark'] as const) {
      const fg = tokens.color[theme][pair.fg];
      const bg = tokens.color[theme][pair.bg];
      if (!fg || !bg) continue;

      const ratio = contrastRatio(fg, bg);
      if (ratio < pair.min) {
        failures.push(
          `${theme} "${pair.name}" (${pair.fg} ${fg} on ${pair.bg} ${bg}) measures ${ratio.toFixed(2)}:1, below its ${pair.min}:1 threshold`,
        );
      }
    }
  }

  return failures;
}

export function buildTokens(sourcePath?: string): void {
  const tokens = loadTokens(sourcePath);

  const failures = contrastFailures(tokens);
  if (failures.length > 0) {
    throw new Error(`Contrast check failed:\n- ${failures.join('\n- ')}`);
  }

  const generatedDir = join(PACKAGE_ROOT, 'generated');
  writeFileSync(join(generatedDir, 'tokens.css'), emitCss(tokens), 'utf-8');
  writeFileSync(join(generatedDir, 'tokens.ts'), emitTs(tokens), 'utf-8');
  // A pub package's library code must live under `lib/`, so the Dart target
  // is the one artifact that doesn't sit alongside its CSS/TS siblings.
  writeFileSync(join(PACKAGE_ROOT, 'lib', 'english_quest_tokens.dart'), emitDart(tokens), 'utf-8');
}

if (require.main === module) {
  buildTokens();
  console.warn('Generated tokens.css, tokens.ts and lib/english_quest_tokens.dart from tokens.json');
}
