import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
}

/** What the session guard attaches to the request once it has authenticated it. */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  sessionToken?: string;
  sessionExpiresAt?: Date;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      // Unreachable behind the guard; throwing beats returning undefined and
      // letting it surface as a confusing null further down.
      throw new Error('CurrentUser used on a route that is not session-guarded.');
    }
    return request.user;
  },
);

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): { token: string; expiresAt: Date } => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.sessionToken || !request.sessionExpiresAt) {
      throw new Error('CurrentSession used on a route that is not session-guarded.');
    }
    return { token: request.sessionToken, expiresAt: request.sessionExpiresAt };
  },
);
