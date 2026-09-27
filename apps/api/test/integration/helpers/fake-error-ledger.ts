/**
 * Stands in for `ErrorLedgerPort` so the analysis view's badge rules can be
 * pinned without building a ledger: a suite scripts how many times a tag was
 * recorded, and the view turns that into a recurrence badge exactly as it
 * does with F12's real implementation (proven end to end in
 * `profile-seams.spec.ts`). Test-only, per `apps/api/AGENTS.md`.
 */
export class FakeErrorLedgerPort {
  readonly counts = new Map<string, number>();
  readonly calls: Array<{ userId: string; lessonId: string; tags: string[] }> = [];

  async occurrencesThrough(userId: string, lessonId: string, tags: readonly string[]): Promise<Map<string, number>> {
    this.calls.push({ userId, lessonId, tags: [...tags] });
    return new Map(tags.filter((tag) => this.counts.has(tag)).map((tag) => [tag, this.counts.get(tag)!]));
  }

  reset(): void {
    this.counts.clear();
    this.calls.length = 0;
  }
}
