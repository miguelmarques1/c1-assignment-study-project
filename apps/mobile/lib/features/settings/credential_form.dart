import 'package:dio/dio.dart';
import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/network/api_exception.dart';
import '../../design/widgets/eq_button.dart';
import 'credential_models.dart';

/// Secure text field, paste enabled, autocorrect disabled. Region is
/// required for Azure Speech only. No affordance anywhere reveals the
/// stored key — this form only ever writes one, never reads one back.
class CredentialForm extends StatefulWidget {
  const CredentialForm({
    super.key,
    required this.provider,
    required this.onSubmit,
    required this.onCancel,
  });

  final CredentialProvider provider;
  final Future<void> Function(String key, String? region) onSubmit;
  final VoidCallback onCancel;

  @override
  State<CredentialForm> createState() => _CredentialFormState();
}

class _CredentialFormState extends State<CredentialForm> {
  final _keyController = TextEditingController();
  final _regionController = TextEditingController();
  bool _submitting = false;
  String? _error;
  String? _providerMessage;

  bool get _needsRegion => widget.provider == CredentialProvider.azureSpeech;

  @override
  void dispose() {
    _keyController.dispose();
    _regionController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _providerMessage = null;
    });

    final key = _keyController.text.trim();
    if (key.length < 20) {
      setState(() => _error = 'That key looks too short.');
      return;
    }

    String? region;
    if (_needsRegion) {
      region = _regionController.text.trim();
      if (region.isEmpty) {
        setState(() => _error = 'Region is required for Azure Speech.');
        return;
      }
    }

    setState(() => _submitting = true);
    try {
      await widget.onSubmit(key, region);
    } on DioException catch (dioError) {
      final apiError = ApiException.fromDioException(dioError);
      setState(() {
        _error = apiError.message;
        _providerMessage = apiError.code == 'CRED001'
            ? (apiError.details?['providerMessage'] as String?)
            : null;
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _keyController,
          obscureText: true,
          enableInteractiveSelection: true,
          autocorrect: false,
          enabled: !_submitting,
          decoration: const InputDecoration(labelText: 'API key'),
        ),
        if (_needsRegion) ...[
          SizedBox(height: EqSpacing.sm),
          TextField(
            controller: _regionController,
            autocorrect: false,
            inputFormatters: [FilteringTextInputFormatter.deny(RegExp(r'\s'))],
            enabled: !_submitting,
            decoration: const InputDecoration(labelText: 'Region', hintText: 'brazilsouth'),
          ),
        ],
        SizedBox(height: EqSpacing.sm),
        Row(
          children: [
            EqButton(
              label: 'Save and validate',
              onPressed: _submitting ? null : _submit,
              loading: _submitting,
              loadingLabel: 'Validating…',
              size: EqButtonSize.sm,
            ),
            SizedBox(width: EqSpacing.sm),
            EqButton(
              label: 'Cancel',
              onPressed: _submitting ? null : widget.onCancel,
              variant: EqButtonVariant.neutral,
              size: EqButtonSize.sm,
            ),
          ],
        ),
        if (_error != null)
          Padding(
            padding: EdgeInsets.only(top: EqSpacing.sm),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _error!,
                  style: EqTextStyles.bodySm(
                    dark: dark,
                  ).copyWith(color: dark ? EqDarkColors.error : EqLightColors.error),
                ),
                if (_providerMessage != null)
                  Text(
                    _providerMessage!,
                    style: EqTextStyles.bodySm(dark: dark).copyWith(fontFamily: 'monospace'),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}
