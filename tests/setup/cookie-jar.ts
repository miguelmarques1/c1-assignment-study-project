type Stored = { value: string; options: Record<string, unknown> };

export const jarValues = new Map<string, Stored>();

export const jarStore = {
  get(name: string) {
    const entry = jarValues.get(name);
    return entry ? { name, value: entry.value } : undefined;
  },
  set(name: string, value: string, options: Record<string, unknown> = {}) {
    if (options.maxAge === 0 || value === "") {
      jarValues.delete(name);
    } else {
      jarValues.set(name, { value, options });
    }
  },
};

export function resetJar(seed?: Record<string, string>) {
  jarValues.clear();
  if (seed) {
    for (const [k, v] of Object.entries(seed)) {
      jarValues.set(k, { value: v, options: {} });
    }
  }
}

export function currentSessionCookie(): string | null {
  return jarValues.get("videomax_session")?.value ?? null;
}
