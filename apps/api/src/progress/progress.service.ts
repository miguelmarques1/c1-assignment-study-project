import { Injectable } from '@nestjs/common';
import type { ProfileCompetency, ProgressDashboardView } from '@english-quest/shared';

import { LearningProfileReader, type MeasurementPoint } from '../profile/learning-profile.reader';
import { PROFILE_COMPETENCIES } from '../profile/profile.constants';
import { ProfileService } from '../profile/profile.service';
import { buildCompetencyHistory } from './competency-history';
import { PROGRESS_POINTS_PER_COMPETENCY } from './progress.constants';

/**
 * The progress dashboard (F20): the exact view `GET /profile` returns, built
 * by the same function, next to the history behind the competency chart. The
 * two halves are read without a shared transaction, so a source ingested
 * between them can make one response disagree; the next load agrees again.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly profile: ProfileService,
    private readonly profiles: LearningProfileReader,
  ) {}

  async getDashboard(userId: string, now: Date = new Date()): Promise<ProgressDashboardView> {
    const [profile, histories] = await Promise.all([
      this.profile.getProfile(userId, now),
      Promise.all(
        PROFILE_COMPETENCIES.map(
          async (competency): Promise<[ProfileCompetency, MeasurementPoint[]]> => [
            competency,
            await this.profiles.measurementHistory(userId, { competency, limit: PROGRESS_POINTS_PER_COMPETENCY }),
          ],
        ),
      ),
    ]);
    return {
      serverTime: now.toISOString(),
      profile,
      competencyHistory: buildCompetencyHistory(new Map(histories), profile.competencies, now),
    };
  }
}
