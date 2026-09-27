/** The recurrence badge's text (F19): `2nd time`, `3rd time`, `11th time`, `21st time`. */
export function ordinalTimes(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  let suffix = 'th';
  if (lastTwo < 11 || lastTwo > 13) {
    if (last === 1) suffix = 'st';
    else if (last === 2) suffix = 'nd';
    else if (last === 3) suffix = 'rd';
  }
  return `${count}${suffix} time`;
}
