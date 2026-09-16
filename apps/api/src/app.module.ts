import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';

import { AuthModule } from './auth/auth.module';
import { SessionGuard } from './auth/session.guard';
import { ClassroomModule } from './classroom/classroom.module';
import { CredentialsModule } from './credentials/credentials.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { PromptsModule } from './prompts/prompts.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    StorageModule,
    AuthModule,
    HealthModule,
    CredentialsModule,
    PromptsModule,
    ClassroomModule,
  ],
  providers: [
    // Authentication is global: a route is protected unless it opts out with
    // @Public(), so a new controller cannot be exposed by omission.
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
