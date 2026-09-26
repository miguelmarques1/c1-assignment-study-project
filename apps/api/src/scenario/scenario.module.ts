import { Module } from '@nestjs/common';

import { PipelineModule } from '../pipeline/pipeline.module';
import { ProfileModule } from '../profile/profile.module';
import { DomainRotationService } from './domain-rotation.service';
import { LessonScenarioController } from './lesson-scenario.controller';
import { RoleCardService } from './role-card.service';
import { ScenarioController } from './scenario.controller';
import { ScenarioService } from './scenario.service';
import { ScenarioOrchestratorService } from './scenario-orchestrator.service';
import { SituationService } from './situation.service';

@Module({
  imports: [ProfileModule, PipelineModule],
  controllers: [ScenarioController, LessonScenarioController],
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
