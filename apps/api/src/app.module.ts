import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';

import { AnalysisModule } from './analysis/analysis.module';
import { AuthModule } from './auth/auth.module';
import { SessionGuard } from './auth/session.guard';
import { ClassroomModule } from './classroom/classroom.module';
import { ContentModule } from './content/content.module';
import { env } from './config/env';
import { CredentialsModule } from './credentials/credentials.module';
import { ExcerptSelectionModule } from './excerpts/excerpt-selection.module';
import { GenerationModule } from './generation/generation.module';
import { HealthModule } from './health/health.module';
import { LessonsModule } from './lessons/lessons.module';
import { PlanGenerationModule } from './plan-generation/plan-generation.module';
import { PlansModule } from './plans/plans.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileUpdateModule } from './profile-update/profile-update.module';
import { PromptsModule } from './prompts/prompts.module';
import { PronunciationModule } from './pronunciation/pronunciation.module';
import { RedisModule } from './redis/redis.module';
import { ScenarioModule } from './scenario/scenario.module';
import { SpeakingModule } from './speaking/speaking.module';
import { StorageModule } from './storage/storage.module';
import { TaxonomyModule } from './taxonomy/taxonomy.module';
import { TranscriptionModule } from './transcription/transcription.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // The factory runs only when the application actually starts, so the
    // OpenAPI generator's preview boot never opens a Redis connection.
    BullModule.forRootAsync({
      useFactory: () => ({ connection: { url: env().REDIS_URL } }),
    }),
    PrismaModule,
    RedisModule,
    StorageModule,
    AuthModule,
    HealthModule,
    CredentialsModule,
    PromptsModule,
    ClassroomModule,
    ScenarioModule,
    TranscriptionModule,
    ExcerptSelectionModule,
    PronunciationModule,
    TaxonomyModule,
    AnalysisModule,
    LessonsModule,
    ProfileUpdateModule,
    ContentModule,
    GenerationModule,
    PlansModule,
    PlanGenerationModule,
    SpeakingModule,
  ],
  providers: [
    // Authentication is global: a route is protected unless it opts out with
    // @Public(), so a new controller cannot be exposed by omission.
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
