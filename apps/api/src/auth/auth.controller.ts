import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { AuthService } from './auth.service';
import {
  CurrentSession,
  CurrentUser,
  type AuthenticatedUser,
} from './current-user.decorator';
import { Public } from './public.decorator';
import { SESSION_COOKIE, SessionService } from './session.service';

@ApiTags('auth')
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
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Issues a session cookie. A wrong password and an unknown email return an ' +
      'identical body and comparable response time, so account existence cannot be probed.',
  })
  @ApiBody({ schema: { $ref: '#/components/schemas/LoginRequest' } })
  @ApiResponse({
    status: 200,
    description: 'Signed in. Sets the `eq_session` cookie.',
    schema: dataEnvelope('PublicUser'),
  })
  @ApiResponse({ status: 400, description: 'AUTH: payload failed validation.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH001: wrong credentials.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 429, description: 'AUTH002: locked out.', ...ERROR_RESPONSE })
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
  @ApiCookieAuth(SESSION_SECURITY_SCHEME)
  @ApiOperation({
    summary: 'Sign out',
    description: 'Destroys the session server-side and clears the cookie. The token stops working immediately.',
  })
  @ApiResponse({ status: 204, description: 'Signed out.' })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async logout(
    @CurrentSession() session: { token: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(session.token);
    response.clearCookie(SESSION_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
  }

  @Get('me')
  @ApiCookieAuth(SESSION_SECURITY_SCHEME)
  @ApiOperation({
    summary: 'Current user',
    description: 'Returns the signed-in user and the session expiry, which slides on every authenticated request.',
  })
  @ApiResponse({ status: 200, description: 'The current user.', schema: dataEnvelope('CurrentUser') })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
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
  @ApiCookieAuth(SESSION_SECURITY_SCHEME)
  @ApiOperation({
    summary: 'Change password',
    description:
      'Replaces the password and evicts every other session for the account, keeping the caller signed in.',
  })
  @ApiBody({ schema: { $ref: '#/components/schemas/ChangePasswordRequest' } })
  @ApiResponse({ status: 204, description: 'Password changed; other sessions revoked.' })
  @ApiResponse({ status: 400, description: 'AUTH004: wrong current password, or invalid payload.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
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
