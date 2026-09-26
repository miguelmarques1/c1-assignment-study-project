import { cookies } from 'next/headers';
import type {
  ApiResponse,
  ClassroomSession,
  CurrentUser,
  LearningProfileView,
  ScenarioView,
} from '@english-quest/shared';

import { internalApiUrl, SESSION_COOKIE } from './api-client';

/**
 * Resolves the current user from a server component. The API is the authority
 * on whether a session is still valid — the middleware only checks that a
 * cookie is present, which is a cheap gate, not an authentication decision.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE);

  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${internalApiUrl}/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token.value}` },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ApiResponse<CurrentUser>;
    return 'data' in payload ? payload.data : null;
  } catch {
    // API unreachable: treat as unauthenticated rather than rendering a shell
    // that will fail on its first real request.
    return null;
  }
}

/** Server-side read of the open classroom session, for the dashboard hero. */
export async function getClassroomSession(): Promise<ClassroomSession> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE);

  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${internalApiUrl}/classroom/session`, {
      headers: { cookie: `${SESSION_COOKIE}=${token.value}` },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ApiResponse<ClassroomSession>;
    return 'data' in payload ? payload.data : null;
  } catch {
    return null;
  }
}

/** Server-side read of the current scenario, for the dashboard's recommended-scenario card. */
export async function getScenarioView(): Promise<ScenarioView> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE);

  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${internalApiUrl}/classroom/scenario`, {
      headers: { cookie: `${SESSION_COOKIE}=${token.value}` },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ApiResponse<ScenarioView>;
    return 'data' in payload ? payload.data : null;
  } catch {
    return null;
  }
}

/** Server-side read of the caller's learning profile (F12); null on any failure, so the screen retries from the browser. */
export async function getProfileView(): Promise<LearningProfileView | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE);

  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${internalApiUrl}/profile`, {
      headers: { cookie: `${SESSION_COOKIE}=${token.value}` },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ApiResponse<LearningProfileView>;
    return 'data' in payload ? payload.data : null;
  } catch {
    return null;
  }
}
