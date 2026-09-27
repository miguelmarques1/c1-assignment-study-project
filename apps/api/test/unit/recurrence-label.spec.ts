import { describe, expect, it } from 'vitest';

import { ordinalTimes } from '../../src/analysis/recurrence-label';

describe('ordinalTimes', () => {
  it('formats_ordinals', () => {
    const cases: Array<[number, string]> = [
      [2, '2nd time'],
      [3, '3rd time'],
      [4, '4th time'],
      [11, '11th time'],
      [12, '12th time'],
      [13, '13th time'],
      [21, '21st time'],
      [22, '22nd time'],
      [23, '23rd time'],
      [101, '101st time'],
      [111, '111th time'],
      [112, '112th time'],
    ];
    for (const [count, label] of cases) {
      expect(ordinalTimes(count)).toBe(label);
    }
  });
});
