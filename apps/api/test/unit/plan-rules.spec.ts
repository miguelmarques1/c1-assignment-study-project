import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { STUDY_PLAN_RULES_PATH } from '../../src/plans/plan.constants';
import { PlanRulesValidationError, loadPlanRulesFile, parsePlanRules, rulesFingerprint } from '../../src/plans/rules/plan-rules';

/**
 * Every rules version ever committed, with its fingerprint. Changing a
 * threshold, a day, a task count or the CEFR order changes the fingerprint:
 * bump `version` in rules/study-plan.yaml and pin the new value here.
 */
const PINNED_FINGERPRINTS: Record<string, string> = {
  '1': '17c442b62fb19df2723716d67fde8bb7702422ab471d27e680dedc0bb05b9f92',
};

const committedFile = () => parseYaml(readFileSync(STUDY_PLAN_RULES_PATH, 'utf-8'));
type RulesFile = ReturnType<typeof committedFile>;

function issuesFor(change: (file: RulesFile) => void): string[] {
  const file = committedFile();
  change(file);
  return parsePlanRules(file).issues;
}

describe('study plan rules', () => {
  it('loads_the_committed_rules_file', () => {
    const { version, rules } = loadPlanRulesFile(STUDY_PLAN_RULES_PATH);

    expect(version).toBe('1');
    expect(rules.sessions).toEqual({ count: 7, activities: { min: 2, max: 4 }, minutes: { min: 15, max: 20 } });
    expect(rules.quotas).toEqual({ minimum: { listening: 1, reading: 1 }, reviewMaxShare: 0.3 });
    expect(rules.candidates.cefrLevels).toEqual(['C1', 'C2', 'B2']);
    expect(rules.generation.maxItems).toBe(12);
  });

  it('task_slots_match_the_spec', () => {
    const { rules } = loadPlanRulesFile(STUDY_PLAN_RULES_PATH);

    expect(rules.tasks.writing).toEqual({ count: 2, days: [2, 5], tags: { min: 1, max: 2 } });
    expect(rules.tasks.pronunciation).toEqual({ count: 2, days: [1, 4], tags: { min: 1, max: 3 } });
    expect(rules.tasks.speaking).toEqual({ count: 1, days: [6], tags: { min: 1, max: 2 } });
    expect(rules.tasks.speakingWithoutPronunciation).toEqual({ count: 3, days: [1, 4, 6] });
    expect(rules.tasks.filler).toEqual(['speaking', 'pronunciation']);
  });

  it('estimate_rules_match_the_spec', () => {
    const { rules } = loadPlanRulesFile(STUDY_PLAN_RULES_PATH);

    expect(rules.estimates.wordsPerMinute).toBe(180);
    expect(rules.estimates.questionMinutes).toBe(3);
    expect(rules.estimates.listeningPasses).toBe(2);
    expect(rules.estimates.fallbackMinutes).toEqual({ listening: 9, reading: 7 });
    expect(rules.estimates.fixedMinutes).toEqual({
      vocabulary: 6,
      grammar: 6,
      error_review: 6,
      writing: 15,
      speaking: 5,
      pronunciation: 4,
    });
  });

  it('pins_the_fingerprint_of_every_committed_version', () => {
    const { version, fingerprint } = loadPlanRulesFile(STUDY_PLAN_RULES_PATH);
    expect(PINNED_FINGERPRINTS[version]).toBe(fingerprint);
  });

  it('fingerprint_changes_with_a_threshold', () => {
    const { rules } = loadPlanRulesFile(STUDY_PLAN_RULES_PATH);
    const changed = { ...rules, quotas: { ...rules.quotas, reviewMaxShare: 0.25 } };
    expect(rulesFingerprint(changed)).not.toBe(rulesFingerprint(rules));
  });

  it('fingerprint_is_stable_for_identical_rules', () => {
    const { rules } = loadPlanRulesFile(STUDY_PLAN_RULES_PATH);
    expect(rulesFingerprint(rules)).toBe(rulesFingerprint(structuredClone(rules)));
  });

  it('rejects_activities_min_at_or_above_max', () => {
    const issues = issuesFor((file) => {
      file.sessions.activities = { min: 4, max: 4 };
    });
    expect(issues).toContain('sessions.activities.min: must be below activities.max');
  });

  it('rejects_minutes_min_at_or_above_max', () => {
    const issues = issuesFor((file) => {
      file.sessions.minutes = { min: 20, max: 20 };
    });
    expect(issues).toContain('sessions.minutes.min: must be below minutes.max');
  });

  it('rejects_a_task_whose_days_do_not_match_its_count', () => {
    const issues = issuesFor((file) => {
      file.tasks.writing.days = [2];
    });
    expect(issues).toContain('tasks.writing.days: must list exactly 2 day(s) to match count, got 1');
  });

  it('rejects_a_task_with_a_duplicate_day', () => {
    const issues = issuesFor((file) => {
      file.tasks.writing.days = [2, 2];
    });
    expect(issues).toContain('tasks.writing.days: lists a day twice');
  });

  it('rejects_a_task_tag_range_inverted', () => {
    const issues = issuesFor((file) => {
      file.tasks.speaking.tags = { min: 3, max: 1 };
    });
    expect(issues).toContain('tasks.speaking.tags.min: must not exceed tags.max');
  });

  it('rejects_speaking_without_pronunciation_days_mismatch', () => {
    const issues = issuesFor((file) => {
      file.tasks.speaking_without_pronunciation.days = [1, 4];
    });
    expect(issues).toContain('tasks.speaking_without_pronunciation.days: must list exactly 3 day(s) to match count, got 2');
  });

  it('rejects_a_duplicate_cefr_level', () => {
    const issues = issuesFor((file) => {
      file.candidates.cefr_levels = ['C1', 'C1', 'B2'];
    });
    expect(issues.some((issue) => issue.includes('cefr_levels.1'))).toBe(true);
  });

  it('rejects_model_selections_min_above_max', () => {
    const issues = issuesFor((file) => {
      file.model.selections = { min: 20, max: 10 };
    });
    expect(issues).toContain('model.selections.min: must not exceed selections.max');
  });

  it('rejects_rationale_chars_min_above_max', () => {
    const issues = issuesFor((file) => {
      file.model.rationale_chars = { min: 300, max: 100 };
    });
    expect(issues).toContain('model.rationale_chars.min: must not exceed rationale_chars.max');
  });

  it('rejects_generation_max_items_above_twelve', () => {
    const issues = issuesFor((file) => {
      file.generation.max_items = 13;
    });
    expect(issues.length).toBeGreaterThan(0);
  });

  it('rejects_an_unknown_top_level_field', () => {
    const issues = issuesFor((file) => {
      (file as Record<string, unknown>).extra_field = true;
    });
    expect(issues.length).toBeGreaterThan(0);
  });

  it('throws_with_every_issue_when_the_file_is_invalid', () => {
    const file = committedFile();
    file.sessions.activities = { min: 4, max: 4 };
    file.model.selections = { min: 20, max: 10 };

    const { issues } = parsePlanRules(file);
    expect(issues.length).toBeGreaterThanOrEqual(2);
    const error = new PlanRulesValidationError(issues);
    expect(error.message).toContain('Invalid study plan rules');
  });

  it('refuses_to_load_a_missing_file', () => {
    expect(() => loadPlanRulesFile('/no/such/file.yaml')).toThrow(PlanRulesValidationError);
  });
});
