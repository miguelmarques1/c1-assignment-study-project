import { Module } from '@nestjs/common';

import { PlansModule } from '../plans/plans.module';
import { ProfileModule } from '../profile/profile.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { WritingCorrectionJob } from './correction/writing-correction.job';
import { WritingCorrectionRunner } from './correction/writing-correction.runner';
import { WritingActivityService } from './writing-activity.service';
import { WritingSubmissionService } from './writing-submission.service';
import { WritingTaskRulesService } from './writing-task-rules.service';
import { WritingViewBuilder } from './writing-view.builder';
import { WritingRepository } from './writing.repository';
import { WritingController } from './writing.controller';

/**
 * The writing activity runner (F17). Imports `PlansModule` for
 * `PlanActivityStateService`, `ProfileModule` for `ErrorLedgerReader` and
 * `ProfileIngestionService`, and `TaxonomyModule` for the taxonomy in
 * force. Prisma, Credentials and Prompts are global. Exports nothing: no
 * other feature calls into writing.
 */
@Module({
  imports: [TaxonomyModule, ProfileModule, PlansModule],
  controllers: [WritingController],
  providers: [
    WritingTaskRulesService,
    WritingRepository,
    WritingViewBuilder,
    WritingActivityService,
    WritingSubmissionService,
    WritingCorrectionRunner,
    WritingCorrectionJob,
  ],
})
export class WritingModule {}
