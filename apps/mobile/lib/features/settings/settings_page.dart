import 'package:dio/dio.dart';
import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:get/get.dart';

import '../../core/session/session_controller.dart';
import '../../design/widgets/eq_button.dart';
import '../../design/widgets/eq_page_state.dart';
import 'api_base_url_field.dart';
import 'credential_card.dart';
import 'credentials_controller.dart';

/// Base URL, sign-out, and the credentials section — the mobile mirror of
/// `apps/web/src/app/(app)/settings/page.tsx`.
class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  late final CredentialsController _credentials = CredentialsController(inject<Dio>());

  @override
  void initState() {
    super.initState();
    _credentials.load();
  }

  Future<void> _signOut() async {
    await inject<SessionController>().logout();
    if (mounted) context.navigate('/login');
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: EdgeInsets.all(EqSpacing.lg),
        children: [
          Text('API base URL', style: EqTextStyles.titleMd(dark: dark)),
          SizedBox(height: EqSpacing.sm),
          const ApiBaseUrlField(),
          SizedBox(height: EqSpacing.lg),
          EqButton(label: 'Sign out', onPressed: _signOut, variant: EqButtonVariant.destructive),
          SizedBox(height: EqSpacing.lg),
          Text('Credentials', style: EqTextStyles.titleMd(dark: dark)),
          SizedBox(height: EqSpacing.sm),
          Obx(() {
            final error = _credentials.loadError.value;
            if (error != null) {
              return EqError(cause: error, onRetry: _credentials.load);
            }

            final list = _credentials.credentials.value;
            if (list == null) {
              return const EqLoading();
            }

            return Column(
              children: [
                for (final credential in list)
                  Padding(
                    key: ValueKey(credential.provider),
                    padding: EdgeInsets.only(bottom: EqSpacing.md),
                    child: CredentialCard(
                      credential: credential,
                      onSave: (key, region) => _credentials.save(credential.provider, key, region),
                      onDelete: () => _credentials.delete(credential.provider),
                      onRevalidate: () => _credentials.revalidate(credential.provider),
                    ),
                  ),
              ],
            );
          }),
        ],
      ),
    );
  }
}
