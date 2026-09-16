import { Module } from '@nestjs/common';

import { ClassroomController } from './classroom.controller';
import { ClassroomService } from './classroom.service';
import { LessonService } from './lesson.service';
import { LiveKitService } from './livekit.service';

@Module({
  controllers: [ClassroomController],
  providers: [ClassroomService, LessonService, LiveKitService],
})
export class ClassroomModule {}
