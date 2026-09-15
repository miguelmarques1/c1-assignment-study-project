import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design/widgets/eq_badge.dart';
import 'package:mobile/features/settings/credential_card.dart';
import 'package:mobile/features/settings/credential_models.dart';
import 'package:mobile/features/settings/credentials_controller.dart';

typedef _Responder = Future<ResponseBody> Function(RequestOptions options);

class _ScriptedAdapter implements HttpClientAdapter {
  _ScriptedAdapter(this.responders);

  final Map<String, _Responder> responders;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    final responder = responders['${options.method} ${options.path}'];
    if (responder == null) throw StateError('No script for ${options.method} ${options.path}');
    return responder(options);
  }

  @override
  void close({bool force = false}) {}
}

Map<String, dynamic> _credentialJson({
  required String provider,
  required String status,
  String? maskedKey,
  String? region,
  String? lastValidatedAt,
}) => {
  'provider': provider,
  'status': status,
  'maskedKey': maskedKey,
  'region': region,
  'lastValidatedAt': lastValidatedAt,
};

MaskedCredential _gemini({String status = 'valid', String? maskedKey = '••••tPnQ'}) => MaskedCredential.fromJson(
  _credentialJson(
    provider: 'gemini',
    status: status,
    maskedKey: status == 'missing' ? null : maskedKey,
    lastValidatedAt: status == 'missing' ? null : '2026-09-15T01:00:00.000Z',
  ),
);

MaskedCredential _azure({String status = 'valid'}) => MaskedCredential.fromJson(
  _credentialJson(
    provider: 'azure_speech',
    status: status,
    maskedKey: status == 'missing' ? null : '••••9R7v',
    region: status == 'missing' ? null : 'eastus2',
    lastValidatedAt: status == 'missing' ? null : '2026-09-15T01:00:00.000Z',
  ),
);

Widget _cardFor(MaskedCredential credential, CredentialsController controller) {
  return MaterialApp(
    home: Scaffold(
      body: SingleChildScrollView(
        child: CredentialCard(
          key: ValueKey(credential.provider),
          credential: credential,
          onSave: (key, region) => controller.save(credential.provider, key, region),
          onDelete: () => controller.delete(credential.provider),
          onRevalidate: () => controller.revalidate(credential.provider),
        ),
      ),
    ),
  );
}

void main() {
  group('CredentialCard', () {
    testWidgets('renders_both_providers_with_their_status', (tester) async {
      final dio = Dio()..httpClientAdapter = _ScriptedAdapter({});
      final controller = CredentialsController(dio);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: Column(
                children: [
                  CredentialCard(
                    credential: _gemini(),
                    onSave: (key, region) => controller.save(CredentialProvider.gemini, key, region),
                    onDelete: () => controller.delete(CredentialProvider.gemini),
                    onRevalidate: () => controller.revalidate(CredentialProvider.gemini),
                  ),
                  CredentialCard(
                    credential: _azure(),
                    onSave: (key, region) => controller.save(CredentialProvider.azureSpeech, key, region),
                    onDelete: () => controller.delete(CredentialProvider.azureSpeech),
                    onRevalidate: () => controller.revalidate(CredentialProvider.azureSpeech),
                  ),
                ],
              ),
            ),
          ),
        ),
      );

      expect(find.text('Gemini'), findsOneWidget);
      expect(find.text('Azure Speech'), findsOneWidget);
    });

    testWidgets('renders_each_status_with_its_badge', (tester) async {
      final dio = Dio()..httpClientAdapter = _ScriptedAdapter({});
      final controller = CredentialsController(dio);

      const expectations = {
        'valid': EqBadgeStatus.success,
        'invalid': EqBadgeStatus.danger,
        'unverified': EqBadgeStatus.warning,
        'missing': EqBadgeStatus.neutral,
      };

      for (final entry in expectations.entries) {
        await tester.pumpWidget(_cardFor(_gemini(status: entry.key), controller));
        final badge = tester.widget<EqBadge>(find.byType(EqBadge));
        expect(badge.status, entry.value, reason: 'status ${entry.key}');
      }
    });

    testWidgets('never_renders_more_than_the_masked_key', (tester) async {
      final dio = Dio()..httpClientAdapter = _ScriptedAdapter({});
      final controller = CredentialsController(dio);

      await tester.pumpWidget(_cardFor(_gemini(), controller));

      expect(find.text('••••tPnQ'), findsOneWidget);
      expect(find.byIcon(Icons.visibility), findsNothing);
      expect(find.byIcon(Icons.visibility_outlined), findsNothing);
    });

    testWidgets('requires_a_region_for_azure_only', (tester) async {
      final dio = Dio()..httpClientAdapter = _ScriptedAdapter({});
      final controller = CredentialsController(dio);

      await tester.pumpWidget(_cardFor(_gemini(), controller));
      await tester.tap(find.text('Replace key'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextField, 'Region'), findsNothing);

      await tester.pumpWidget(_cardFor(_azure(), controller));
      await tester.tap(find.text('Replace key'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextField, 'Region'), findsOneWidget);
    });

    testWidgets('surfaces_the_provider_message_on_rejection', (tester) async {
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))
        ..httpClientAdapter = _ScriptedAdapter({
          'PUT /credentials/gemini': (options) async => throw DioException(
            requestOptions: options,
            type: DioExceptionType.badResponse,
            response: Response(
              requestOptions: options,
              statusCode: 400,
              data: {
                'error': {
                  'code': 'CRED001',
                  'message': 'The provider rejected this key.',
                  'details': {'providerMessage': 'API key not valid.'},
                },
              },
            ),
          ),
        });
      final controller = CredentialsController(dio);

      await tester.pumpWidget(_cardFor(_gemini(), controller));
      await tester.tap(find.text('Replace key'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'a-key-that-is-long-enough');
      await tester.tap(find.text('Save and validate'));
      await tester.pumpAndSettle();

      expect(find.text('The provider rejected this key.'), findsOneWidget);
      expect(find.text('API key not valid.'), findsOneWidget);
    });

    testWidgets('deleting_returns_the_card_to_its_missing_state', (tester) async {
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))
        ..httpClientAdapter = _ScriptedAdapter({
          'DELETE /credentials/gemini': (options) async =>
              ResponseBody.fromString('', 204),
        });
      final controller = CredentialsController(dio);
      controller.credentials.value = [_gemini()];

      await tester.pumpWidget(_cardFor(_gemini(), controller));
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();

      expect(controller.credentials.value!.single.status, CredentialStatus.missing);
    });

    testWidgets('shows_no_connection_with_retry_when_offline', (tester) async {
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))
        ..httpClientAdapter = _ScriptedAdapter({
          'POST /credentials/gemini/revalidate': (options) async =>
              throw DioException(requestOptions: options, type: DioExceptionType.connectionError),
        });
      final controller = CredentialsController(dio);

      await tester.pumpWidget(_cardFor(_gemini(), controller));
      await tester.tap(find.text('Re-check'));
      await tester.pumpAndSettle();

      expect(find.text('No connection'), findsOneWidget);
      expect(find.text('Re-check'), findsOneWidget);
    });
  });
}
