import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/profile/profile_models.dart';

import 'profile_fixtures.dart';

void main() {
  group('profile models', () {
    test('parses_the_profile_view', () {
      final view = LearningProfileView.fromJson(profileJson(notes: ['A note.']));

      expect(view.serverTime, DateTime.parse(serverTime));
      expect(view.empty, isFalse);
      expect(view.competencies.map((entry) => entry.competency), ProfileCompetency.values);
      expect(view.competencies.first.score, 68);
      expect(view.competencies.first.delta, 3);
      expect(view.competencies.first.trend, CompetencyTrend.up);
      expect(view.competencies[3].warmingUp, isTrue);
      expect(view.competencies[3].trend, isNull);
      expect(view.competencies.last.subScores!.accuracy, 81);
      expect(view.competencies.last.subScores!.prosody, 66);
      final weakness = view.recurringWeaknesses.single;
      expect(weakness.label, 'Third conditional');
      expect(weakness.state, LedgerState.newTag);
      expect(weakness.trend, TagTrend.rising);
      expect(weakness.dueAt, isNull);
      expect(view.notes, ['A note.']);

      final list = LedgerEntryListView.fromJson({'serverTime': serverTime, 'entries': [entryJson(state: 'practicing')]});
      expect(list.entries.single.state, LedgerState.practicing);
    });

    test('parses_the_ledger_detail', () {
      final detail = LedgerEntryDetailView.fromJson(detailJson());

      expect(detail.entry.id, entryId);
      expect(detail.examples, hasLength(2));
      expect(detail.examples.first.quote, 'if I would have known');
      expect(detail.examples.first.correction, 'if I had known');
      expect(detail.examples.last.quote, isNull);
      expect(detail.examples.last.exampleWords, ['think', 'three']);
      expect(detail.examples.last.instances, 4);
      expect(detail.sources.single.sourceKind, LedgerSourceKind.lesson);
      expect(detail.sources.single.lessonId, lessonId);
      expect(detail.sources.single.occurrences, 2);
    });

    test('ignores_unknown_fields', () {
      final json = profileJson()
        ..['recentImprovements'] = [
          {'tag': 'grammar:past-simple'},
        ];
      (json['competencies'] as List).first['somethingNew'] = true;

      final view = LearningProfileView.fromJson(json);

      expect(view.competencies, hasLength(6));
      expect(view.recurringWeaknesses, hasLength(1));
    });
  });
}
