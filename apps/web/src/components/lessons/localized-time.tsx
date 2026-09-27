'use client';

import { useEffect, useState } from 'react';

import { formatRelativeTime } from '@/lib/relative-time';

import { formatAbsoluteDate, formatTimeOfDay } from './format';

export type TimeFormat = 'relative' | 'absolute' | 'time';

function formatIn(iso: string, format: TimeFormat, timeZone?: string): string {
  if (format === 'relative') {
    return formatRelativeTime(iso, new Date(), timeZone);
  }
  return format === 'absolute' ? formatAbsoluteDate(iso, timeZone) : formatTimeOfDay(iso, timeZone);
}

/**
 * A date in the viewer's own time zone, which the server rendering this
 * page does not know (F19, A19). The first render prints a fixed UTC form
 * so the server's HTML and the browser's hydration agree; the viewer's
 * local text replaces it once mounted.
 */
export function LocalizedTime({ iso, format }: { iso: string; format: TimeFormat }) {
  const [text, setText] = useState(() => (format === 'time' ? formatTimeOfDay(iso, 'UTC') : formatAbsoluteDate(iso, 'UTC')));

  useEffect(() => {
    setText(formatIn(iso, format));
  }, [iso, format]);

  return <time dateTime={iso}>{text}</time>;
}
