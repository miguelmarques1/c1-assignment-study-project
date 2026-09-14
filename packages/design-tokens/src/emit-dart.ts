import type { Tokens } from './schema';

const GENERATED_BANNER =
  '// GENERATED FILE — do not edit by hand.\n' +
  '// Source: packages/design-tokens/tokens.json\n' +
  '// Regenerate with `pnpm tokens:build`.\n';

function kebabToCamel(name: string): string {
  return name.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

function hexToDartColor(hex: string): string {
  const normalized = hex.replace('#', '').toUpperCase();
  return `Color(0xFF${normalized})`;
}

function colorClass(className: string, roles: Record<string, string>): string {
  const fields = Object.entries(roles)
    .map(([role, value]) => `  static const Color ${kebabToCamel(role)} = ${hexToDartColor(value)};`)
    .join('\n');
  return `class ${className} {\n${fields}\n}`;
}

function remOrPxToDouble(value: string): number {
  if (value.endsWith('rem')) return parseFloat(value) * 16;
  return parseFloat(value);
}

function spacingClass(spacing: Record<string, string>): string {
  const fields = Object.entries(spacing)
    .map(([name, value]) => `  static const double ${kebabToCamel(name)} = ${remOrPxToDouble(value)};`)
    .join('\n');
  return `class EqSpacing {\n${fields}\n}`;
}

function radiusClass(radius: Record<string, string>): string {
  const fields = Object.entries(radius)
    .map(([name, value]) => {
      const fieldName = name === 'DEFAULT' ? 'base' : kebabToCamel(name);
      return `  static const double ${fieldName} = ${remOrPxToDouble(value)};`;
    })
    .join('\n');
  return `class EqRadius {\n${fields}\n}`;
}

interface ParsedShadow {
  dx: number;
  dy: number;
  role: string;
}

function parseShadow(value: string): ParsedShadow | null {
  const match = /^(-?\d+)px (-?\d+)px 0 var\(--color-([a-z0-9-]+)\)$/.exec(value);
  if (!match) return null;
  return { dx: Number(match[1]), dy: Number(match[2]), role: match[3]! };
}

function elevationMethod(name: string, lightValue: string, darkValue: string): string {
  const lightParsed = parseShadow(lightValue);
  const lightExpr =
    lightValue === 'none' || !lightParsed
      ? 'const <BoxShadow>[]'
      : `[BoxShadow(color: EqLightColors.${kebabToCamel(lightParsed.role)}, offset: const Offset(${lightParsed.dx}, ${lightParsed.dy}), blurRadius: 0)]`;

  const darkParsed = parseShadow(darkValue);
  const darkExpr =
    darkValue === 'none' || !darkParsed
      ? 'const <BoxShadow>[]'
      : `[BoxShadow(color: EqDarkColors.${kebabToCamel(darkParsed.role)}, offset: const Offset(${darkParsed.dx}, ${darkParsed.dy}), blurRadius: 0)]`;

  return `  static List<BoxShadow> ${kebabToCamel(name)}({required bool dark}) => dark ? ${darkExpr} : ${lightExpr};`;
}

function elevationClass(tokens: Tokens): string {
  const names = Object.keys(tokens.shadow.light);
  const methods = names
    .map((name) => elevationMethod(name, tokens.shadow.light[name]!, tokens.shadow.dark[name]!))
    .join('\n');
  return `class EqElevation {\n${methods}\n}`;
}

function textStyleMethod(step: string, size: string, lineHeight: string, weight: number): string {
  const fontSize = parseFloat(size);
  const height = parseFloat(lineHeight) / fontSize;
  return [
    `  static TextStyle ${kebabToCamel(step)}({required bool dark}) => TextStyle(`,
    "    fontFamily: 'Plus Jakarta Sans',",
    `    fontSize: ${fontSize},`,
    `    height: ${height.toFixed(4)},`,
    `    fontWeight: FontWeight.w${weight},`,
    '    color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface,',
    '  );',
  ].join('\n');
}

function textStyleClass(type: Tokens['type']): string {
  const methods = Object.entries(type)
    .map(([step, { size, lineHeight, weight }]) => textStyleMethod(step, size, lineHeight, weight))
    .join('\n');
  return `class EqTextStyles {\n${methods}\n}`;
}

function themeFactory(brightness: 'light' | 'dark'): string {
  const className = brightness === 'light' ? 'EqLightColors' : 'EqDarkColors';
  const functionName = brightness === 'light' ? 'eqLightTheme' : 'eqDarkTheme';
  const brightnessValue = brightness === 'light' ? 'Brightness.light' : 'Brightness.dark';
  const schemeFactory = brightness === 'light' ? 'ColorScheme.light' : 'ColorScheme.dark';

  return [
    `ThemeData ${functionName}() {`,
    '  return ThemeData(',
    `    brightness: ${brightnessValue},`,
    `    scaffoldBackgroundColor: ${className}.surface,`,
    "    fontFamily: 'Plus Jakarta Sans',",
    `    colorScheme: ${schemeFactory}(`,
    `      primary: ${className}.primary,`,
    `      onPrimary: ${className}.onPrimary,`,
    `      secondary: ${className}.secondary,`,
    `      onSecondary: ${className}.onSecondary,`,
    `      error: ${className}.error,`,
    `      onError: ${className}.onError,`,
    `      surface: ${className}.surface,`,
    `      onSurface: ${className}.onSurface,`,
    '    ),',
    '  );',
    '}',
  ].join('\n');
}

export function emitDart(tokens: Tokens): string {
  return [
    GENERATED_BANNER,
    "import 'package:flutter/material.dart';",
    '',
    colorClass('EqLightColors', tokens.color.light),
    '',
    colorClass('EqDarkColors', tokens.color.dark),
    '',
    spacingClass(tokens.spacing),
    '',
    radiusClass(tokens.radius),
    '',
    elevationClass(tokens),
    '',
    textStyleClass(tokens.type),
    '',
    themeFactory('light'),
    '',
    themeFactory('dark'),
    '',
  ].join('\n');
}
