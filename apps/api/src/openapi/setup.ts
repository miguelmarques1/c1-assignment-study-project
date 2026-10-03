import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { OPENAPI_COMPONENTS } from './components';

export const SESSION_SECURITY_SCHEME = 'sessionCookie';
export const BEARER_SECURITY_SCHEME = 'sessionBearer';

/**
 * Builds the OpenAPI document. Kept separate from main.ts so the same document
 * backs both the live UI and the committed snapshot, and the two can never
 * disagree.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    // 3.1, not the 3.0 default: Zod emits JSON Schema 2020-12, which 3.1 adopts
    // wholesale. Under 3.0 the nullable fields come out as `type: "null"`, which
    // is invalid there, and importers either reject the file or quietly drop it.
    .setOpenAPIVersion('3.1.0')
    .setTitle('English Quest API')
    .setDescription(
      [
        'API for the English Quest study platform.',
        '',
        'Every successful response nests its payload under `data`; every failure nests',
        'under `error` with a stable `code`. Clients should switch on the code, never',
        'on the message.',
        '',
        'Authentication has two transports carrying the same opaque token. Browsers use a',
        '`eq_session` cookie, issued by `POST /auth/login` — HttpOnly and signed, so it',
        'cannot be read or forged from JavaScript. Clients with no cookie jar (the native',
        'mobile app) use `POST /auth/token` instead, which returns the token in the body',
        'and sets no cookie, and carry it as `Authorization: Bearer <token>` on every',
        'later request. In Postman or Insomnia, enable the cookie jar and log in through',
        '`/auth/login`, or call `/auth/token` and set the bearer token on the collection.',
      ].join('\n'),
    )
    .setVersion('0.1.0')
    .addCookieAuth(
      'eq_session',
      { type: 'apiKey', in: 'cookie', name: 'eq_session' },
      SESSION_SECURITY_SCHEME,
    )
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'opaque token from POST /auth/token' },
      BEARER_SECURITY_SCHEME,
    )
    .addServer('http://localhost:3001', 'Local development')
    .addTag('auth', 'Session lifecycle and credentials')
    .addTag('health', 'Infrastructure dependency probes')
    .addTag('classroom', 'The persistent live-lesson room')
    .addTag('scenario', 'The lesson scenario: shared situation and private role cards')
    .addTag('recording', 'Per-participant lesson recording and its pipeline branch')
    .addTag('pipeline', "The caller's post-lesson pipeline: every stage's state, and retrying a failed one")
    .addTag('transcript', 'The merged lesson transcript')
    .addTag('pronunciation', "The caller's pronunciation assessment: scores, worst phonemes and words, per-excerpt detail")
    .addTag('analysis', "The caller's own AI lesson analysis: competency scores, tagged errors, scenario fit and topics to practice")
    .addTag('profile', "The caller's learning profile: smoothed competency scores, recurring weaknesses and the error ledger")
    .addTag('lessons', "The caller's lesson history: every lesson with its own processing status, and one lesson's summary")
    .addTag('plans', "The caller's study plan: the current plan, its history, and retrying a failed build")
    .addTag('writing', "The caller's writing activity: the composed task, its draft, submission and AI correction")
    .addTag('speaking', "The caller's read-aloud and open-response speaking activities: the task, recording, scores and re-scoring")
    .build();

  const document = SwaggerModule.createDocument(app, config);

  document.components = {
    ...document.components,
    schemas: { ...document.components?.schemas, ...OPENAPI_COMPONENTS },
  };

  return document;
}

/** Serves the UI at /docs and the raw document at /docs-json. */
export function setupOpenApi(app: INestApplication): OpenAPIObject {
  const document = buildOpenApiDocument(app);

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    yamlDocumentUrl: 'docs-yaml',
    swaggerOptions: { persistAuthorization: true },
  });

  return document;
}
