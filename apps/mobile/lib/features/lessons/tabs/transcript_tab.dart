import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../design/widgets/eq_chip.dart';
import '../../../design/widgets/eq_page_state.dart';
import '../lesson_detail_controller.dart';
import '../lessons_page.dart';
import '../models/transcript_models.dart';
import '../widgets/lesson_header.dart';
import '../widgets/palette.dart';
import '../widgets/utterance_tile.dart';

/// The shared record of the lesson: every participant's lines in order, a
/// clock in the margin, the speaker (`You` for the viewer), and badges on
/// the viewer's own excerpts. Opening it from an error, a worst word or an
/// assessed excerpt scrolls to and highlights that line.
class TranscriptTab extends StatefulWidget {
  const TranscriptTab({super.key, required this.controller, this.anchoredUtteranceId});

  final LessonDetailController controller;
  final String? anchoredUtteranceId;

  @override
  State<TranscriptTab> createState() => _TranscriptTabState();
}

class _TranscriptTabState extends State<TranscriptTab> {
  final _keys = <String, GlobalKey>{};
  String? _scrolledTo;

  GlobalKey _keyFor(String utteranceId) => _keys.putIfAbsent(utteranceId, GlobalKey.new);

  void _scrollToAnchor() {
    final target = widget.anchoredUtteranceId;
    if (target == null || target == _scrolledTo) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final anchored = _keys[target]?.currentContext;
      if (anchored == null || !mounted) return;
      _scrolledTo = target;
      Scrollable.ensureVisible(anchored, alignment: 0.3, duration: const Duration(milliseconds: 250));
    });
  }

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final palette = LessonPalette.of(context);
      final lesson = widget.controller.detail.data.value!.summary;
      final error = widget.controller.transcript.error.value;
      final view = widget.controller.transcript.data.value;
      if (view != null) _scrollToAnchor();

      // A column rather than a lazy list, so every line exists to scroll to.
      return RefreshIndicator(
        onRefresh: widget.controller.loadTranscript,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.all(EqSpacing.marginMobile),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              LessonHeader(lesson: lesson),
              SizedBox(height: EqSpacing.md),
              if (error != null)
                EqError(cause: lessonLoadFailure(error, 'the transcript'), onRetry: widget.controller.loadTranscript)
              else if (view == null)
                const EqLoading()
              else ...[
                Wrap(
                  spacing: EqSpacing.sm,
                  runSpacing: EqSpacing.xs,
                  children: [
                    for (final speaker in view.speakers)
                      EqChip(label: speaker.statusLabel == null ? speaker.name : '${speaker.name} · ${speaker.statusLabel}'),
                  ],
                ),
                SizedBox(height: EqSpacing.md),
                if (view.utterances.isEmpty)
                  Text('No transcript is available for this lesson yet.', style: palette.body)
                else
                  for (final utterance in view.utterances)
                    UtteranceTile(
                      key: _keyFor(utterance.id),
                      utterance: utterance,
                      speaker: _speakerName(view, utterance),
                      mine: _isMine(view, utterance),
                      highlighted: utterance.id == widget.anchoredUtteranceId,
                    ),
              ],
            ],
          ),
        ),
      );
    });
  }

  String _speakerName(LessonTranscriptView view, TranscriptUtterance utterance) {
    for (final speaker in view.speakers) {
      if (speaker.userId == utterance.userId) return speaker.name;
    }
    return 'Participant';
  }

  bool _isMine(LessonTranscriptView view, TranscriptUtterance utterance) =>
      view.speakers.any((speaker) => speaker.isMe && speaker.userId == utterance.userId);
}
