import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Authentication is on by default for every route. This marks the handful that
 * must work without a session — login and the health probe — so forgetting the
 * decorator fails closed rather than open.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
