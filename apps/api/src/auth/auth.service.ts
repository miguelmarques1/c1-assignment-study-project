import { Injectable } from '@nestjs/common';
import type { PublicUser } from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { LoginThrottleService } from './login-throttle.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

export interface LoginResult {
  user: PublicUser;
  token: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottleService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    // Lockout is checked before credentials on purpose: once an address is
    // locked it stays locked for the window, even if the password is right.
    await this.throttle.assertNotLocked(email);

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Spend the same work a real comparison would, so an unknown email and a
      // wrong password are indistinguishable by response time.
      await this.passwords.verifyAgainstDummy(password);
      await this.throttle.recordFailure(email);
      throw AppError.invalidCredentials();
    }

    const matches = await this.passwords.verify(password, user.passwordHash);
    if (!matches) {
      await this.throttle.recordFailure(email);
      throw AppError.invalidCredentials();
    }

    await this.throttle.clear(email);
    const { token, expiresAt } = await this.sessions.issue(user.id);

    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      token,
      expiresAt,
    };
  }

  async logout(token: string): Promise<void> {
    await this.sessions.revoke(token);
  }

  /**
   * Changing a password evicts every other session for the account, keeping
   * only the caller's. A password change is how someone reacts to a suspected
   * compromise, so leaving other devices signed in would defeat the point.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentToken: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw AppError.sessionInvalid();
    }

    const matches = await this.passwords.verify(currentPassword, user.passwordHash);
    if (!matches) {
      throw AppError.wrongCurrentPassword();
    }

    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    await this.sessions.revokeAllForUser(userId, currentToken);
  }
}
