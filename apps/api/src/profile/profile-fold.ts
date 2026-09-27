import type { CompetencyTrend } from '@english-quest/shared';

import { COMPETENCY_TREND_BAND, WARMING_UP_BELOW_MEASUREMENTS } from './profile.constants';

/** One row of a competency's measurement log, as the fold reads it. */
export interface FoldMeasurement {
  id: string;
  weight: number;
  value: number;
  /** Pronunciation only; null skips the accuracy fold for this row. */
  accuracy: number | null;
  /** Pronunciation only; null (a locale without prosody) skips the prosody fold for this row. */
  prosody: number | null;
  measuredAt: Date;
  createdAt: Date;
}

/** The smoothed values after one row, in fold order — what `score_after` and friends store. */
export interface FoldedRow {
  id: string;
  scoreAfter: number;
  /** Carried forward from earlier rows when this one has no sub-score; null until one exists. */
  accuracyAfter: number | null;
  prosodyAfter: number | null;
}

export interface FoldedCompetency {
  rows: FoldedRow[];
  score: number;
  /** The score before the last measurement; null on the first. */
  previousScore: number | null;
  measurementCount: number;
  /** Null while warming up (fewer than 3 measurements). */
  trend: CompetencyTrend | null;
  accuracy: number | null;
  prosody: number | null;
  /** Measurements that reported prosody. */
  prosodyCount: number;
  lastMeasuredAt: Date;
}

/** The log's order: measured time, then insertion, then id — total, so a refold is always the same fold. */
export function compareMeasurements(a: FoldMeasurement, b: FoldMeasurement): number {
  return (
    a.measuredAt.getTime() - b.measuredAt.getTime() ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** `s₁ = x₁`, then `sₖ = (1 − wₖ)·sₖ₋₁ + wₖ·xₖ`: a moving average, never an overwrite. */
function step(previous: number | null, value: number, weight: number): number {
  return clampScore(previous === null ? value : (1 - weight) * previous + weight * value);
}

/** Half up, the one rounding every view uses, so a displayed score and its delta always add up. */
export function roundScore(value: number): number {
  return Math.floor(value + 0.5);
}

/** `round(current) − round(previous)`, or null on the first measurement. */
export function scoreDelta(score: number | null, previousScore: number | null): number | null {
  if (score === null || previousScore === null) {
    return null;
  }
  return roundScore(score) - roundScore(previousScore);
}

/** Across the last three measurements, with a dead band so rounding noise never reads as movement. */
function trendOf(scores: number[]): CompetencyTrend | null {
  if (scores.length < WARMING_UP_BELOW_MEASUREMENTS) {
    return null;
  }
  const change = scores[scores.length - 1]! - scores[scores.length - 3]!;
  if (change >= COMPETENCY_TREND_BAND) {
    return 'up';
  }
  if (change <= -COMPETENCY_TREND_BAND) {
    return 'down';
  }
  return 'flat';
}

/**
 * Folds one competency's whole measurement log, in log order, whatever
 * order it arrives in. Recomputing from the log on every ingestion is what
 * keeps the score exact when a source is replaced (an upstream re-run) or
 * arrives out of order (a lesson resumed from a blocked key after a later
 * one finished). Returns null for an empty log: the competency has no row.
 */
export function foldCompetency(measurements: readonly FoldMeasurement[]): FoldedCompetency | null {
  if (measurements.length === 0) {
    return null;
  }
  const ordered = [...measurements].sort(compareMeasurements);

  let score: number | null = null;
  let accuracy: number | null = null;
  let prosody: number | null = null;
  let prosodyCount = 0;
  const scores: number[] = [];
  const rows: FoldedRow[] = [];

  for (const measurement of ordered) {
    score = step(score, measurement.value, measurement.weight);
    if (measurement.accuracy !== null) {
      accuracy = step(accuracy, measurement.accuracy, measurement.weight);
    }
    if (measurement.prosody !== null) {
      prosody = step(prosody, measurement.prosody, measurement.weight);
      prosodyCount += 1;
    }
    scores.push(score);
    rows.push({ id: measurement.id, scoreAfter: score, accuracyAfter: accuracy, prosodyAfter: prosody });
  }

  return {
    rows,
    score: score!,
    previousScore: scores.length > 1 ? scores[scores.length - 2]! : null,
    measurementCount: ordered.length,
    trend: trendOf(scores),
    accuracy,
    prosody,
    prosodyCount,
    lastMeasuredAt: ordered[ordered.length - 1]!.measuredAt,
  };
}
