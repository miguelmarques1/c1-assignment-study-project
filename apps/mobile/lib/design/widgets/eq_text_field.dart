import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

/// Mirrors the web's `TextField`: an optional label, hint and error, a 2px
/// `outlineStrong` border on `EqRadius.md` and a hard focus shadow. It carries
/// its own decoration instead of changing `EqTheme`'s app-wide input theme,
/// so the login and settings fields keep their look (A29).
///
/// [compact] is the inline variant for a fill-in-the-blank: no label, a width
/// of [compactWidth] and tighter padding.
class EqTextField extends StatefulWidget {
  const EqTextField({
    super.key,
    this.controller,
    this.label,
    this.semanticLabel,
    this.hint,
    this.error,
    this.enabled = true,
    this.compact = false,
    this.compactWidth,
    this.maxLength,
    this.onChanged,
    this.onSubmitted,
    this.textInputAction,
  });

  final TextEditingController? controller;
  final String? label;

  /// Names the field for assistive technology when there is no visible [label].
  final String? semanticLabel;
  final String? hint;
  final String? error;
  final bool enabled;
  final bool compact;
  final double? compactWidth;
  final int? maxLength;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final TextInputAction? textInputAction;

  @override
  State<EqTextField> createState() => _EqTextFieldState();
}

class _EqTextFieldState extends State<EqTextField> {
  final FocusNode _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final outline = dark
        ? EqDarkColors.outlineStrong
        : EqLightColors.outlineStrong;
    final errorColor = dark ? EqDarkColors.error : EqLightColors.error;
    final hasError = widget.error != null;

    final field = Material(
      type: MaterialType.transparency,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: dark
              ? EqDarkColors.surfaceContainerLowest
              : EqLightColors.surfaceContainerLowest,
          borderRadius: BorderRadius.circular(EqRadius.md),
          border: Border.all(color: hasError ? errorColor : outline, width: 2),
          boxShadow: _focus.hasFocus
              ? EqElevation.inputFocus(dark: dark)
              : const [],
        ),
        child: Padding(
          padding: EdgeInsets.symmetric(
            horizontal: widget.compact ? EqSpacing.sm : EqSpacing.md,
            vertical: widget.compact ? EqSpacing.xs : EqSpacing.sm,
          ),
          child: TextField(
            controller: widget.controller,
            focusNode: _focus,
            enabled: widget.enabled,
            maxLength: widget.maxLength,
            onChanged: widget.onChanged,
            onSubmitted: widget.onSubmitted,
            textInputAction: widget.textInputAction,
            autocorrect: false,
            enableSuggestions: false,
            style: (widget.compact
                ? EqTextStyles.bodyLg(dark: dark)
                : EqTextStyles.bodyMd(dark: dark)),
            decoration: InputDecoration(
              isCollapsed: true,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              disabledBorder: InputBorder.none,
              counterText: '',
            ),
          ),
        ),
      ),
    );

    final sized = widget.compact
        ? SizedBox(width: widget.compactWidth ?? 120, child: field)
        : field;
    final semantic = widget.semanticLabel ?? widget.label;
    final labelled = semantic == null
        ? sized
        : Semantics(label: semantic, textField: true, child: sized);

    if (widget.compact) {
      return labelled;
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.label != null) ...[
          Text(widget.label!, style: EqTextStyles.labelMd(dark: dark)),
          SizedBox(height: EqSpacing.xs),
        ],
        labelled,
        if (widget.hint != null && !hasError) ...[
          SizedBox(height: EqSpacing.xs),
          Text(widget.hint!, style: EqTextStyles.bodySm(dark: dark)),
        ],
        if (hasError) ...[
          SizedBox(height: EqSpacing.xs),
          Text(
            widget.error!,
            style: EqTextStyles.bodySm(dark: dark).copyWith(color: errorColor),
          ),
        ],
      ],
    );
  }
}
