import { Module } from '@nestjs/common';

import { ProfileTagsPort } from './profile-tags.port';

/**
 * F12's future home. Today it holds only the seam F06 and F11 both call for
 * a participant's recurring weakness tags — a single replacement point
 * instead of one per consumer.
 */
@Module({
  providers: [ProfileTagsPort],
  exports: [ProfileTagsPort],
})
export class ProfileModule {}
