import 'session_user.dart';

sealed class SessionState {
  const SessionState();
}

/// Boot-time `GET /auth/me` in flight — the splash route.
final class Restoring extends SessionState {
  const Restoring();
}

/// Token present and confirmed valid server-side — the authenticated shell.
final class Authenticated extends SessionState {
  const Authenticated(this.user);

  final SessionUser user;
}

/// No token, or the token was rejected — the login route.
final class Unauthenticated extends SessionState {
  const Unauthenticated();
}
