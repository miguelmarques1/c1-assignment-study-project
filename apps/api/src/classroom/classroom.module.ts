import { Module } from '@nestjs/common';

import { ClassroomWebhookController } from './classroom-webhook.controller';
import { ClassroomController } from './classroom.controller';
import { ClassroomService } from './classroom.service';
import { LessonLifecycleJob } from './lesson-lifecycle.job';
import { LessonLifecycleService } from './lesson-lifecycle.service';
import { LessonService } from './lesson.service';
import { LiveKitService } from './livekit.service';

@Module({
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
