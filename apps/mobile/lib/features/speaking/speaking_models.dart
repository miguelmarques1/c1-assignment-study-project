/// Hand-written mirrors of `packages/shared/src/schemas/speaking.ts` (F18).
/// Reuses `PronunciationScores` (pronunciation.ts), `WordBand`
/// (transcript_models.dart) and `PlanTag`/`PlanActivityState`/
/// `StudyPlanStatus`/`DifficultyRating` (plan_models.dart) exactly as the
/// TypeScript schema reuses their own schemas. No user id anywhere in the
/// shape: every view is the caller's own.
library;

import '../lessons/models/json_read.dart';
import '../lessons/models/pronunciation_models.dart';
import '../lessons/models/transcript_models.dart';
import '../plan/plan_models.dart' hide Json;

/// The client's idempotency key for one recording, resent unchanged on retry.
const speakingClientAttemptIdHeader = 'X-Client-Attempt-Id';

enum SpeakingShape {
  readAloud,
  openResponse;

  static SpeakingShape fromWire(String value) => value == 'open_response' ? openResponse : readAloud;
}

enum SpeakingAttemptState {
  scoring,
  scored,
  discarded,
  failed;

  static SpeakingAttemptState fromWire(String value) => switch (value) {
    'scored' => scored,
    'discarded' => discarded,
    'failed' => failed,
    _ => scoring,
  };
}

/// Covers both a discard reason (`not_enough_speech`) and every scoring failure (A13).
enum SpeakingFailureCode {
  notEnoughSpeech,
  azureKeyMissing,
  azureKeyRejected,
  azureQuota,
  azureRegionUnsupported,
  serviceError,
  interrupted,
  internalError,
  audioRejected,
  audioMissing;

  static SpeakingFailureCode fromWire(String value) => switch (value) {
    'not_enough_speech' => notEnoughSpeech,
    'azure_key_missing' => azureKeyMissing,
    'azure_key_rejected' => azureKeyRejected,
    'azure_quota' => azureQuota,
    'azure_region_unsupported' => azureRegionUnsupported,
    'service_error' => serviceError,
    'interrupted' => interrupted,
    'internal_error' => internalError,
    'audio_rejected' => audioRejected,
    _ => audioMissing,
  };
}

/// Why nothing can be recorded, most fundamental first: archived, skipped, key.
enum SpeakingBlock {
  azureKeyMissing,
  planArchived,
  activitySkipped;

  static SpeakingBlock? fromWire(String? value) => switch (value) {
    'azure_key_missing' => azureKeyMissing,
    'plan_archived' => planArchived,
    'activity_skipped' => activitySkipped,
    _ => null,
  };
}

enum SpeakingActivityKind {
  pronunciation,
  speaking;

  static SpeakingActivityKind fromWire(String value) => value == 'speaking' ? speaking : pronunciation;
}

class SpeakingFailure {
  const SpeakingFailure({required this.code, required this.message, required this.rescorable});

  factory SpeakingFailure.fromJson(Json json) => SpeakingFailure(
    code: SpeakingFailureCode.fromWire(json['code'] as String),
    message: json['message'] as String,
    rescorable: json['rescorable'] as bool,
  );

  final SpeakingFailureCode code;
  final String message;
  final bool rescorable;
}

/// One display token (A11): the reference text or the transcript, tokenized
/// and aligned to the assessed words. An unmatched token has no band; an
/// `Insertion` is hidden entirely; an `Omission` shows as `poor` with no
/// recording offsets, since nothing was spoken.
class SpeakingWord {
  const SpeakingWord({
    required this.text,
    required this.band,
    required this.accuracy,
    required this.errorTypes,
    required this.startMs,
    required this.durationMs,
  });

  factory SpeakingWord.fromJson(Json json) => SpeakingWord(
    text: json['text'] as String,
    band: json['band'] == null ? null : WordBand.fromWire(json['band'] as String),
    accuracy: readInt(json['accuracy']),
    errorTypes: readStrings(json['errorTypes']),
    startMs: readInt(json['startMs']),
    durationMs: readInt(json['durationMs']),
  );

  final String text;
  final WordBand? band;
  final int? accuracy;
  final List<String> errorTypes;
  final int? startMs;
  final int? durationMs;

  /// Colour is never the only cue: this is what a screen reader says.
  String get spokenLabel {
    final band = this.band;
    if (band == null) return '$text: not assessed';
    final errors = errorTypes.isEmpty ? '' : ', ${errorTypes.join(', ')}';
    return '$text: ${accuracy ?? 0} out of 100, ${band.spoken}$errors';
  }
}

