/// Small, strict readers for the API's JSON, shared by the lesson models.
typedef Json = Map<String, dynamic>;

DateTime? readDate(Object? value) => value == null ? null : DateTime.parse(value as String);

int? readInt(Object? value) => value == null ? null : (value as num).round();

double? readDouble(Object? value) => value == null ? null : (value as num).toDouble();

List<String> readStrings(Object? value) => value == null ? const [] : (value as List).cast<String>();

List<T> readList<T>(Object? value, T Function(Json json) parse) =>
    value == null ? const [] : (value as List).cast<Json>().map(parse).toList();

T? readObject<T>(Object? value, T Function(Json json) parse) => value == null ? null : parse(value as Json);

/// `plan_generation` → `Plan generation`: how an unknown wire value is shown rather than crashing the screen.
String humanize(String wire) {
  final words = wire.replaceAll('_', ' ').trim();
  return words.isEmpty ? wire : '${words[0].toUpperCase()}${words.substring(1)}';
}
