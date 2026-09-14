type ClassValue = string | number | null | undefined | false | Record<string, boolean | null | undefined> | ClassValue[];

function flatten(value: ClassValue, out: string[]): void {
  if (!value) return;
  if (typeof value === 'string' || typeof value === 'number') {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) flatten(entry, out);
    return;
  }
  for (const [key, enabled] of Object.entries(value)) {
    if (enabled) out.push(key);
  }
}

/** Joins conditional class names without pulling in a dependency for it. */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const value of values) flatten(value, out);
  return out.join(' ');
}
