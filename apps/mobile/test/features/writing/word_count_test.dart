import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/writing/word_count.dart';

void main() {
  group('countWords', () {
    test('counts_space_separated_words', () {
      expect(countWords('The quick brown fox jumps'), 5);
    });

    test('an_internal_apostrophe_or_hyphen_keeps_one_word', () {
      expect(countWords("don't"), 1);
      expect(countWords('don’t'), 1);
      expect(countWords('well-known'), 1);
      expect(wordTokens("don't stop well-known"), ["don't", 'stop', 'well-known']);
    });

    test('punctuation_and_symbols_are_not_words', () {
      expect(countWords('wait + go — really… now'), 4);
    });

    test('numbers_are_words', () {
      expect(countWords('I have 3 apples and 12 oranges'), 7);
    });

    test('newlines_and_repeated_spaces_separate_words', () {
      expect(countWords('one\n\ntwo   three\r\nfour'), 4);
    });

    test('an_empty_or_blank_text_has_zero_words', () {
      expect(countWords(''), 0);
      expect(countWords('   \n\t  '), 0);
    });

    test('emoji_are_not_words', () {
      expect(countWords('great job \u{1F600}\u{1F44D}'), 2);
    });
  });
}
