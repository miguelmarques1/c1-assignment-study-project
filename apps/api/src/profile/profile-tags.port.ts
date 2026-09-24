import { Injectable } from '@nestjs/common';

/**
 * F12's seam. F06's role-card prompt and F11's analysis prompt both declare
 * their weakness-tag variable optional, so an empty list keeps every card
 * generating general C1-range expressions and every analysis reporting no
 * recurrence — the "no profile yet" path the PRD describes as the only one
 * that runs today. F12 replaces this implementation with a real read of
 * recurring weakness tags without reopening either feature.
 */
@Injectable()
export class ProfileTagsPort {
  async weaknessTagsFor(_userId: string): Promise<string[]> {
    return [];
  }
}
