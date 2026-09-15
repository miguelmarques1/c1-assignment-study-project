import 'package:dio/dio.dart';
import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../core/network/api_exception.dart';
import '../../design/widgets/eq_badge.dart';
import '../../design/widgets/eq_button.dart';
import '../../design/widgets/eq_card.dart';
import 'credential_form.dart';
import 'credential_models.dart';

const Map<CredentialStatus, EqBadgeStatus> _kStatusBadge = {
  CredentialStatus.valid: EqBadgeStatus.success,
  CredentialStatus.invalid: EqBadgeStatus.danger,
  CredentialStatus.unverified: EqBadgeStatus.warning,
  CredentialStatus.missing: EqBadgeStatus.neutral,
};

/// Status badge, masked key, region, last-checked, and the four actions —
/// the mobile mirror of `apps/web/src/components/credential-card.tsx`.
class CredentialCard extends StatefulWidget {
  const CredentialCard({
    super.key,
    required this.credential,
    required this.onSave,
    required this.onDelete,
    required this.onRevalidate,
  });

  final MaskedCredential credential;
  final Future<void> Function(String key, String? region) onSave;
  final Future<void> Function() onDelete;
  final Future<void> Function() onRevalidate;

  @override
  State<CredentialCard> createState() => _CredentialCardState();
}

class _CredentialCardState extends State<CredentialCard> {
  bool _editing = false;
  bool _busy = false;
  String? _error;

  bool get _isMissing => widget.credential.status == CredentialStatus.missing;

  Future<void> _revalidate() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.onRevalidate();
    } on DioException catch (dioError) {
      setState(() => _error = ApiException.fromDioException(dioError).message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.onDelete();
    } on DioException catch (dioError) {
      setState(() => _error = ApiException.fromDioException(dioError).message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final credential = widget.credential;

    return EqCard(
      header: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(credential.provider.label, style: EqTextStyles.titleMd(dark: dark)),
          EqBadge(status: _kStatusBadge[credential.status]!, label: credential.status.label),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_isMissing)
            Text(kMissingCredentialCopy[credential.provider]!, style: EqTextStyles.bodyMd(dark: dark))
          else ...[
            _detailRow(dark, 'Key', credential.maskedKey ?? '—'),
            if (credential.region != null) _detailRow(dark, 'Region', credential.region!),
            _detailRow(dark, 'Last checked', _relativeTime(credential.lastValidatedAt)),
          ],
          SizedBox(height: EqSpacing.md),
          if (_editing)
            CredentialForm(
              provider: credential.provider,
              onSubmit: (key, region) async {
                await widget.onSave(key, region);
                if (mounted) setState(() => _editing = false);
              },
              onCancel: () => setState(() => _editing = false),
            )
          else
            Wrap(
              spacing: EqSpacing.sm,
              runSpacing: EqSpacing.sm,
              children: [
                EqButton(
                  label: _isMissing ? 'Add key' : 'Replace key',
                  onPressed: _busy ? null : () => setState(() => _editing = true),
                  size: EqButtonSize.sm,
                ),
                if (!_isMissing) ...[
                  EqButton(
                    label: _busy ? 'Checking…' : 'Re-check',
                    onPressed: _busy ? null : _revalidate,
                    variant: EqButtonVariant.neutral,
                    size: EqButtonSize.sm,
                  ),
                  EqButton(
                    label: 'Delete',
                    onPressed: _busy ? null : _delete,
                    variant: EqButtonVariant.destructive,
                    size: EqButtonSize.sm,
                  ),
                ],
              ],
            ),
          if (!_editing && _error != null)
            Padding(
              padding: EdgeInsets.only(top: EqSpacing.sm),
              child: Text(
                _error!,
                style: EqTextStyles.bodySm(
                  dark: dark,
                ).copyWith(color: dark ? EqDarkColors.error : EqLightColors.error),
              ),
            ),
        ],
      ),
    );
  }

  Widget _detailRow(bool dark, String label, String value) {
    return Padding(
      padding: EdgeInsets.only(bottom: EqSpacing.xs),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: EqTextStyles.bodySm(dark: dark)),
          Text(value, style: EqTextStyles.bodySm(dark: dark).copyWith(fontFamily: 'monospace')),
        ],
      ),
    );
  }

  String _relativeTime(DateTime? value) {
    if (value == null) return '—';
    final diff = DateTime.now().difference(value);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} minutes ago';
    if (diff.inHours < 24) return '${diff.inHours} hours ago';
    return '${diff.inDays} days ago';
  }
}
