import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { OPENAPI_COMPONENTS } from './components';

export const SESSION_SECURITY_SCHEME = 'sessionCookie';

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
        'Authentication is a session cookie named `eq_session`, issued by `POST /auth/login`.',
        'It is HttpOnly and signed, so it cannot be read or forged from JavaScript — in',
        'Postman or Insomnia, enable the cookie jar and the session is kept automatically',
        'after a login request.',
      ].join('\n'),
    )
    .setVersion('0.1.0')
    .addCookieAuth(
      'eq_session',
      { type: 'apiKey', in: 'cookie', name: 'eq_session' },
      SESSION_SECURITY_SCHEME,
    )
    .addServer('http://localhost:3001', 'Local development')
    .addTag('auth', 'Session lifecycle and credentials')
    .addTag('health', 'Infrastructure dependency probes')
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
