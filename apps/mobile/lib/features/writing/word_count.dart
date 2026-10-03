/// The one word-counting rule TypeScript and Dart both implement (spec A19),
/// pinned by the shared test table in `word_count_test.dart`.
library;

/// A run of letters or digits, which may contain one internal apostrophe or hyphen.
final RegExp _wordPattern = RegExp(r"[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*", unicode: true);

/// Every token [countWords] counts, in order.
List<String> wordTokens(String text) => _wordPattern.allMatches(text).map((match) => match[0]!).toList();

int countWords(String text) => wordTokens(text).length;
