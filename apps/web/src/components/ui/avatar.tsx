/**
 * First character of the first word, plus the first character of the last
 * word when there is more than one, capped at two characters. Falls back to
 * the first character of the email when the name yields nothing.
 */
function initialsFor(displayName: string, email: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return (email.charAt(0) || '?').toUpperCase();
  }
  const first = words[0]!.charAt(0);
  const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : '';
  return (first + last).toUpperCase();
}

export interface AvatarProps {
  displayName: string;
  email: string;
  size?: number;
}

/** A circle of initials — there is no profile picture concept in this product. */
export function Avatar({ displayName, email, size = 32 }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={displayName}
      className="inline-flex shrink-0 items-center justify-center rounded-full border-2 border-outline-strong bg-primary text-on-primary"
      style={{ width: size, height: size }}
    >
      <span aria-hidden="true" className="text-label-sm font-bold">
        {initialsFor(displayName, email)}
      </span>
    </span>
  );
}
