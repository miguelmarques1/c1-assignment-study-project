import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SESSION_COOKIE, SessionService } from './session.service';

/**
 * Authenticates every request that is not explicitly marked public. Registered
 * globally so a new controller is protected by default and has to opt out on
 * purpose.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.signedCookies?.[SESSION_COOKIE] as string | undefined;

    if (!token) {
      throw AppError.sessionInvalid();
    }

    const session = await this.sessions.resolve(token);
    if (!session) {
      throw AppError.sessionInvalid();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, displayName: true },
    });

    if (!user) {
      // The account was deleted while the session was still alive. Clean up so
      // the orphan is not re-checked on every subsequent request.
      await this.sessions.revoke(token);
      throw AppError.sessionInvalid();
    }

    request.user = user;
    request.sessionToken = token;
    request.sessionExpiresAt = session.expiresAt;

    return true;
  }
}
