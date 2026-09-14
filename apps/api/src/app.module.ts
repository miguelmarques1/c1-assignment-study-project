import { Module } from '@nestjs/common';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [PrismaModule, RedisModule, StorageModule],
})
export class AppModule {}
