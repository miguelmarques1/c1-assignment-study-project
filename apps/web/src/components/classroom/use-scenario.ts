'use client';

import type { ScenarioView } from '@english-quest/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchScenario, rerollSituation, retrySituation } from '@/lib/scenario';

/** Matches F05's own session-poll cadence. */
const SCENARIO_POLL_MS = 3000;

export interface UseScenarioResult {
  view: ScenarioView;
  /** True until the first read — pending or not — has returned. */
  loading: boolean;
  reroll: () => Promise<void>;
  retry: () => Promise<void>;
  rerolling: boolean;
  retrying: boolean;
}

/**
 * Polls `GET /classroom/scenario` while `active` is true — the waiting area,
 * where the situation and cards are still being generated or rerolled.
 * Once `active` turns false (the lesson has started), it reads exactly once
 * more to pick up whatever was still in flight and then stops: the scenario
 * is immutable after the lesson starts, so continuing to poll could never
 * return anything new.
 */
export function useScenario(active: boolean): UseScenarioResult {
  const [view, setView] = useState<ScenarioView>(null);
  const [loading, setLoading] = useState(true);
  const [rerolling, setRerolling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const hasStoppedRef = useRef(false);

  const poll = useCallback(async () => {
    try {
      const result = await fetchScenario();
      setView(result);
    } catch {
      // Transient; the next tick (or the final read below) retries.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      if (!hasStoppedRef.current) {
        hasStoppedRef.current = true;
        void poll();
      }
      return;
    }

    hasStoppedRef.current = false;
    void poll();
    const timer = setInterval(() => void poll(), SCENARIO_POLL_MS);
    return () => clearInterval(timer);
  }, [active, poll]);

  const reroll = useCallback(async () => {
    setRerolling(true);
    try {
      setView(await rerollSituation());
    } finally {
      setRerolling(false);
    }
  }, []);

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      setView(await retrySituation());
    } finally {
      setRetrying(false);
    }
  }, []);

  return { view, loading, reroll, retry, rerolling, retrying };
}
