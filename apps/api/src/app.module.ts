import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { SessionGuard } from './auth/session.guard';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [PrismaModule, RedisModule, StorageModule, AuthModule, HealthModule],
  providers: [
    // Authentication is global: a route is protected unless it opts out with
    // @Public(), so a new controller cannot be exposed by omission.
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
