/**
 * Stands in for `ErrorLedgerPort` until F12 ships the ledger: a suite
 * scripts how many times a tag was recorded, and the analysis view turns
 * that into a recurrence badge exactly as it will with F12's implementation.
 * Test-only, per `apps/api/AGENTS.md` — production keeps the neutral port.
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
