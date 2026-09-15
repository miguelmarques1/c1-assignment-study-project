import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';

/// The app's coupling map: which modules exist and how they connect.
///
/// Route-less core registrations (config, storage, Dio, session,
/// connectivity, audio) and the auth/shell/settings child modules arrive in
/// later stages of F03. The placeholder route below is replaced once the
/// shell module (Stage 4) owns real navigation.
final appModule = createModule(
  register: (c) {
    c.route('/', child: (context, state) => const _BootPlaceholder());
  },
);

class _BootPlaceholder extends StatelessWidget {
  const _BootPlaceholder();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
