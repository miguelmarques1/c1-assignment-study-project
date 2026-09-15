import 'package:flutter/material.dart';

/// Placeholder so the `/login` route and its reverse guard exist and are
/// testable in Stage 4. Stage 5 replaces the body with the real form
/// (email, password, lockout copy, the base-URL affordance).
class LoginPage extends StatelessWidget {
  const LoginPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: Text('English Quest')));
  }
}
