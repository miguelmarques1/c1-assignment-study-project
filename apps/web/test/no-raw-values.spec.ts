import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(__dirname, '..', 'src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

/**
 * Every exception to the "no raw value" rule lives here, named, with a
 * reason. An empty array is itself a fact worth asserting — it means the
 * rule currently has zero exceptions, and adding one is a visible, reviewed
 * act rather than a silent carve-out buried in a regex.
 */
interface Allowlisted {
  file: string;
  reason: string;
}

const HEX_ALLOWLIST: Allowlisted[] = [];
const ARBITRARY_VALUE_ALLOWLIST: Allowlisted[] = [];

function listSourceFiles(): string[] {
  const entries = readdirSync(SRC_ROOT, { recursive: true, withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!SOURCE_EXTENSIONS.has(extname(entry.name))) continue;
    files.push(join(entry.parentPath ?? entry.path, entry.name));
  }
  return files;
}

function relativeTo(root: string, absolute: string): string {
  return absolute.slice(root.length + 1).replace(/\\/g, '/');
}

/**
 * A comment explaining "we mapped hex X to token Y" is exactly the kind of
 * prose that legitimately quotes a real value — stripped first so
 * documentation about a value doesn't get flagged as the value itself.
 * `//` stripping is skipped for CSS, which has no line-comment syntax and
 * could contain a `url(https://...)` that a naive strip would corrupt.
 */
function stripComments(content: string, extension: string): string {
  const withoutBlockComments = content.replace(/\/\*[\s\S]*?\*\//g, '');
  return extension === '.css' ? withoutBlockComments : withoutBlockComments.replace(/\/\/.*$/gm, '');
}

describe('no raw values in web source', () => {
  it('no_hex_colour_appears_in_web_source', () => {
    const allowlistedFiles = new Set(HEX_ALLOWLIST.map((entry) => entry.file));

    for (const file of listSourceFiles()) {
      const relative = relativeTo(SRC_ROOT, file);
      if (allowlistedFiles.has(relative)) continue;

      const content = stripComments(readFileSync(file, 'utf-8'), extname(file));
      const matches = content.match(/#[0-9a-fA-F]{3,8}\b/g);
      expect(matches, `${relative} contains a raw hex colour: ${matches?.join(', ')}`).toBeNull();
    }
  });

  it('no_tailwind_arbitrary_value_appears_in_web_source', () => {
    const allowlistedFiles = new Set(ARBITRARY_VALUE_ALLOWLIST.map((entry) => entry.file));
    // Matches Tailwind's arbitrary-value syntax: a utility-like prefix
    // immediately followed by a bracketed value with no whitespace inside,
    // e.g. bg-[#fff], top-[13px], w-[calc(100%-1rem)].
    const arbitraryValuePattern = /\b[a-z][a-z-]*-\[[^\]\s]+\]/g;

    for (const file of listSourceFiles()) {
      if (extname(file) !== '.tsx') continue;
      const relative = relativeTo(SRC_ROOT, file);
      if (allowlistedFiles.has(relative)) continue;

      const content = stripComments(readFileSync(file, 'utf-8'), '.tsx');
      const matches = content.match(arbitraryValuePattern);
      expect(matches, `${relative} contains a Tailwind arbitrary value: ${matches?.join(', ')}`).toBeNull();
    }
  });

  it('no_inline_style_attribute_carries_a_dimension_or_colour', () => {
    const dimensionOrColour = /#[0-9a-fA-F]{3,8}\b|\b\d+(\.\d+)?(px|rem)\b/;

    for (const file of listSourceFiles()) {
      if (extname(file) !== '.tsx') continue;
      const relative = relativeTo(SRC_ROOT, file);

      const content = stripComments(readFileSync(file, 'utf-8'), '.tsx');
      const styleBlocks = content.match(/style=\{\{.*?\}\}/gs) ?? [];

      for (const block of styleBlocks) {
        expect(
          dimensionOrColour.test(block),
          `${relative} has an inline style carrying a raw dimension or colour: ${block}`,
        ).toBe(false);
      }
    }
  });

  it('the_allowlist_is_justified', () => {
    for (const entry of [...HEX_ALLOWLIST, ...ARBITRARY_VALUE_ALLOWLIST]) {
      expect(entry.reason.length, `allowlist entry for ${entry.file} has no reason`).toBeGreaterThan(0);
    }
  });

  it('the_hex_guard_can_actually_fail', () => {
    const fixture = "const oops = '#ff00aa';";
    expect(fixture.match(/#[0-9a-fA-F]{3,8}\b/g)).not.toBeNull();
  });

  it('the_arbitrary_value_guard_can_actually_fail', () => {
    const fixture = 'className="bg-[#ff00aa] text-body-md"';
    expect(fixture.match(/\b[a-z][a-z-]*-\[[^\]\s]+\]/g)).not.toBeNull();
  });

  it('the_inline_style_guard_can_actually_fail', () => {
    const fixture = "style={{ marginTop: '13px' }}";
    const block = fixture.match(/style=\{\{.*?\}\}/s)?.[0];
    expect(block).toBeDefined();
    expect(/\b\d+(\.\d+)?(px|rem)\b/.test(block!)).toBe(true);
  });
});
