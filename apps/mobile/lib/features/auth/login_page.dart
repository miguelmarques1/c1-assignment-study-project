import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:get/get.dart';

import '../../core/session/session_controller.dart';
import '../../design/widgets/eq_button.dart';
import '../settings/api_base_url_field.dart';
import 'login_controller.dart';

/// Email, password, submit, error copy, and the base-URL entry point —
/// reachable before authenticating, tucked behind a disclosure so it
/// doesn't compete with the two fields that matter for everyone else.
class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  late final LoginController _controller = LoginController(inject<SessionController>());
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _showServerSettings = false;

  @override
  void dispose() {
    _controller.onClose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final succeeded = await _controller.submit(_emailController.text, _passwordController.text);
    if (!succeeded && mounted) {
      _passwordController.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.all(EqSpacing.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('English Quest', style: EqTextStyles.headlineLg(dark: dark), textAlign: TextAlign.center),
                SizedBox(height: EqSpacing.xs),
                Text(
                  'Sign in to continue.',
                  style: EqTextStyles.bodySm(dark: dark),
                  textAlign: TextAlign.center,
                ),
                SizedBox(height: EqSpacing.lg),
                TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(labelText: 'Email'),
                ),
                SizedBox(height: EqSpacing.md),
                Obx(
                  () => TextField(
                    controller: _passwordController,
                    obscureText: true,
                    enabled: !_controller.submitting.value && !_controller.isLocked,
                    decoration: const InputDecoration(labelText: 'Password'),
                    onSubmitted: (_) => _submit(),
                  ),
                ),
                SizedBox(height: EqSpacing.md),
                Obx(
                  () => EqButton(
                    label: 'Sign in',
                    onPressed: _controller.isLocked ? null : _submit,
                    loading: _controller.submitting.value,
                    loadingLabel: 'Signing in…',
                  ),
                ),
                Obx(() {
                  final message = _controller.error.value;
                  if (message == null) return const SizedBox.shrink();

                  final secondsLeft = _controller.lockoutSecondsLeft.value;
                  final windowCopy = secondsLeft > 0
                      ? ' (${secondsLeft ~/ 60}:${(secondsLeft % 60).toString().padLeft(2, '0')})'
                      : '';

                  return Padding(
                    padding: EdgeInsets.only(top: EqSpacing.sm),
                    child: Text(
                      '$message$windowCopy',
                      style: EqTextStyles.bodySm(
                        dark: dark,
                      ).copyWith(color: dark ? EqDarkColors.error : EqLightColors.error),
                    ),
                  );
                }),
                SizedBox(height: EqSpacing.lg),
                TextButton(
                  onPressed: () => setState(() => _showServerSettings = !_showServerSettings),
                  child: Text(_showServerSettings ? 'Hide server settings' : 'Server settings'),
                ),
                if (_showServerSettings) const ApiBaseUrlField(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
