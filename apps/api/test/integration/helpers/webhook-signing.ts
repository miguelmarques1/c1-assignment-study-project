import { createHash } from 'node:crypto';

import { AccessToken } from 'livekit-server-sdk';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

/** Matches test-app.ts's LIVEKIT_API_KEY/SECRET, so signatures verify for real. */
const API_KEY = 'devkey';
const API_SECRET = 'devsecret';

let eventCounter = 0;

/**
 * Replicates `WebhookReceiver`'s own signing scheme: an `AccessToken`
 * carrying only `sha256` of the raw body. The result is the raw JWT itself —
 * LiveKit's webhook `Authorization` header carries no `Bearer ` prefix,
 * unlike this API's own session bearer transport. Same scheme
 * `classroom-webhook.spec.ts` already uses.
 */
export async function signWebhookBody(body: string, secret = API_SECRET): Promise<string> {
  const sha256 = createHash('sha256').update(body, 'utf8').digest('base64');
  const token = new AccessToken(API_KEY, secret);
  token.sha256 = sha256;
  return token.toJwt();
}

export function webhookPayload(fields: Record<string, unknown>): string {
  eventCounter += 1;
  return JSON.stringify({ id: `evt-${eventCounter}`, ...fields });
}

export async function postSignedWebhook(app: INestApplication, body: string) {
  const auth = await signWebhookBody(body);
  return request(app.getHttpServer())
    .post('/classroom/livekit-webhook')
    .set('Content-Type', 'application/webhook+json')
    .set('Authorization', auth)
    .send(body);
}

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);
