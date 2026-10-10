export interface ByteRange {
  start: number;
  end: number;
}

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

/**
 * A single `Range: bytes=…` header resolved against the object's size, or
 * `null` when it is absent, malformed, multi-range or unsatisfiable. The
 * caller then serves the whole object, which is what every audio client
 * copes with (F16 A19).
 */
export function parseByteRange(header: string | undefined, totalBytes: number): ByteRange | null {
  if (!header || totalBytes <= 0) {
    return null;
  }
  const match = RANGE_PATTERN.exec(header.trim());
  if (!match) {
    return null;
  }
  const [, first, last] = match;
  if (first === '' && last === '') {
    return null;
  }
  if (first === '') {
    const suffix = Number(last);
    if (suffix <= 0) {
      return null;
    }
    return { start: Math.max(totalBytes - suffix, 0), end: totalBytes - 1 };
  }
  const start = Number(first);
  const end = last === '' ? totalBytes - 1 : Math.min(Number(last), totalBytes - 1);
  if (start >= totalBytes || end < start) {
    return null;
  }
  return { start, end };
}
