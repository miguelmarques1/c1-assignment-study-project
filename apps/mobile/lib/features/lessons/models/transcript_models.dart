import 'json_read.dart';
import 'pronunciation_models.dart';

enum WordBand {
  good('good'),
  fair('fair'),
  poor('needs work');

  const WordBand(this.spoken);

  final String spoken;

  static WordBand fromWire(String value) => switch (value) {
    'good' => good,
    'fair' => fair,
    _ => poor,
  };
}

/// One assessed word with its server-built colour band (F19, A16).
class AssessedWord {
  const AssessedWord({required this.text, required this.accuracy, required this.errorTypes, required this.band});

  factory AssessedWord.fromJson(Json json) => AssessedWord(
    text: json['text'] as String,
    accuracy: readInt(json['accuracy'])!,
    errorTypes: readStrings(json['errorTypes']),
    band: WordBand.fromWire(json['band'] as String),
  );

  final String text;
  final int accuracy;
  final List<String> errorTypes;
  final WordBand band;

  /// Colour is never the only cue: this is what a screen reader says.
  String get spokenLabel =>
      '$text: $accuracy out of 100, ${band.spoken}${errorTypes.isEmpty ? '' : ', ${errorTypes.join(', ')}'}';
}

/// The badge on one of the caller's own selected lines (F09, F10, F19).
class TranscriptExcerpt {
  const TranscriptExcerpt({required this.reason, required this.pronunciation, required this.assessedWords});

  factory TranscriptExcerpt.fromJson(Json json) => TranscriptExcerpt(
    reason: json['reason'] as String,
    pronunciation: ExcerptPronunciation.fromJson(json['pronunciation'] as Json),
    assessedWords: json['assessedWords'] == null ? null : readList(json['assessedWords'], AssessedWord.fromJson),
  );

  final String reason;
  final ExcerptPronunciation pronunciation;
  final List<AssessedWord>? assessedWords;
}

class TranscriptUtterance {
  const TranscriptUtterance({
    required this.id,
    required this.userId,
    required this.startMs,
    required this.text,
    required this.excerpt,
  });

  factory TranscriptUtterance.fromJson(Json json) => TranscriptUtterance(
    id: json['id'] as String,
    userId: json['userId'] as String,
    startMs: readInt(json['startMs'])!,
    text: json['text'] as String,
    excerpt: readObject(json['excerpt'], TranscriptExcerpt.fromJson),
  );

  final String id;
  final String userId;

  /// From the lesson's start.
  final int startMs;
  final String text;
  final TranscriptExcerpt? excerpt;
}

class TranscriptSpeaker {
  const TranscriptSpeaker({required this.userId, required this.displayName, required this.isMe, required this.status});

  factory TranscriptSpeaker.fromJson(Json json) => TranscriptSpeaker(
    userId: json['userId'] as String,
    displayName: json['displayName'] as String,
    isMe: json['isMe'] as bool,
    status: json['status'] as String,
  );

  final String userId;
  final String displayName;
  final bool isMe;

  /// `available`, `pending` or `unavailable` — coarse on purpose.
  final String status;

  String get name => isMe ? 'You' : displayName;

  String? get statusLabel => switch (status) {
    'pending' => 'Transcript pending',
    'unavailable' => 'No transcript',
    _ => null,
  };
}

/// `GET /lessons/:lessonId/transcript`.
class LessonTranscriptView {
  const LessonTranscriptView({required this.lessonId, required this.speakers, required this.utterances});

  factory LessonTranscriptView.fromJson(Json json) => LessonTranscriptView(
    lessonId: json['lessonId'] as String,
    speakers: readList(json['speakers'], TranscriptSpeaker.fromJson),
    utterances: readList(json['utterances'], TranscriptUtterance.fromJson),
  );

  final String lessonId;
  final List<TranscriptSpeaker> speakers;
  final List<TranscriptUtterance> utterances;
}