class SpeakingFailingPhoneme {
  const SpeakingFailingPhoneme({
    required this.tag,
    required this.label,
    required this.meanAccuracy,
    required this.instances,
    required this.exampleWord,
    required this.exampleStartMs,
    required this.exampleDurationMs,
  });

  factory SpeakingFailingPhoneme.fromJson(Json json) => SpeakingFailingPhoneme(
    tag: json['tag'] as String,
    label: json['label'] as String,
    meanAccuracy: readDouble(json['meanAccuracy'])!,
    instances: json['instances'] as int,
    exampleWord: json['exampleWord'] as String,
    exampleStartMs: readInt(json['exampleStartMs']),
    exampleDurationMs: readInt(json['exampleDurationMs']),
  );

  final String tag;
  final String label;
  final double meanAccuracy;
  final int instances;
  final String exampleWord;
  final int? exampleStartMs;
  final int? exampleDurationMs;
}

class SpeakingAttemptResult {
  const SpeakingAttemptResult({
    required this.scores,
    required this.recognizedWordCount,
    required this.transcript,
    required this.words,
    required this.failingPhonemes,
  });

  factory SpeakingAttemptResult.fromJson(Json json) => SpeakingAttemptResult(
    scores: PronunciationScores.fromJson(json['scores'] as Json),
    recognizedWordCount: json['recognizedWordCount'] as int,
    transcript: json['transcript'] as String?,
    words: readList(json['words'], SpeakingWord.fromJson),
    failingPhonemes: readList(json['failingPhonemes'], SpeakingFailingPhoneme.fromJson),
  );

  final PronunciationScores scores;
  final int recognizedWordCount;

  /// Set for an open response — its own transcript, which became the reference.
  final String? transcript;
  final List<SpeakingWord> words;
  final List<SpeakingFailingPhoneme> failingPhonemes;
}

/// Also the body of the upload and re-score routes.
class SpeakingAttemptView {
  const SpeakingAttemptView({
    required this.id,
    required this.clientAttemptId,
    required this.ordinal,
    required this.state,
    required this.createdAt,
    required this.scoredAt,
    required this.durationMs,
    required this.isBest,
    required this.failure,
    required this.result,
  });

  factory SpeakingAttemptView.fromJson(Json json) => SpeakingAttemptView(
    id: json['id'] as String,
    clientAttemptId: json['clientAttemptId'] as String,
    ordinal: readInt(json['ordinal']),
    state: SpeakingAttemptState.fromWire(json['state'] as String),
    createdAt: DateTime.parse(json['createdAt'] as String),
    scoredAt: readDate(json['scoredAt']),
    durationMs: json['durationMs'] as int,
    isBest: json['isBest'] as bool,
    failure: readObject(json['failure'], SpeakingFailure.fromJson),
    result: readObject(json['result'], SpeakingAttemptResult.fromJson),
  );

  final String id;
  final String clientAttemptId;
  final int? ordinal;
  final SpeakingAttemptState state;
  final DateTime createdAt;
  final DateTime? scoredAt;
  final int durationMs;
  final bool isBest;

  /// Set for `failed` and `discarded`.
  final SpeakingFailure? failure;

  /// Set for `scored`.
  final SpeakingAttemptResult? result;
}

class SpeakingTargetSeconds {
  const SpeakingTargetSeconds({required this.min, required this.max});

  factory SpeakingTargetSeconds.fromJson(Json json) =>
      SpeakingTargetSeconds(min: json['min'] as int, max: json['max'] as int);

  final int min;
  final int max;
}

class SpeakingTaskView {
  const SpeakingTaskView({
    required this.shape,
    required this.referenceText,
    required this.prompt,
    required this.hint,
    required this.wordCount,
    required this.focusTags,
    required this.targetSeconds,
  });

  factory SpeakingTaskView.fromJson(Json json) => SpeakingTaskView(
    shape: SpeakingShape.fromWire(json['shape'] as String),
    referenceText: json['referenceText'] as String?,
    prompt: json['prompt'] as String?,
    hint: json['hint'] as String?,
    wordCount: readInt(json['wordCount']),
    focusTags: readList(json['focusTags'], PlanTag.fromJson),
    targetSeconds: readObject(json['targetSeconds'], SpeakingTargetSeconds.fromJson),
  );

  final SpeakingShape shape;

  /// The passage — set exactly for `read_aloud`.
  final String? referenceText;

