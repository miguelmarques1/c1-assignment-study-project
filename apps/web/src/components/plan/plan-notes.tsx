import type { PlanNote } from '@english-quest/shared';

/** One line per note, already ordered by the server (the failed-recording note first). */
export function PlanNotes({ notes }: { notes: PlanNote[] }) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-xs">
      {notes.map((note) => (
        <li key={note.code} className="text-body-sm text-on-surface-variant">
          {note.text}
        </li>
      ))}
    </ul>
  );
}
