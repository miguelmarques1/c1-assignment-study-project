import type { CompetencyTrend, ProfileCompetency } from '@english-quest/shared';

import { roundScore } from './profile-fold';
import {
  COMPETENCY_LABELS,
  PROFILE_COMPETENCIES,
  SUMMARY_EXAMPLE_LIMIT,
  SUMMARY_QUOTE_MAX_CHARS,
  SUMMARY_TOKEN_BUDGET,
  SUMMARY_WEAKNESS_LIMIT,
} from './profile.constants';

export interface SummaryCompetency {
  competency: ProfileCompetency;
  score: number | null;
  measurementCount: number;
  warmingUp: boolean;
  trend: CompetencyTrend | null;
  accuracy: number | null;
  prosody: number | null;
}

export interface SummaryWeakness {
  tag: string;
  label: string;
  occurrenceCount: number;
  recentOccurrenceCount: number;
}

/** One example per recurring tag, in rank order: its most recent quote, or a phoneme tag's words. */
export interface SummaryExample {
  tag: string;
  quote: string | null;
  exampleWords: readonly string[];
}

export interface CompactSummary {
  text: string;
  estimatedTokens: number;
  tagsIncluded: string[];
  examplesIncluded: number;
}

/** F11's estimator, which its live check found within 4% of Gemini's own count. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function cut(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

function competencyLine(entry: SummaryCompetency): string {
  const name = COMPETENCY_LABELS[entry.competency];
  if (entry.score === null || entry.measurementCount === 0) {
    return `- ${name}: not measured yet`;
  }
  const count = `${entry.measurementCount} measurement${entry.measurementCount === 1 ? '' : 's'}`;
  const state = entry.warmingUp ? `warming up, ${count}` : `${count}, trend ${entry.trend}`;
  let line = `- ${name}: ${roundScore(entry.score)} (${state})`;
  if (entry.competency === 'pronunciation' && entry.accuracy !== null) {
    const prosody = entry.prosody === null ? 'not measured' : String(roundScore(entry.prosody));
    line += `; accuracy ${roundScore(entry.accuracy)}, prosody ${prosody}`;
  }
  return line;
}

function weaknessLine(weakness: SummaryWeakness): string {
  return (
    `- ${weakness.tag} (${weakness.label}): ${weakness.occurrenceCount} occurrence` +
    `${weakness.occurrenceCount === 1 ? '' : 's'}, ${weakness.recentOccurrenceCount} in the last 30 days`
  );
}

function exampleLine(example: SummaryExample): string | null {
  if (example.quote) {
    return `- ${example.tag}: "${cut(example.quote, SUMMARY_QUOTE_MAX_CHARS)}"`;
  }
  if (example.exampleWords.length > 0) {
    const words = example.exampleWords.map((word) => `"${cut(word, 40)}"`).join(', ');
    return `- ${example.tag}: words ${cut(words, SUMMARY_QUOTE_MAX_CHARS)}`;
  }
  return null;
}

function compose(competencies: string[], weaknesses: string[], examples: string[]): string {
  const blocks = [
    'Learner profile (scores 0-100, smoothed across lessons and activities).',
    ['Competencies:', ...competencies].join('\n'),
  ];
  if (weaknesses.length > 0) {
    blocks.push(
      ['Recurring weaknesses (at least 3 occurrences in the last 30 days, most frequent first):', ...weaknesses].join(
        '\n',
      ),
    );
  }
  if (examples.length > 0) {
    blocks.push(["Examples of the learner's own errors:", ...examples].join('\n'));
  }
  return blocks.join('\n\n');
}

/**
 * The profile as prompts see it: six scores, up to 10 recurring weaknesses
 * and up to 6 examples, never the raw history. The caps keep the text well
 * inside the 1,500-token budget; if it were ever exceeded anyway, examples
 * go first, from the end, then weaknesses. Recent improvements join as a
 * fourth block with the Full scope.
 */
export function renderCompactSummary(
  competencies: readonly SummaryCompetency[],
  weaknesses: readonly SummaryWeakness[],
  examples: readonly SummaryExample[],
  budget: number = SUMMARY_TOKEN_BUDGET,
): CompactSummary {
  const byCompetency = new Map(competencies.map((entry) => [entry.competency, entry]));
  const competencyLines = PROFILE_COMPETENCIES.map((competency) =>
    competencyLine(
      byCompetency.get(competency) ?? {
        competency,
        score: null,
        measurementCount: 0,
        warmingUp: true,
        trend: null,
        accuracy: null,
        prosody: null,
      },
    ),
  );

  const includedWeaknesses = weaknesses.slice(0, SUMMARY_WEAKNESS_LIMIT);
  const includedTags = new Set(includedWeaknesses.map((weakness) => weakness.tag));
  const weaknessLines = includedWeaknesses.map(weaknessLine);
  const exampleLines = examples
    .filter((example) => includedTags.has(example.tag))
    .map(exampleLine)
    .filter((line): line is string => line !== null)
    .slice(0, SUMMARY_EXAMPLE_LIMIT);

  let text = compose(competencyLines, weaknessLines, exampleLines);
  while (estimateTokens(text) > budget && (exampleLines.length > 0 || weaknessLines.length > 0)) {
    if (exampleLines.length > 0) {
      exampleLines.pop();
    } else {
      weaknessLines.pop();
    }
    text = compose(competencyLines, weaknessLines, exampleLines);
  }

  return {
    text,
    estimatedTokens: estimateTokens(text),
    tagsIncluded: includedWeaknesses.slice(0, weaknessLines.length).map((weakness) => weakness.tag),
    examplesIncluded: exampleLines.length,
  };
}
