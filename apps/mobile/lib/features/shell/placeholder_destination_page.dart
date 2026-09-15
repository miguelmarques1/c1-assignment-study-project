import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../design/widgets/eq_page_state.dart';

/// Shared shape behind the four destinations whose content arrives with a
/// later feature (F15/F16/F12/F19) — honours the empty state and
/// pull-to-refresh (which exercises the loading skeleton) so the tab isn't
/// a bare blank screen until that feature lands. There's nothing to fetch on
/// first mount, so the empty state renders immediately rather than behind a
/// manufactured delay.
class PlaceholderDestinationPage extends StatefulWidget {
  const PlaceholderDestinationPage({super.key, required this.title});

  final String title;

  @override
  State<PlaceholderDestinationPage> createState() => _PlaceholderDestinationPageState();
}

class _PlaceholderDestinationPageState extends State<PlaceholderDestinationPage> {
  bool _refreshing = false;

  Future<void> _refresh() async {
    setState(() => _refreshing = true);
    await Future<void>.delayed(const Duration(milliseconds: 300));
    if (mounted) setState(() => _refreshing = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: EdgeInsets.all(EqSpacing.lg),
          children: [
            if (_refreshing)
              const EqLoading()
            else
              EqEmpty(
                message: '${widget.title} content is coming soon.',
                actionLabel: 'Refresh',
                onAction: _refresh,
              ),
          ],
        ),
      ),
    );
  }
}
