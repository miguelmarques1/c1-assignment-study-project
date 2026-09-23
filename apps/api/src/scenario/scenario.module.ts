import { Module } from '@nestjs/common';

import { DomainRotationService } from './domain-rotation.service';
import { ProfileTagsPort } from './profile-tags.port';
import { RoleCardService } from './role-card.service';
import { ScenarioController } from './scenario.controller';
import { ScenarioService } from './scenario.service';
import { ScenarioOrchestratorService } from './scenario-orchestrator.service';
import { SituationService } from './situation.service';

@Module({
  controllers: [ScenarioController],
  providers: [
    DomainRotationService,
    SituationService,
    RoleCardService,
    ProfileTagsPort,
    ScenarioOrchestratorService,
    ScenarioService,
  ],
  exports: [ScenarioOrchestratorService],
})
export class ScenarioModule {}
