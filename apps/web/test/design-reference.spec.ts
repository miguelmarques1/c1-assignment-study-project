import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const DESIGN_DIR = join(REPO_ROOT, 'design');
const REFERENCE_DOC = join(DESIGN_DIR, 'README.md');
const PRD_PATH = join(REPO_ROOT, 'docs', 'prd.md');

const VALID_STATUSES = new Set(['implemented', 'deferred', 'dropped']);

interface ReferenceRow {
  mockup: string;
  region: string;
  owner: string;
  status: string;
  reference: string;
}

/**
 * Mockup directories carrying a rendered `screen.png` — the visual artifact
 * that defines what counts as a "region" in the reference doc. A directory
 * with only `code.html` (no screenshot) isn't a reviewable mockup.
 */
function listMockupDirs(): string[] {
  return readdirSync(DESIGN_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      try {
        readFileSync(join(DESIGN_DIR, entry.name, 'screen.png'));
        return true;
      } catch {
        return false;
      }
    })
    .map((entry) => entry.name);
}

/** Parses the `## design/<name>` sections and their markdown tables. */
function parseReferenceDoc(text: string): Map<string, ReferenceRow[]> {
  const byMockup = new Map<string, ReferenceRow[]>();
  const sections = text.split(/^## /m).slice(1);

  for (const section of sections) {
    const [headingLine = '', ...rest] = section.split('\n');
    const mockup = headingLine.trim().replace(/^design\//, '');
    const rows: ReferenceRow[] = [];

    for (const line of rest) {
      if (!line.startsWith('|') || /^\|\s*-+\s*\|/.test(line) || /^\|\s*Region\s*\|/.test(line)) continue;
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      if (cells.length !== 4) continue;
      const [region = '', owner = '', status = '', reference = ''] = cells;
      rows.push({ mockup, region, owner, status, reference });
    }

    byMockup.set(mockup, rows);
  }

  return byMockup;
}

function loadPrdFeatureIds(): Set<string> {
  const prd = readFileSync(PRD_PATH, 'utf-8');
  const section8 = prd.split('## 8.')[1]?.split('## 9.')[0] ?? '';
  const ids = new Set<string>();
  for (const match of section8.matchAll(/^\| (F\d\d) \|/gm)) {
    ids.add(match[1]!);
  }
  return ids;
}

describe('design reference document', () => {
  const doc = readFileSync(REFERENCE_DOC, 'utf-8');
  const byMockup = parseReferenceDoc(doc);
  const allRows = [...byMockup.values()].flat();
  const mockupDirs = listMockupDirs();

  it('every_mockup_directory_has_a_table', () => {
    const missing = mockupDirs.filter((dir) => !byMockup.has(dir) || byMockup.get(dir)!.length === 0);
    expect(missing, 'mockup directories with no table or an empty table').toEqual([]);
  });

  it('every_region_carries_exactly_one_status', () => {
    const invalid = allRows.filter((row) => !VALID_STATUSES.has(row.status));
    expect(
      invalid.map((row) => `${row.mockup}: ${row.region} (${row.status})`),
      'rows whose status is not exactly one of implemented/deferred/dropped',
    ).toEqual([]);
  });

  it('dropped_regions_cite_an_exclusion', () => {
    const dropped = allRows.filter((row) => row.status === 'dropped');
    expect(dropped.length, 'expected at least one dropped region').toBeGreaterThan(0);

    // A row whose reason is already spelled out on an identical region
    // elsewhere (the header repeats verbatim across every authenticated
    // screen) may point at that row instead of repeating the citation.
    const uncited = dropped.filter(
      (row) => !/Section (6|7)/.test(row.reference) && !/see the .+ table/i.test(row.reference),
    );
    expect(
      uncited.map((row) => `${row.mockup}: ${row.region}`),
      'dropped rows whose reference does not name a Section 6 or Section 7 clause',
    ).toEqual([]);
  });

  it('deferred_regions_name_an_existing_feature', () => {
    const featureIds = loadPrdFeatureIds();
    const deferred = allRows.filter((row) => row.status === 'deferred');
    expect(deferred.length, 'expected at least one deferred region').toBeGreaterThan(0);

    const unknown = deferred.filter((row) => !featureIds.has(row.owner));
    expect(
      unknown.map((row) => `${row.mockup}: ${row.region} -> "${row.owner}"`),
      'deferred rows whose owner is not a feature id present in the PRD',
    ).toEqual([]);
  });

  it('the_deferred_dashboard_regions_are_all_present', () => {
    const dashboard = byMockup.get('english_quest_dashboard') ?? [];
    const deferredRegions = dashboard.filter((row) => row.status === 'deferred').map((row) => row.region);

    const expectedSubstrings = ['Module card', 'Stat card', 'Recommended-scenario card'];
    for (const expected of expectedSubstrings) {
      expect(
        deferredRegions.some((region) => region.includes(expected)),
        `no deferred dashboard region matching "${expected}"`,
      ).toBe(true);
    }

    // F05 built the hero banner — it must have moved to implemented, not just
    // vanished from the deferred list (which would also satisfy the loop above).
    const heroRow = dashboard.find((row) => row.region.includes('Hero banner'));
    expect(heroRow?.status, 'the hero banner row should be implemented now that F05 built it').toBe(
      'implemented',
    );

    const navRow = dashboard.find((row) => row.region.includes('pill navigation'));
    expect(navRow?.reference, 'pill navigation row must mention the deferred Scenarios & Practice destination').toMatch(
      /Scenarios & Practice/,
    );
  });

  it('the_guard_can_actually_fail', () => {
    const fixture = parseReferenceDoc('## design/fixture\n\n| Region | Owner | Status | Reference |\n|---|---|---|---|\n| A thing | — | maybe | no reason given |\n');
    const rows = fixture.get('fixture')!;
    expect(rows.some((row) => !VALID_STATUSES.has(row.status))).toBe(true);
  });
});
