import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_button.dart';
import '../writing_controller.dart';
import '../writing_models.dart';
import 'draft_conflict_banner.dart';
import 'save_indicator.dart';
import 'word_counter.dart';
import 'writing_notices.dart';

/// The editor view (spec §4): notices and the conflict banner above a
/// full-height text field, then a bar holding the word counter, the save
/// indicator and the primary action, pinned above the keyboard so its own
/// toolbar never covers the counter. Read-only while a conflict is shown.
class WritingEditor extends StatefulWidget {
  const WritingEditor({
    super.key,
    required this.text,
    required this.onTextChange,
    required this.wordCount,
    required this.saveState,
    required this.savedAt,
    required this.geminiKeyUsable,
    required this.limit,
    required this.now,
    required this.failureMessage,
    required this.onRetryFailure,
    required this.retryingFailure,
    required this.conflict,
    required this.localVersionText,
    required this.onContinueWithLatest,
    required this.canSubmit,
    required this.onSubmitPressed,
    this.onGoToSettings,
  });

  final String text;
  final ValueChanged<String> onTextChange;
  final int wordCount;
  final WritingSaveState saveState;
  final DateTime? savedAt;
  final bool geminiKeyUsable;
  final WritingLimitView limit;
  final DateTime now;
  final String? failureMessage;
  final VoidCallback onRetryFailure;
  final bool retryingFailure;
  final ActiveDraftConflict? conflict;
  final String? localVersionText;
  final VoidCallback onContinueWithLatest;
  final bool canSubmit;
  final VoidCallback onSubmitPressed;
  final VoidCallback? onGoToSettings;

  @override
  State<WritingEditor> createState() => _WritingEditorState();
}

class _WritingEditorState extends State<WritingEditor> {
  late final TextEditingController _controller = TextEditingController(text: widget.text);

  @override
  void didUpdateWidget(WritingEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Only a change that didn't originate from this field's own `onChanged` echo (a reconciled or
    // conflict-adopted server copy) needs pushing in — otherwise this would fight the user's cursor.
    if (widget.text != _controller.text) {
      _controller.value = TextEditingValue(text: widget.text, selection: TextSelection.collapsed(offset: widget.text.length));
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final limitReached = widget.limit.used >= widget.limit.max;
    final readOnly = widget.conflict != null;

    // The keyboard never covers the bottom bar: `Scaffold`'s default
    // `resizeToAvoidBottomInset` already shrinks the body above it, so no
    // manual `viewInsets` padding is needed here (double-counting it would
    // just overflow the column by the same amount).
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!widget.geminiKeyUsable) ...[MissingKeyNotice(onGoToSettings: widget.onGoToSettings), SizedBox(height: EqSpacing.sm)],
        if (limitReached) ...[LimitNotice(limit: widget.limit, now: widget.now), SizedBox(height: EqSpacing.sm)],
        if (widget.failureMessage != null) ...[
          FailureNotice(message: widget.failureMessage!, onRetry: widget.onRetryFailure, retrying: widget.retryingFailure),
          SizedBox(height: EqSpacing.sm),
        ],
        if (widget.conflict != null && widget.localVersionText != null) ...[
          DraftConflictBanner(variant: widget.conflict!.variant, localText: widget.localVersionText!, onContinue: widget.onContinueWithLatest),
          SizedBox(height: EqSpacing.sm),
        ],
        Expanded(
          child: TextField(
            controller: _controller,
            onChanged: widget.onTextChange,
            readOnly: readOnly,
            maxLines: null,
            expands: true,
            textAlignVertical: TextAlignVertical.top,
            decoration: const InputDecoration(labelText: 'Your writing'),
          ),
        ),
        Padding(
          padding: EdgeInsets.only(top: EqSpacing.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              WordCounter(count: widget.wordCount),
              SaveIndicator(saveState: widget.saveState, savedAt: widget.savedAt),
              SizedBox(height: EqSpacing.sm),
              EqButton(label: 'Submit for correction', onPressed: widget.canSubmit ? widget.onSubmitPressed : null),
            ],
          ),
        ),
      ],
    );
  }
}
