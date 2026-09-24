import { Module } from '@nestjs/common';

import { ProfileModule } from '../profile/profile.module';
import { DomainRotationService } from './domain-rotation.service';
import { RoleCardService } from './role-card.service';
import { ScenarioController } from './scenario.controller';
import { ScenarioService } from './scenario.service';
import { ScenarioOrchestratorService } from './scenario-orchestrator.service';
import { SituationService } from './situation.service';

@Module({
  imports: [ProfileModule],
  controllers: [ScenarioController],
  providers: [
    DomainRotationService,
    SituationService,
    RoleCardService,
    ScenarioOrchestratorService,
    ScenarioService,
  ],
  exports: [ScenarioOrchestratorService],
})
export class ScenarioModule {}
