import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../profile/profile_models.dart';

/// The chart colour roles and text roles for the current brightness, as
/// `LessonPalette` does for the lesson screens. Series colours are the six
/// `chartN` token roles; nothing here is a literal colour.
class ChartPalette {
  ChartPalette.of(BuildContext context) : dark = Theme.of(context).brightness == Brightness.dark;

  final bool dark;

  Color seriesColor(ProfileCompetency competency) => switch (competency) {
    ProfileCompetency.grammar => dark ? EqDarkColors.chart1 : EqLightColors.chart1,
    ProfileCompetency.vocabulary => dark ? EqDarkColors.chart2 : EqLightColors.chart2,
    ProfileCompetency.fluency => dark ? EqDarkColors.chart3 : EqLightColors.chart3,
    ProfileCompetency.interaction => dark ? EqDarkColors.chart4 : EqLightColors.chart4,
    ProfileCompetency.comprehension => dark ? EqDarkColors.chart5 : EqLightColors.chart5,
    ProfileCompetency.pronunciation => dark ? EqDarkColors.chart6 : EqLightColors.chart6,
  };

  Color get onSurface => dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
  Color get onSurfaceVariant => dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;
  Color get tertiary => dark ? EqDarkColors.tertiary : EqLightColors.tertiary;
  Color get error => dark ? EqDarkColors.error : EqLightColors.error;
  Color get outlineStrong => dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong;
  Color get outlineVariant => dark ? EqDarkColors.outlineVariant : EqLightColors.outlineVariant;
  Color get surface => dark ? EqDarkColors.surface : EqLightColors.surface;
  Color get surfaceContainerLowest =>
      dark ? EqDarkColors.surfaceContainerLowest : EqLightColors.surfaceContainerLowest;

  TextStyle get axisLabel => EqTextStyles.labelSm(dark: dark).copyWith(color: onSurfaceVariant);
}
