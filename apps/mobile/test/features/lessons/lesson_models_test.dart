import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/lessons/models/analysis_models.dart';
import 'package:mobile/features/lessons/models/lesson_models.dart';
import 'package:mobile/features/lessons/models/pipeline_models.dart';
import 'package:mobile/features/lessons/models/pronunciation_models.dart';
import 'package:mobile/features/lessons/models/recording_models.dart';
import 'package:mobile/features/lessons/models/scenario_models.dart';
import 'package:mobile/features/lessons/models/transcript_models.dart';

import 'fixtures.dart';

void main() {
  test('parses_every_view_including_extensions', () {
    final list = LessonList.fromJson(
      listJson([
        summaryJson(),
        summaryJson(id: '00000000-0000-4000-8000-000000000002', status: 'too_short', flags: ['partial', 'no_scenario', 'ended_unexpectedly', 'future_flag']),
      ], nextCursor: 'abc'),
    );
    expect(list.lessons, hasLength(2));
    expect(list.nextCursor, 'abc');
    expect(list.totalStorageBytes, 13002342);
    expect(list.lessons.first.status, LessonHistoryStatus.ready);
    expect(list.lessons.first.headline, 'Grammar +4 · Pronunciation −2');
    expect(list.lessons.first.participants.map((p) => p.isMe), [true, false]);
    // An unknown flag is dropped rather than breaking the row.
    expect(list.lessons.last.flags, [LessonHistoryFlag.partial, LessonHistoryFlag.noScenario, LessonHistoryFlag.endedUnexpectedly]);
    expect(list.lessons.last.status.label, 'Too short');

    final detail = LessonDetail.fromJson(detailJson());
    expect(detail.scenarioStatus, 'ready');
    expect(detail.myCardStatus, 'ready');
    expect(detail.others.single.stages.map((s) => s.state.label), ['Done', 'Done', 'Done', 'In progress', 'Not started', 'Not started']);

    final analysis = LessonAnalysisView.fromJson(analysisJson()).analysis!;
    expect(analysis.competencies.map((c) => c.delta), [4, -2, 0, null, 1]);
    expect(analysis.errors.first.correctionSegments.where((s) => s.changed).single.text, 'had');
    expect(analysis.errors.first.recurrence!.label, '4th time');
    expect(analysis.errors.last.recurrence, isNull);
    expect(analysis.scenarioFit!.expressionsNotUsed, hasLength(2));

    final pronunciation = LessonPronunciationView.fromJson(pronunciationJson());
    expect(pronunciation.result!.overall.score, 78);
    expect(pronunciation.result!.overall.delta, -2);
    expect(pronunciation.result!.scores.prosody, isNull);
    expect(pronunciation.excerpts.map((e) => e.pronunciation.badgeText), ['71', '85']);

    final transcript = LessonTranscriptView.fromJson(transcriptJson());
    final badge = transcript.utterances.first.excerpt!;
    expect(badge.assessedWords!.map((w) => w.band), [WordBand.poor, WordBand.fair, WordBand.good]);
    expect(badge.assessedWords!.first.spokenLabel, 'known: 54 out of 100, needs work, Mispronunciation');
    expect(transcript.utterances[1].excerpt, isNull);
    expect(transcript.speakers[1].statusLabel, 'Transcript pending');

    final scenario = LessonScenarioView.fromJson(scenarioJson());
    expect(scenario.situation!.roles, hasLength(2));
    expect(scenario.myCard!.constraint, startsWith('You already declined'));

    final recording = LessonRecordingView.fromJson(recordingJson());
    expect(recording.myRecordingStatus, 'partial');
    expect(recording.myCapturedSeconds, 2520);
    expect(recording.myBranchRetryable, isFalse);
  });

  test('an_unknown_stage_falls_back_to_its_humanized_name', () {
    final pipeline = LessonPipelineView.fromJson(pipelineJson(unknownStage: 'plan_generation'));
    final unknown = pipeline.stages.last;
    expect(unknown.stage.isKnown, isFalse);
    expect(unknown.stage.title, 'Plan generation');
    expect(unknown.status, PipelineStageStatus.queued);

    final failed = pipeline.stage(const PipelineStage('lesson_analysis'))!;
    expect(failed.status, PipelineStageStatus.failed);
    expect(failed.retryable, isTrue);
    expect(failed.providerMessage, 'Schema validation failed at /errors/3');
    expect(pipeline.stage(const PipelineStage('pronunciation_assessment'))!.progressTotal, 12);
    expect(const PipelineStage('transcription').active, 'Transcribing');
  });
}
