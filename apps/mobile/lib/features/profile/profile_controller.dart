import 'package:dio/dio.dart';
import 'package:get/get.dart';

import 'profile_models.dart';

/// The learning profile screen's state: the caller's own view from
/// `GET /profile`, and a ledger record's detail on demand. Every route is
/// the caller's own; nothing here takes a user id.
class ProfileController extends GetxController {
  ProfileController(this._dio);

  final Dio _dio;

  final Rx<LearningProfileView?> view = Rx<LearningProfileView?>(null);
  final RxnString loadError = RxnString();

  Future<void> load() async {
    loadError.value = null;
    try {
      final response = await _dio.get<Map<String, dynamic>>('/profile');
      view.value = LearningProfileView.fromJson(response.data!['data'] as Map<String, dynamic>);
    } on DioException {
      loadError.value = 'Your profile could not be loaded.';
    }
  }

  /// One record's examples and sources. Throws `DioException` for the sheet to show its own error.
  Future<LedgerEntryDetailView> loadEntry(String entryId) async {
    final response = await _dio.get<Map<String, dynamic>>('/profile/ledger/${Uri.encodeComponent(entryId)}');
    return LedgerEntryDetailView.fromJson(response.data!['data'] as Map<String, dynamic>);
  }

  /// The caller's record for an exact tag, or null — how a lesson's tag chip (F19) opens its detail.
  Future<LedgerEntry?> findEntryByTag(String tag) async {
    final response = await _dio.get<Map<String, dynamic>>('/profile/ledger', queryParameters: {'tag': tag});
    final list = LedgerEntryListView.fromJson(response.data!['data'] as Map<String, dynamic>);
    return list.entries.isEmpty ? null : list.entries.first;
  }
}
