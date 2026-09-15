import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:get/get.dart';

/// Advisory link-state signal for page-state copy — never a gate on whether
/// a request is attempted. A device can report "connected" over Wi-Fi with
/// no route to the LAN API; only the request's own failure decides that.
class ConnectivityService {
  ConnectivityService([Connectivity? connectivity])
      : _connectivity = connectivity ?? Connectivity() {
    _connectivity.onConnectivityChanged.listen(_onChanged);
  }

  final Connectivity _connectivity;
  final RxBool hasLink = true.obs;

  Future<void> refresh() async {
    _onChanged(await _connectivity.checkConnectivity());
  }

  void _onChanged(List<ConnectivityResult> results) {
    hasLink.value = results.any((result) => result != ConnectivityResult.none);
  }
}
