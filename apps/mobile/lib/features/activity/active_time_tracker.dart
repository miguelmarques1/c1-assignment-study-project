import 'dart:async';

import 'package:flutter/widgets.dart';

/// Counts the seconds the app was in the foreground while running (A16):
/// wall-clock time since the attempt began would count a night between two
/// answers. The count is read when the runner saves or submits.
class ActiveTimeTracker with WidgetsBindingObserver {
  ActiveTimeTracker({this.tick = const Duration(seconds: 1)});

  final Duration tick;
  Timer? _timer;
  var _seconds = 0;
  var _foreground = true;

  int read() => _seconds;

  void seed(int seconds) => _seconds = seconds < 0 ? 0 : seconds;

  void start() {
    if (_timer != null) return;
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(tick, (_) {
      if (_foreground) _seconds += 1;
    });
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    WidgetsBinding.instance.removeObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
  }
}
