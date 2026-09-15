import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:get/get.dart';

import 'core/session/session_controller.dart';
import 'core/session/session_state.dart';

/// The splash route: shown only while `SessionController.restore()` — the
/// boot-time `GET /auth/me` — is in flight, then hands off to `/app/today`
/// or `/login` once the session state resolves. Registered as the app's
/// root `/` route so navigating there never race-conditions with the
/// restore call that hasn't started yet.
class BootGate extends StatefulWidget {
  const BootGate({super.key});

  @override
  State<BootGate> createState() => _BootGateState();
}

class _BootGateState extends State<BootGate> {
  late final Worker _worker;

  @override
  void initState() {
    super.initState();
    final session = inject<SessionController>();
    _worker = ever<SessionState>(session.state, _handle);
    session.restore();
  }

  @override
  void dispose() {
    _worker.dispose();
    super.dispose();
  }

  void _handle(SessionState value) {
    if (!mounted) return;
    switch (value) {
      case Authenticated():
        context.navigate('/app/today');
      case Unauthenticated():
        context.navigate('/login');
      case Restoring():
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
