import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'eq_session';
const PUBLIC_PATHS = ['/login'];

/**
 * Cheap first gate: bounce requests with no session cookie before they render.
 * It deliberately does not try to validate the cookie — the API owns that
 * decision, and the authenticated layout confirms it on every render.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
