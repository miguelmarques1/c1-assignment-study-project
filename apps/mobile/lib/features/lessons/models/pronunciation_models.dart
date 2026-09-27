import 'json_read.dart';

class PronunciationScores {
  const PronunciationScores({
    required this.pronunciation,
    required this.accuracy,
    required this.fluency,
    required this.prosody,
    required this.completeness,
  });

  factory PronunciationScores.fromJson(Json json) => PronunciationScores(
    pronunciation: readDouble(json['pronunciation'])!,
    accuracy: readDouble(json['accuracy'])!,
    fluency: readDouble(json['fluency'])!,
    prosody: readDouble(json['prosody']),
    completeness: readDouble(json['completeness'])!,
  );

  final double pronunciation;
  final double accuracy;
  final double fluency;

  /// Null where the locale reports none: rendered `Not measured`.
  final double? prosody;
  final double completeness;
}

/// An excerpt's own state — identical on the transcript badge and the pronunciation section (F10).
class ExcerptPronunciation {
  const ExcerptPronunciation({required this.status, required this.scores});

  factory ExcerptPronunciation.fromJson(Json json) => ExcerptPronunciation(
    status: json['status'] as String,
    scores: readObject(json['scores'], PronunciationScores.fromJson),
  );

  /// `pending`, `assessed` or `not_assessed`.
  final String status;
  final PronunciationScores? scores;

  /// The badge text, shared by the transcript and the section so they never disagree.
  String get badgeText {
    final assessed = scores;
    if (status == 'assessed' && assessed != null) return '${assessed.pronunciation.round()}';
    return status == 'pending' ? 'Pending' : 'Not assessed';
  }
}

class PronunciationOverall {
  const PronunciationOverall({required this.score, required this.delta});

  factory PronunciationOverall.fromJson(Json json) =>
      PronunciationOverall(score: readInt(json['score'])!, delta: readInt(json['delta']));

  final int score;

  /// Null on the first assessed lesson.
  final int? delta;
}

class WorstPhoneme {
  const WorstPhoneme({required this.phoneme, required this.meanAccuracy, required this.exampleWord, required this.exampleUtteranceId});

  factory WorstPhoneme.fromJson(Json json) => WorstPhoneme(
    phoneme: json['phoneme'] as String,
    meanAccuracy: readDouble(json['meanAccuracy'])!,
    exampleWord: json['exampleWord'] as String,
    exampleUtteranceId: json['exampleUtteranceId'] as String,
  );

  final String phoneme;
  final double meanAccuracy;
  final String exampleWord;
  final String exampleUtteranceId;
}

class WorstWord {
  const WorstWord({required this.word, required this.meanAccuracy, required this.exampleUtteranceId});

  factory WorstWord.fromJson(Json json) => WorstWord(
    word: json['word'] as String,
    meanAccuracy: readDouble(json['meanAccuracy'])!,
    exampleUtteranceId: json['exampleUtteranceId'] as String,
  );

  final String word;
  final double meanAccuracy;
  final String exampleUtteranceId;
}

class PronunciationExcerptView {
  const PronunciationExcerptView({
    required this.excerptId,
    required this.utteranceId,
    required this.referenceText,
    required this.pronunciation,
  });

  factory PronunciationExcerptView.fromJson(Json json) => PronunciationExcerptView(
    excerptId: json['excerptId'] as String,
    utteranceId: json['utteranceId'] as String,
    referenceText: json['referenceText'] as String,
    pronunciation: ExcerptPronunciation.fromJson(json['pronunciation'] as Json),
  );

  final String excerptId;
  final String utteranceId;
  final String referenceText;
  final ExcerptPronunciation pronunciation;
}

class LessonPronunciationResult {
  const LessonPronunciationResult({
    required this.scores,
    required this.overall,
    required this.notes,
    required this.worstPhonemes,
    required this.worstWords,
  });

  factory LessonPronunciationResult.fromJson(Json json) => LessonPronunciationResult(
    scores: PronunciationScores.fromJson(json['scores'] as Json),
    overall: PronunciationOverall.fromJson(json['overall'] as Json),
    notes: readStrings(json['notes']),
    worstPhonemes: readList(json['worstPhonemes'], WorstPhoneme.fromJson),
    worstWords: readList(json['worstWords'], WorstWord.fromJson),
  );

  final PronunciationScores scores;
  final PronunciationOverall overall;
  final List<String> notes;
  final List<WorstPhoneme> worstPhonemes;
  final List<WorstWord> worstWords;
}

/// `GET /lessons/:lessonId/pronunciation` — the caller's own data only.
class LessonPronunciationView {
  const LessonPronunciationView({required this.lessonId, required this.status, required this.result, required this.excerpts});

  factory LessonPronunciationView.fromJson(Json json) => LessonPronunciationView(
    lessonId: json['lessonId'] as String,
    status: json['status'] as String,
    result: readObject(json['result'], LessonPronunciationResult.fromJson),
    excerpts: readList(json['excerpts'], PronunciationExcerptView.fromJson),
  );

  final String lessonId;

  /// `pending`, `assessed`, `no_sample`, `failed` or `unavailable`.
  final String status;
  final LessonPronunciationResult? result;
  final List<PronunciationExcerptView> excerpts;
}
