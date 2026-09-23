import { Module } from '@nestjs/common';

import { DomainRotationService } from './domain-rotation.service';
import { ProfileTagsPort } from './profile-tags.port';
import { RoleCardService } from './role-card.service';
import { ScenarioOrchestratorService } from './scenario-orchestrator.service';
import { SituationService } from './situation.service';

/**
 * Stage 3 adds `ScenarioController` to this module's `controllers` once the
 * authenticated routes land. The orchestrator is already usable — and used
 * by `ClassroomModule` — before any HTTP surface exists for it.
 */
@Module({
  providers: [
    DomainRotationService,
    SituationService,
    RoleCardService,
    ProfileTagsPort,
    ScenarioOrchestratorService,
  ],
  exports: [ScenarioOrchestratorService],
})
export class ScenarioModule {}
