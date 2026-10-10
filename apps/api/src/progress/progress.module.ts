import { Module } from '@nestjs/common';

import { ProfileModule } from '../profile/profile.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

/**
 * The progress dashboard (F20): one caller-scoped route over F12's profile
 * service and readers. A module of its own so the Full Scope can import
 * F15's and F06's readers here without growing `ProfileModule`.
 */
@Module({
  imports: [ProfileModule],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
