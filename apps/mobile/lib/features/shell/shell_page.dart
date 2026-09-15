import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';

/// The persistent frame around the five destinations. [RouterOutlet] keeps
/// each tab's widget mounted across switches, which is what preserves
/// per-tab scroll position — there's no manual `IndexedStack` bookkeeping.
///
/// The live classroom is deliberately absent from the tab list below.
class ShellPage extends StatefulWidget {
  const ShellPage({super.key});

  @override
  State<ShellPage> createState() => _ShellPageState();
}

class _ShellPageState extends State<ShellPage> {
  final _outlet = GlobalKey<RouterOutletState>();

  static const _tabs = [
    ('/app/today', 'Today', Icons.today_outlined),
    ('/app/plan', 'Plan', Icons.event_note_outlined),
    ('/app/profile', 'Profile', Icons.person_outline),
    ('/app/lessons', 'Lessons', Icons.menu_book_outlined),
    ('/app/settings', 'Settings', Icons.settings_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    final path = context.routeState().uri.path;
    final selected = _tabs.lastIndexWhere((tab) => path == tab.$1 || path.startsWith('${tab.$1}/'));

    return Scaffold(
      body: RouterOutlet(key: _outlet),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selected < 0 ? 0 : selected,
        onDestinationSelected: (index) => _outlet.currentState?.navigate(_tabs[index].$1),
        destinations: [
          for (final tab in _tabs) NavigationDestination(icon: Icon(tab.$3), label: tab.$2),
        ],
      ),
    );
  }
}
