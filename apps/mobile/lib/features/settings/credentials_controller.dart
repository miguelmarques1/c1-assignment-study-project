import 'package:dio/dio.dart';
import 'package:get/get.dart';

import 'credential_models.dart';

/// Loads the masked list; add, replace, delete and re-validate all talk to
/// the same routes the web credentials screen does. Save/delete/revalidate
/// deliberately let `DioException` propagate — the form is what turns
/// `CREDENTIAL_REJECTED` into `details.providerMessage` copy, same as web.
class CredentialsController extends GetxController {
  CredentialsController(this._dio);

  final Dio _dio;

  final Rx<List<MaskedCredential>?> credentials = Rx<List<MaskedCredential>?>(null);
  final RxnString loadError = RxnString();

  Future<void> load() async {
    loadError.value = null;
    try {
      final response = await _dio.get<Map<String, dynamic>>('/credentials');
      final list = (response.data!['data'] as List).cast<Map<String, dynamic>>();
      credentials.value = list.map(MaskedCredential.fromJson).toList();
    } on DioException {
      loadError.value = 'Could not load your credentials.';
    }
  }

  Future<MaskedCredential> save(CredentialProvider provider, String key, String? region) async {
    final body = <String, dynamic>{'key': key};
    if (region != null) body['region'] = region;

    final response = await _dio.put<Map<String, dynamic>>('/credentials/${provider.wireValue}', data: body);
    final saved = MaskedCredential.fromJson(response.data!['data'] as Map<String, dynamic>);
    _replace(saved);
    return saved;
  }

  Future<void> delete(CredentialProvider provider) async {
    await _dio.delete<void>('/credentials/${provider.wireValue}');
    final current = _current(provider);
    if (current != null) _replace(current.asMissing());
  }

  Future<MaskedCredential> revalidate(CredentialProvider provider) async {
    final response = await _dio.post<Map<String, dynamic>>('/credentials/${provider.wireValue}/revalidate');
    final result = MaskedCredential.fromJson(response.data!['data'] as Map<String, dynamic>);
    _replace(result);
    return result;
  }

  MaskedCredential? _current(CredentialProvider provider) {
    for (final credential in credentials.value ?? const <MaskedCredential>[]) {
      if (credential.provider == provider) return credential;
    }
    return null;
  }

  void _replace(MaskedCredential next) {
    final list = credentials.value;
    if (list == null) return;
    credentials.value = [
      for (final credential in list)
        if (credential.provider == next.provider) next else credential,
    ];
  }
}
