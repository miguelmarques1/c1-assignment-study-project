import { Module } from '@nestjs/common';

import { AnalysisModule } from '../analysis/analysis.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { ProfileModule } from '../profile/profile.module';
import { PronunciationModule } from '../pronunciation/pronunciation.module';
import { ProfileReconciliationJob } from './profile-reconciliation.job';
import { ProfileUpdateStageHandler } from './profile-update-stage.handler';

/**
 * How lessons reach the learning profile (F12): the `profile_update` stage,
 * registered with the pipeline runner at module init, and the
 * reconciliation sweep for pronunciation results the stage has not reached.
 * Separate from `ProfileModule` because it reads F11's analysis, and
 * `AnalysisModule` itself imports `ProfileModule` for its weakness tags.
 */
@Module({
  imports: [PipelineModule, AnalysisModule, PronunciationModule, ProfileModule],
  providers: [ProfileUpdateStageHandler, ProfileReconciliationJob],
})
export class ProfileUpdateModule {}
