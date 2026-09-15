import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';

import '../../core/config/app_config.dart';
import '../../design/widgets/eq_button.dart';

/// Shared by login and settings — the API base URL isn't a secret, so it's
/// an ordinary editable field, not something behind a confirmation dialog.
class ApiBaseUrlField extends StatefulWidget {
  const ApiBaseUrlField({super.key});

  @override
  State<ApiBaseUrlField> createState() => _ApiBaseUrlFieldState();
}

class _ApiBaseUrlFieldState extends State<ApiBaseUrlField> {
  late final AppConfig _config = inject<AppConfig>();
  late final TextEditingController _controller = TextEditingController(text: _config.baseUrl.value);
  String? _error;
  bool _saving = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await _config.setBaseUrl(_controller.text);
    } on InvalidBaseUrlException {
      setState(() => _error = 'Enter a valid http(s) URL.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _controller,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: InputDecoration(labelText: 'API base URL', errorText: _error),
        ),
        const SizedBox(height: 8),
        EqButton(
          label: 'Save',
          onPressed: _saving ? null : _save,
          loading: _saving,
          loadingLabel: 'Saving…',
          size: EqButtonSize.sm,
        ),
      ],
    );
  }
}
