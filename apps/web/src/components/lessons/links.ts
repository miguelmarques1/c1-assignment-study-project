/** The lesson detail's routes, one per area (F19, A22). */
export function lessonHref(lessonId: string, area: 'result' | 'scenario' | 'transcript' | 'status' = 'result'): string {
  return area === 'result' ? `/lessons/${lessonId}` : `/lessons/${lessonId}/${area}`;
}

/** The anchor the transcript scrolls to and highlights: `…/transcript#u-{utteranceId}`. */
export function utteranceAnchor(utteranceId: string): string {
  return `u-${utteranceId}`;
}

export function transcriptHref(lessonId: string, utteranceId: string): string {
  return `${lessonHref(lessonId, 'transcript')}#${utteranceAnchor(utteranceId)}`;
}
