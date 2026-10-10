'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Counts the seconds the tab was visible while `running` (A16). Wall-clock
 * time since the attempt began would count a night between two answers, so
 * a hidden tab does not tick. The count lives in a ref: nothing re-renders
 * each second, and callers read it when they save or submit.
 */
export function useActiveTime(running: boolean): { read: () => number; seed: (seconds: number) => void } {
  const seconds = useRef(0);

  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        seconds.current += 1;
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const read = useCallback(() => seconds.current, []);
  const seed = useCallback((value: number) => {
    seconds.current = Math.max(0, Math.floor(value));
  }, []);
  return { read, seed };
}