  /// The question — set exactly for `open_response`.
  final String? prompt;
  final String? hint;
  final int? wordCount;
  final List<PlanTag> focusTags;
  final SpeakingTargetSeconds? targetSeconds;
}

class SpeakingLimits {
  const SpeakingLimits({required this.maxAttempts, required this.maxRecordingSeconds, required this.minRecognizedWords});

  factory SpeakingLimits.fromJson(Json json) => SpeakingLimits(
    maxAttempts: json['maxAttempts'] as int,
    maxRecordingSeconds: json['maxRecordingSeconds'] as int,
    minRecognizedWords: json['minRecognizedWords'] as int,
  );

  final int maxAttempts;
  final int maxRecordingSeconds;
  final int minRecognizedWords;
}

class SpeakingRatingView {
  const SpeakingRatingView({required this.rating, required this.notUseful});

  factory SpeakingRatingView.fromJson(Json json) =>
      SpeakingRatingView(rating: DifficultyRating.fromWire(json['rating'] as String?), notUseful: json['notUseful'] as bool);

  final DifficultyRating? rating;
  final bool notUseful;
}

/// The body of `PUT /speaking/activities/:activityId/rating`.
class SpeakingRatingInput {
  const SpeakingRatingInput({required this.rating, required this.notUseful});

  final DifficultyRating? rating;
  final bool notUseful;

  static String? _wireFor(DifficultyRating? rating) => switch (rating) {
    DifficultyRating.tooEasy => 'too_easy',
    DifficultyRating.justRight => 'just_right',
    DifficultyRating.tooHard => 'too_hard',
    null => null,
  };

  Json toJson() => {'rating': _wireFor(rating), 'notUseful': notUseful};
}

/// Response body of `GET /speaking/activities/:activityId`.
class SpeakingActivityView {
  const SpeakingActivityView({
    required this.activityId,
    required this.kind,
    required this.title,
    required this.state,
    required this.planStatus,
    required this.estimatedMinutes,
    required this.targetTags,
    required this.task,
    required this.block,
    required this.limits,
    required this.attemptsUsed,
    required this.attemptsRemaining,
    required this.bestAttemptId,
    required this.attempts,
    required this.rating,
  });

  factory SpeakingActivityView.fromJson(Json json) => SpeakingActivityView(
    activityId: json['activityId'] as String,
    kind: SpeakingActivityKind.fromWire(json['kind'] as String),
    title: json['title'] as String,
    state: PlanActivityState.fromWire(json['state'] as String),
    planStatus: StudyPlanStatus.fromWire(json['planStatus'] as String),
    estimatedMinutes: json['estimatedMinutes'] as int,
    targetTags: readList(json['targetTags'], PlanTag.fromJson),
    task: readObject(json['task'], SpeakingTaskView.fromJson),
    block: SpeakingBlock.fromWire(json['block'] as String?),
    limits: SpeakingLimits.fromJson(json['limits'] as Json),
    attemptsUsed: json['attemptsUsed'] as int,
    attemptsRemaining: json['attemptsRemaining'] as int,
    bestAttemptId: json['bestAttemptId'] as String?,
    attempts: readList(json['attempts'], SpeakingAttemptView.fromJson),
    rating: readObject(json['rating'], SpeakingRatingView.fromJson),
  );

  final String activityId;
  final SpeakingActivityKind kind;
  final String title;
  final PlanActivityState state;
  final StudyPlanStatus planStatus;
  final int estimatedMinutes;
  final List<PlanTag> targetTags;

  /// Null only for an archived activity that never had a task (A18).
  final SpeakingTaskView? task;
  final SpeakingBlock? block;
  final SpeakingLimits limits;
  final int attemptsUsed;
  final int attemptsRemaining;
  final String? bestAttemptId;

  /// Oldest first. `scoring`, `scored` and `failed` only — never `discarded`.
  final List<SpeakingAttemptView> attempts;
  final SpeakingRatingView? rating;

  /// Only `rating` ever needs replacing in place (after `PUT .../rating`); everything else comes from a fresh `GET`.
  SpeakingActivityView copyWithRating(SpeakingRatingView rating) => SpeakingActivityView(
    activityId: activityId,
    kind: kind,
    title: title,
    state: state,
    planStatus: planStatus,
    estimatedMinutes: estimatedMinutes,
    targetTags: targetTags,
    task: task,
    block: block,
    limits: limits,
    attemptsUsed: attemptsUsed,
    attemptsRemaining: attemptsRemaining,
    bestAttemptId: bestAttemptId,
    attempts: attempts,
    rating: rating,
  );
}
