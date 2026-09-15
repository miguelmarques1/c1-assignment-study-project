import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/app_config.dart';
import 'package:mobile/core/session/session_controller.dart';
import 'package:mobile/core/session/session_store.dart';
import 'package:mobile/design/widgets/eq_button.dart';
import 'package:mobile/features/auth/login_page.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _MockSessionStore extends Mock implements SessionStore {}

typedef _Responder = Future<ResponseBody> Function(RequestOptions options);

class _ScriptedAdapter implements HttpClientAdapter {
  _ScriptedAdapter(this.responders);

  final Map<String, _Responder> responders;
  RequestOptions? lastRequest;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    lastRequest = options;
    final responder = responders[options.path];
    if (responder == null) throw StateError('No script for ${options.path}');
    return responder(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Map<String, dynamic> body, int statusCode) {
  return ResponseBody.fromString(
    jsonEncode(body),
    statusCode,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );
}

DioException _errorFor(RequestOptions options, {required DioExceptionType type, Response? response}) {
  return DioException(requestOptions: options, type: type, response: response);
}

class _Env {
  _Env({required this.dio, required this.adapter, required this.config, required this.store});

  final Dio dio;
  final _ScriptedAdapter adapter;
  final AppConfig config;
  final _MockSessionStore store;
}

Future<_Env> _setUpEnv(Map<String, _Responder> responders) async {
  SharedPreferences.setMockInitialValues({});
  final config = await AppConfig.create();
  final store = _MockSessionStore();
  when(() => store.save(token: any(named: 'token'), expiresAt: any(named: 'expiresAt'))).thenAnswer((_) async {});
  when(() => store.readToken()).thenAnswer((_) async => null);
  when(() => store.clear()).thenAnswer((_) async {});

  final adapter = _ScriptedAdapter(responders);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  final session = SessionController(dio, store);

  bootstrapModule(
    createModule(
      register: (c) => c
        ..addInstance<AppConfig>(config)
        ..addInstance<SessionController>(session),
    ),
  );

  return _Env(dio: dio, adapter: adapter, config: config, store: store);
}

Future<void> _fillAndSubmit(WidgetTester tester, {String email = 'learner@example.com'}) async {
  await tester.enterText(find.byType(TextField).at(0), email);
  await tester.enterText(find.byType(TextField).at(1), 'a good password');
  await tester.tap(find.text('Sign in'));
  await tester.pumpAndSettle();
}

void main() {
  group('LoginPage', () {
    testWidgets('submits_valid_credentials', (tester) async {
      final env = await _setUpEnv({
        '/auth/token': (options) async => _json({
          'data': {
            'token': 't',
            'expiresAt': '2026-09-22T03:14:07.000Z',
            'user': {'id': 'u1', 'email': 'learner@example.com', 'displayName': 'Learner'},
          },
        }, 200),
      });

      await tester.pumpWidget(const MaterialApp(home: LoginPage()));
      await tester.pumpAndSettle();
      await _fillAndSubmit(tester, email: '  Learner@Example.com  ');

      expect(env.adapter.lastRequest?.path, '/auth/token');
      expect(env.adapter.lastRequest?.data, {'email': 'learner@example.com', 'password': 'a good password'});
    });

    testWidgets('shows_the_named_cause_on_failure', (tester) async {
      await _setUpEnv({
        '/auth/token': (options) async => throw _errorFor(options, type: DioExceptionType.connectionError),
      });

      await tester.pumpWidget(const MaterialApp(home: LoginPage()));
      await tester.pumpAndSettle();
      await _fillAndSubmit(tester);

      expect(find.text('No connection'), findsOneWidget);
      final signInButton = tester.widget<EqButton>(find.byType(EqButton));
      expect(signInButton.onPressed, isNotNull);
    });

    testWidgets('shows_lockout_copy_with_the_retry_window', (tester) async {
      await _setUpEnv({
        '/auth/token': (options) async => throw _errorFor(
          options,
          type: DioExceptionType.badResponse,
          response: Response(
            requestOptions: options,
            statusCode: 429,
            data: {
              'error': {
                'code': 'AUTH002',
                'message': 'Too many attempts. Try again in 15 minutes.',
                'details': {'retryAfterSeconds': 125},
              },
            },
          ),
        ),
      });

      await tester.pumpWidget(const MaterialApp(home: LoginPage()));
      await tester.pumpAndSettle();
      await _fillAndSubmit(tester);

      expect(find.textContaining('(2:05)'), findsOneWidget);
    });

    testWidgets('the_base_url_is_editable_before_authenticating', (tester) async {
      final env = await _setUpEnv({});

      await tester.pumpWidget(const MaterialApp(home: LoginPage()));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Server settings'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'API base URL'), 'https://staging.example.com');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      expect(env.config.baseUrl.value, 'https://staging.example.com');
    });

    testWidgets('has_no_register_or_reset_affordance', (tester) async {
      await _setUpEnv({});

      await tester.pumpWidget(const MaterialApp(home: LoginPage()));
      await tester.pumpAndSettle();

      expect(find.textContaining('Register', findRichText: true), findsNothing);
      expect(find.textContaining('Sign up', findRichText: true), findsNothing);
      expect(find.textContaining('Forgot password', findRichText: true), findsNothing);
      expect(find.textContaining('Reset', findRichText: true), findsNothing);
    });
  });
}
