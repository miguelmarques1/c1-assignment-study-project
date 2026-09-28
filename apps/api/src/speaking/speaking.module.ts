import { Module } from '@nestjs/common';

import { PlansModule } from '../plans/plans.module';
import { ProfileModule } from '../profile/profile.module';
import { SpeechModule } from '../speech/speech.module';
import { StorageModule } from '../storage/storage.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { ExcerptClipSlicer } from '../pronunciation/excerpt-clip.slicer';
import { SpeakingCorpusService } from './corpus/speaking-corpus.service';
import { SpeakingActivityService } from './speaking-activity.service';
import { SpeakingAttemptRepository } from './speaking-attempt.repository';
import { SpeakingAttemptService } from './speaking-attempt.service';
import { SpeakingScorerService } from './scoring/speaking-scorer.service';
import { SpeakingTaskRepository } from './speaking-task.repository';
import { SpeakingViewMapper } from './speaking-view.mapper';
import { SPEAKING_RETRY_DELAYS_OVERRIDE, SPEAKING_WORK_ROOT } from './speaking.constants';

/**
 * F18's speaking domain. `ExcerptClipSlicer` is provided here (stateless, no
 * dependencies of its own) rather than imported from a pronunciation module,
 * so F10's own module and tests stay untouched by a second consumer.
 * `SPEAKING_WORK_ROOT` and `SPEAKING_RETRY_DELAYS_OVERRIDE` are registered
 * as `undefined` purely so a test's `overrideProvider` has an existing
 * binding to replace (F10's precedent) — the scorer's and the attempt
 * service's own constructor defaults take over otherwise.
 */
@Module({
  imports: [SpeechModule, StorageModule, PlansModule, ProfileModule, TaxonomyModule],
  providers: [
    SpeakingCorpusService,
    ExcerptClipSlicer,
    SpeakingTaskRepository,
    SpeakingAttemptRepository,
    SpeakingViewMapper,
    SpeakingScorerService,
    SpeakingActivityService,
    SpeakingAttemptService,
    { provide: SPEAKING_WORK_ROOT, useValue: undefined },
    { provide: SPEAKING_RETRY_DELAYS_OVERRIDE, useValue: undefined },
  ],
})
export class SpeakingModule {}
