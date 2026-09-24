import { Module } from '@nestjs/common';

import { LiveKitService } from '../classroom/livekit.service';
import { AudioAssembler } from './audio-assembler.service';
import { EgressService } from './egress.service';
import { PipelineLaunchPort } from './pipeline-launch.port';
import { RecordingController } from './recording.controller';
import { RecordingFinalizationJob } from './recording-finalization.job';
import { RecordingFinalizerService } from './recording-finalizer.service';
import { RecordingOrchestrator } from './recording-orchestrator.service';
import { RecordingService } from './recording.service';
import { RecordingStateService } from './recording-state.service';
import { StudyPlanFallbackPort } from './study-plan-fallback.port';

@Module({
  controllers: [RecordingController],
  providers: [
    // `LiveKitService` is also a provider of `ClassroomModule`. It is a
    // stateless SDK wrapper (its constructor builds fresh clients from
    // `env()`), so a second instance here costs nothing and avoids a
    // circular module import — `ClassroomModule` imports `RecordingModule`
    // for the webhook wiring, so the reverse import is not available.
    LiveKitService,
    EgressService,
    AudioAssembler,
    RecordingStateService,
    RecordingOrchestrator,
    PipelineLaunchPort,
    StudyPlanFallbackPort,
    RecordingFinalizerService,
    RecordingFinalizationJob,
    RecordingService,
  ],
  exports: [RecordingOrchestrator, RecordingStateService],
})
export class RecordingModule {}
