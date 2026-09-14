import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import {
  changePasswordSchema,
  loginSchema,
  type ApiSuccess,
  type ChangePasswordInput,
  type CurrentUser as CurrentUserDto,
  type LoginInput,
  type PublicUser,
} from '@english-quest/shared';
import type { CookieOptions, Response } from 'express';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { env } from '../config/env';
import { AuthService } from './auth.service';
import {
  CurrentSession,
  CurrentUser,
  type AuthenticatedUser,
} from './current-user.decorator';
import { Public } from './public.decorator';
import { SESSION_COOKIE, SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  private cookieOptions(): CookieOptions {
    const config = env();
    return {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      signed: true,
      secure: config.NODE_ENV === 'production',
      maxAge: this.sessions.ttl * 1000,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiSuccess<PublicUser>> {
    const result = await this.auth.login(body.email, body.password);

    response.cookie(SESSION_COOKIE, result.token, this.cookieOptions());

    return { data: result.user };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentSession() session: { token: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(session.token);
    response.clearCookie(SESSION_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
  }

  @Get('me')
  me(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() session: { expiresAt: Date },
  ): ApiSuccess<CurrentUserDto> {
    return {
      data: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        sessionExpiresAt: session.expiresAt.toISOString(),
      },
    };
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() session: { token: string },
  ): Promise<void> {
    await this.auth.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
      session.token,
    );
  }
}
