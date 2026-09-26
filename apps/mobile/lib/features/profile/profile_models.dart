/// Hand-written mirrors of `packages/shared/src/schemas/profile.ts` (F12).
/// Unknown fields are ignored, so an additive change on the API (the Full
/// scope's recent improvements, for one) never breaks an older app.
library;

enum ProfileCompetency {
  grammar('Grammar'),
  vocabulary('Vocabulary'),
  fluency('Fluency'),
  interaction('Interaction'),
  comprehension('Comprehension'),
  pronunciation('Pronunciation');

  const ProfileCompetency(this.label);

  final String label;

  static ProfileCompetency fromWire(String value) => ProfileCompetency.values.byName(value);
}

enum CompetencyTrend {
  up,
  down,
  flat;

  static CompetencyTrend? fromWire(String? value) => value == null ? null : CompetencyTrend.values.byName(value);
}

enum LedgerState {
  newTag('new', 'New'),
  practicing('practicing', 'Practicing'),
  mastered('mastered', 'Mastered');

  const LedgerState(this.wireValue, this.label);

  final String wireValue;
  final String label;

  static LedgerState fromWire(String value) =>
      LedgerState.values.firstWhere((state) => state.wireValue == value, orElse: () => LedgerState.newTag);
}

/// Arrow plus word, never colour alone. For an error, rising is the bad direction.
enum TagTrend {
  rising('▲', 'Rising'),
  falling('▼', 'Falling'),
  flat('▶', 'Steady');

  const TagTrend(this.symbol, this.word);

  final String symbol;
  final String word;

  static TagTrend fromWire(String value) => TagTrend.values.byName(value);
}

enum LedgerSourceKind {
  lesson,
  activity;

  static LedgerSourceKind fromWire(String value) => LedgerSourceKind.values.byName(value);
}

DateTime? _date(Object? value) => value == null ? null : DateTime.parse(value as String);

class CompetencySubScores {
  const CompetencySubScores({required this.accuracy, required this.prosody});

  factory CompetencySubScores.fromJson(Map<String, dynamic> json) =>
      CompetencySubScores(accuracy: json['accuracy'] as int, prosody: json['prosody'] as int?);

  final int accuracy;

  /// Null when no measurement reported prosody (a locale Azure has none for).
  final int? prosody;
}

class CompetencySnapshot {
  const CompetencySnapshot({
    required this.competency,
    required this.score,
    required this.delta,
    required this.measurementCount,
    required this.warmingUp,
    required this.trend,
    required this.lastMeasuredAt,
    required this.subScores,
  });

  factory CompetencySnapshot.fromJson(Map<String, dynamic> json) => CompetencySnapshot(
    competency: ProfileCompetency.fromWire(json['competency'] as String),
    score: json['score'] as int?,
    delta: json['delta'] as int?,
    measurementCount: json['measurementCount'] as int,
    warmingUp: json['warmingUp'] as bool,
    trend: CompetencyTrend.fromWire(json['trend'] as String?),
    lastMeasuredAt: _date(json['lastMeasuredAt']),
    subScores: json['subScores'] == null
        ? null
        : CompetencySubScores.fromJson(json['subScores'] as Map<String, dynamic>),
  );

  final ProfileCompetency competency;
  final int? score;
  final int? delta;
  final int measurementCount;
  final bool warmingUp;
  final CompetencyTrend? trend;
  final DateTime? lastMeasuredAt;
  final CompetencySubScores? subScores;
}

class LedgerEntry {
  const LedgerEntry({
    required this.id,
    required this.tag,
    required this.label,
    required this.family,
    required this.occurrenceCount,
    required this.recentOccurrenceCount,
    required this.firstSeenAt,
    required this.lastSeenAt,
    required this.state,
    required this.dueAt,
    required this.trend,
    required this.retired,
  });

  factory LedgerEntry.fromJson(Map<String, dynamic> json) => LedgerEntry(
    id: json['id'] as String,
    tag: json['tag'] as String,
    label: json['label'] as String,
    family: json['family'] as String,
    occurrenceCount: json['occurrenceCount'] as int,
    recentOccurrenceCount: json['recentOccurrenceCount'] as int,
    firstSeenAt: DateTime.parse(json['firstSeenAt'] as String),
    lastSeenAt: DateTime.parse(json['lastSeenAt'] as String),
    state: LedgerState.fromWire(json['state'] as String),
    dueAt: _date(json['dueAt']),
    trend: TagTrend.fromWire(json['trend'] as String),
    retired: json['retired'] as bool,
  );

  final String id;
  final String tag;

