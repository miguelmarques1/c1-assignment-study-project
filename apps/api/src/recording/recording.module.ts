import { Module } from '@nestjs/common';

import { LiveKitService } from '../classroom/livekit.service';
import { AudioAssembler } from './audio-assembler.service';
import { EgressService } from './egress.service';
import { RecordingOrchestrator } from './recording-orchestrator.service';
import { RecordingStateService } from './recording-state.service';

@Module({
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
  ],
  exports: [RecordingOrchestrator, RecordingStateService],
})
export class RecordingModule {}
