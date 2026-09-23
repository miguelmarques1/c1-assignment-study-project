import { Injectable } from '@nestjs/common';

/**
 * F12's seam. F06 does not depend on F12 (PRD Section 8) and the role-card
 * prompt's `weakness_tags` variable is already declared `required: false`, so
 * an empty list keeps every card generating general C1-range expressions —
 * the "no profile yet" path the PRD describes as the only one that runs
 * today. F12 replaces this implementation with a real read of recurring
 * weakness tags without reopening this feature.
 */
@Injectable()
export class ProfileTagsPort {
  async weaknessTagsFor(_userId: string): Promise<string[]> {
    return [];
  }
}
