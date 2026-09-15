import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/session/session_controller.dart';
import 'package:mobile/core/session/session_state.dart';
import 'package:mobile/core/session/session_store.dart';
import 'package:mobile/core/session/session_user.dart';
import 'package:mobile/features/auth/auth_module.dart';
import 'package:mobile/features/shell/shell_module.dart';

SessionController _sessionWith(SessionState state) {
  final controller = SessionController(Dio(), SessionStore());
  controller.state.value = state;
  return controller;
}

Module _testModule(SessionController controller) {
  return createModule(
    register: (c) => c
      ..addInstance<SessionController>(controller)
      ..module(authModule)
      ..module(shellModule),
  );
}

Future<void> _pump(WidgetTester tester, SessionController controller, {required String initialRoute}) async {
  final boot = bootstrapModule(_testModule(controller));
  await tester.pumpWidget(
    MaterialApp.router(
      routerConfig: modularRouterConfig(boot.routes, injector: boot.injector, initialRoute: initialRoute),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('navigation', () {
    testWidgets('the_shell_exposes_exactly_five_destinations', (tester) async {
      await _pump(
        tester,
        _sessionWith(const Authenticated(SessionUser(id: '1', email: 'a@b.com', displayName: 'A'))),
        initialRoute: '/app/today',
      );

      final destinations = tester.widgetList<NavigationDestination>(find.byType(NavigationDestination));
      expect(destinations.map((d) => d.label), ['Today', 'Plan', 'Profile', 'Lessons', 'Settings']);
    });

    testWidgets('the_live_classroom_is_absent_from_navigation', (tester) async {
      await _pump(
        tester,
        _sessionWith(const Authenticated(SessionUser(id: '1', email: 'a@b.com', displayName: 'A'))),
        initialRoute: '/app/today',
      );

      final destinations = tester.widgetList<NavigationDestination>(find.byType(NavigationDestination));
      expect(destinations.any((d) => d.label.toLowerCase().contains('classroom')), isFalse);
    });

    testWidgets('an_unauthenticated_user_is_redirected_to_login', (tester) async {
      await _pump(tester, _sessionWith(const Unauthenticated()), initialRoute: '/app/today');

      expect(find.text('English Quest'), findsOneWidget);
      expect(find.byType(NavigationDestination), findsNothing);
    });

    testWidgets('an_authenticated_user_reaching_login_is_sent_to_today', (tester) async {
      await _pump(
        tester,
        _sessionWith(const Authenticated(SessionUser(id: '1', email: 'a@b.com', displayName: 'A'))),
        initialRoute: '/login',
      );

      expect(find.byType(NavigationDestination), findsWidgets);
    });

    testWidgets('switching_tabs_preserves_scroll_position', (tester) async {
      await _pump(
        tester,
        _sessionWith(const Authenticated(SessionUser(id: '1', email: 'a@b.com', displayName: 'A'))),
        initialRoute: '/app/today',
      );
      await tester.pumpAndSettle(const Duration(milliseconds: 400));

      final scrollableFinder = find.byType(Scrollable).first;
      await tester.drag(scrollableFinder, const Offset(0, -300));
      await tester.pumpAndSettle();
      final offsetBefore = tester.state<ScrollableState>(scrollableFinder).position.pixels;

      await tester.tap(find.text('Plan'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Today'));
      await tester.pumpAndSettle();

      final offsetAfter = tester.state<ScrollableState>(find.byType(Scrollable).first).position.pixels;
      expect(offsetAfter, offsetBefore);
    });
  });
}
