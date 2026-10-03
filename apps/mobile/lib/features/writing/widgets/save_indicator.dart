import 'dart:async';

import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../core/format/relative_time.dart';
import '../writing_controller.dart';

/// Lower-cases the leading word of a relative label mid-sentence (`Just now` → `just now`).
String _lowerFirst(String value) => value.isEmpty ? value : '${value[0].toLowerCase()}${value.substring(1)}';

/// A subtle confirmation of autosave (spec §4): `Saved {relative}`, refreshed
/// every 15 seconds so the relative label stays current, `Saving…`, or
/// `Saved on this device · not synced` when the server copy could not be
/// reached. Says nothing while a conflict is shown — the banner owns that.
class SaveIndicator extends StatefulWidget {
  const SaveIndicator({super.key, required this.saveState, required this.savedAt});

  final WritingSaveState saveState;
  final DateTime? savedAt;

  @override
  State<SaveIndicator> createState() => _SaveIndicatorState();
}

class _SaveIndicatorState extends State<SaveIndicator> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 15), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final color = dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;
    final style = EqTextStyles.labelMd(dark: dark).copyWith(color: color);

    if (widget.saveState == WritingSaveState.conflict) {
      return const SizedBox.shrink();
    }
    if (widget.saveState == WritingSaveState.saving) {
      return Text('Saving…', style: style);
    }
    if (widget.saveState == WritingSaveState.localOnly) {
      return Text('Saved on this device · not synced', style: style);
    }
    final savedAt = widget.savedAt;
    if (savedAt == null) {
      return const SizedBox.shrink();
    }
    return Text('Saved ${_lowerFirst(formatRelativeTime(savedAt))}', style: style);
  }
}
