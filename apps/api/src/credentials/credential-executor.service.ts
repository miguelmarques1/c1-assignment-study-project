import { Injectable } from '@nestjs/common';
import type { CredentialProvider } from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { CredentialUsageService } from './credential-usage.service';
import { CredentialsService } from './credentials.service';

export interface KeyContext {
  key: string;
  region: string | null;
}

/**
 * Detects that a provider refused the credential itself, as opposed to failing
 * for any other reason. Only this case invalidates the stored key — a timeout
 * or a rate limit must not. Exported for F11's own outcome classifier, which
 * needs the same test against Gemini's errors to decide when to block.
 */
export function isAuthenticationFailure(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 401 || status === 403) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|UNAUTHENTICATED|invalid subscription key/i.test(
    message,
  );
}

function errorCodeOf(error: unknown): string {
  if (error instanceof AppError) {
    return error.code;
  }
  const status = (error as { status?: number })?.status;
  return status ? `HTTP_${status}` : 'UNKNOWN';
}

/**
 * The contract every feature that needs a provider key goes through.
 *
 * Callers hand over work rather than receiving a key, which is what makes the
 * PRD's "audit every use" requirement enforceable: the audit is written by this
 * wrapper, so using a key without auditing is not expressible. It also keeps
 * the decrypted value from outliving the call.
 */
@Injectable()
export class CredentialExecutorService {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly usage: CredentialUsageService,
  ) {}

  async withKey<T>(
    userId: string,
    provider: CredentialProvider,
    feature: string,
    work: (context: KeyContext) => Promise<T>,
  ): Promise<T> {
    let context: KeyContext;

    try {
      context = await this.credentials.resolveDecrypted(userId, provider);
    } catch (error) {
      await this.usage.record(userId, provider, feature, 'blocked', errorCodeOf(error));
      throw error;
    }

    try {
      const result = await work(context);
      await this.usage.record(userId, provider, feature, 'ok');
      return result;
    } catch (error) {
      if (isAuthenticationFailure(error)) {
        // The key was revoked or rotated upstream. Marking it invalid here is
        // what stops the next twenty calls from burning quota against a key
        // that is already known to be dead.
        await this.credentials.markStatus(userId, provider, 'invalid');
      }

      await this.usage.record(userId, provider, feature, 'provider_error', errorCodeOf(error));
      throw error;
    }
  }
}
