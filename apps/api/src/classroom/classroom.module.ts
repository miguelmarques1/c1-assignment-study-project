import { Module } from '@nestjs/common';

import { RecordingModule } from '../recording/recording.module';
import { ScenarioModule } from '../scenario/scenario.module';
import { ClassroomWebhookController } from './classroom-webhook.controller';
import { ClassroomController } from './classroom.controller';
import { ClassroomService } from './classroom.service';
import { LessonLifecycleJob } from './lesson-lifecycle.job';
import { LessonLifecycleService } from './lesson-lifecycle.service';
import { LessonService } from './lesson.service';
import { LiveKitService } from './livekit.service';

@Module({
  imports: [ScenarioModule, RecordingModule],
  controllers: [ClassroomController, ClassroomWebhookController],
  providers: [
    ClassroomService,
    LessonService,
    LiveKitService,
    LessonLifecycleService,
    LessonLifecycleJob,
  ],
})
export class ClassroomModule {}
