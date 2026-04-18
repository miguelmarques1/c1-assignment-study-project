export function redirectPath(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const digest = (err as { digest?: string }).digest;
  if (!digest || !digest.startsWith("NEXT_REDIRECT")) return null;
  const parts = digest.split(";");
  return parts[2] ?? null;
}

export function isNextRedirect(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: string }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
