import { describe, expect, it } from 'vitest';

import { parseByteRange } from '../../src/storage/byte-range';

describe('parseByteRange', () => {
  it('reads_an_explicit_range', () => {
    expect(parseByteRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
  });

  it('clamps_an_open_or_oversized_end_to_the_last_byte', () => {
    expect(parseByteRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
  });

  it('reads_a_suffix_range', () => {
    expect(parseByteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('ignores_unparseable_unsatisfiable_and_multi_ranges', () => {
    for (const header of ['', 'bytes=', 'bytes=-', 'bytes=-0', 'bytes=1000-', 'bytes=50-10', 'bytes=0-1,5-9', 'items=0-1', 'bytes=a-b']) {
      expect(parseByteRange(header, 1000)).toBeNull();
    }
    expect(parseByteRange(undefined, 1000)).toBeNull();
    expect(parseByteRange('bytes=0-1', 0)).toBeNull();
  });
});