  /// The human-readable name; the raw [tag] is never shown.
  final String label;
  final String family;
  final int occurrenceCount;
  final int recentOccurrenceCount;
  final DateTime firstSeenAt;
  final DateTime lastSeenAt;
  final LedgerState state;
  final DateTime? dueAt;
  final TagTrend trend;
  final bool retired;
}

/// `GET /profile`.
class LearningProfileView {
  const LearningProfileView({
    required this.serverTime,
    required this.updatedAt,
    required this.empty,
    required this.competencies,
    required this.recurringWeaknesses,
    required this.notes,
  });

  factory LearningProfileView.fromJson(Map<String, dynamic> json) => LearningProfileView(
    serverTime: DateTime.parse(json['serverTime'] as String),
    updatedAt: _date(json['updatedAt']),
    empty: json['empty'] as bool,
    competencies: (json['competencies'] as List)
        .cast<Map<String, dynamic>>()
        .map(CompetencySnapshot.fromJson)
        .toList(),
    recurringWeaknesses: (json['recurringWeaknesses'] as List)
        .cast<Map<String, dynamic>>()
        .map(LedgerEntry.fromJson)
        .toList(),
    notes: (json['notes'] as List).cast<String>(),
  );

  final DateTime serverTime;
  final DateTime? updatedAt;
  final bool empty;

  /// Always six, Pronunciation last.
  final List<CompetencySnapshot> competencies;
  final List<LedgerEntry> recurringWeaknesses;
  final List<String> notes;
}

/// `GET /profile/ledger`.
class LedgerEntryListView {
  const LedgerEntryListView({required this.serverTime, required this.entries});

  factory LedgerEntryListView.fromJson(Map<String, dynamic> json) => LedgerEntryListView(
    serverTime: DateTime.parse(json['serverTime'] as String),
    entries: (json['entries'] as List).cast<Map<String, dynamic>>().map(LedgerEntry.fromJson).toList(),
  );

  final DateTime serverTime;
  final List<LedgerEntry> entries;
}

class LedgerExample {
  const LedgerExample({
    required this.sourceKind,
    required this.lessonId,
    required this.activityId,
    required this.occurredAt,
    required this.quote,
    required this.correction,
    required this.exampleWords,
    required this.instances,
  });

  factory LedgerExample.fromJson(Map<String, dynamic> json) => LedgerExample(
    sourceKind: LedgerSourceKind.fromWire(json['sourceKind'] as String),
    lessonId: json['lessonId'] as String?,
    activityId: json['activityId'] as String?,
    occurredAt: DateTime.parse(json['occurredAt'] as String),
    quote: json['quote'] as String?,
    correction: json['correction'] as String?,
    exampleWords: (json['exampleWords'] as List).cast<String>(),
    instances: json['instances'] as int,
  );

  final LedgerSourceKind sourceKind;
  final String? lessonId;
  final String? activityId;
  final DateTime occurredAt;
  final String? quote;
  final String? correction;
  final List<String> exampleWords;
  final int instances;
}

class LedgerSource {
  const LedgerSource({
    required this.sourceKind,
    required this.lessonId,
    required this.activityId,
    required this.occurredAt,
    required this.occurrences,
  });

  factory LedgerSource.fromJson(Map<String, dynamic> json) => LedgerSource(
    sourceKind: LedgerSourceKind.fromWire(json['sourceKind'] as String),
    lessonId: json['lessonId'] as String?,
    activityId: json['activityId'] as String?,
    occurredAt: DateTime.parse(json['occurredAt'] as String),
    occurrences: json['occurrences'] as int,
  );

  final LedgerSourceKind sourceKind;
  final String? lessonId;
  final String? activityId;
  final DateTime occurredAt;
  final int occurrences;
}

/// `GET /profile/ledger/:entryId`.
class LedgerEntryDetailView {
  const LedgerEntryDetailView({
    required this.serverTime,
    required this.entry,
    required this.examples,
    required this.sources,
  });

  factory LedgerEntryDetailView.fromJson(Map<String, dynamic> json) => LedgerEntryDetailView(
    serverTime: DateTime.parse(json['serverTime'] as String),
    entry: LedgerEntry.fromJson(json['entry'] as Map<String, dynamic>),
    examples: (json['examples'] as List).cast<Map<String, dynamic>>().map(LedgerExample.fromJson).toList(),
    sources: (json['sources'] as List).cast<Map<String, dynamic>>().map(LedgerSource.fromJson).toList(),
  );

  final DateTime serverTime;
  final LedgerEntry entry;
  final List<LedgerExample> examples;
  final List<LedgerSource> sources;
}
