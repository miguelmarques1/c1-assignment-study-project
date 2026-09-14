import { cookies } from 'next/headers';
import type { ApiResponse, MaskedCredential } from '@english-quest/shared';

import { internalApiUrl, SESSION_COOKIE } from './api-client';

/**
 * Server-side read of the credential list, mirroring how the authenticated
 * layout resolves the session. Rendering the cards on the server avoids a
 * loading flash on a page the user opens rarely, and keeps the page verifiable
 * without a browser.
 */
export async function getCredentials(): Promise<MaskedCredential[] | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE);

  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${internalApiUrl}/credentials`, {
      headers: { cookie: `${SESSION_COOKIE}=${token.value}` },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ApiResponse<MaskedCredential[]>;
    return 'data' in payload ? payload.data : null;
  } catch {
    return null;
  }
}
