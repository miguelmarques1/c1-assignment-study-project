import 'package:flutter/material.dart';

/// Placeholder so `/app/settings` exists as the shell's fifth destination
/// in Stage 4. Stage 5 replaces the body with the base URL control,
/// sign-out and the credentials section.
class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: const Center(child: Text('Settings')),
    );
  }
}
