import { Module } from '@nestjs/common';

import { PlansModule } from '../plans/plans.module';
import { ProfileModule } from '../profile/profile.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { ActivitiesController } from './activities.controller';
import { ActivityActionsService } from './activity-actions.service';
import { ActivityMediaService } from './activity-media.service';
import { ActivityViewService } from './activity-view.service';
import { ObjectiveAttemptRepository } from './objective-attempt.repository';
import { ObjectiveAttemptService } from './objective-attempt.service';

/**
 * F16's activities domain: the runner's read model, the objective attempt's
 * start and submission, the kind-agnostic skip and rating, and the audio
 * stream. Prisma, content and storage are global modules.
 */
@Module({
  imports: [PlansModule, ProfileModule, TaxonomyModule],
  controllers: [ActivitiesController],
  providers: [
    ObjectiveAttemptRepository,
    ActivityViewService,
    ObjectiveAttemptService,
    ActivityActionsService,
    ActivityMediaService,
  ],
})
export class ActivitiesModule {}
