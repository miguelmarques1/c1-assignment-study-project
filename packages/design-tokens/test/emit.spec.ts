import { describe, expect, it } from 'vitest';

import { loadTokens } from '../src/build';
import { emitCss } from '../src/emit-css';
import { emitDart } from '../src/emit-dart';
import { emitTs } from '../src/emit-ts';

describe('emitCss', () => {
  it('css_emits_every_colour_role_in_both_blocks', () => {
    const tokens = loadTokens();
    const css = emitCss(tokens);

    for (const role of Object.keys(tokens.color.light)) {
      expect(css).toContain(`--color-${role}: ${tokens.color.light[role]};`);
    }
    for (const role of Object.keys(tokens.color.dark)) {
      expect(css).toContain(`--color-${role}: ${tokens.color.dark[role]};`);
    }
  });

  it('dark_is_reachable_only_through_the_explicit_attribute', () => {
    // Light is the designed default regardless of OS preference: dark must
    // never key off prefers-color-scheme, only off an explicit data-theme.
    const css = emitCss(loadTokens());
    expect(css).not.toContain('prefers-color-scheme');
    expect(css).toContain(":root[data-theme='dark']");
  });
});

describe('emitTs', () => {
  it('ts_emits_a_union_for_every_enumerated_vocabulary', () => {
    const tokens = loadTokens();
    const ts = emitTs(tokens);

    expect(ts).toMatch(/export type ButtonVariant = .+;/);
    expect(ts).toMatch(/export type BadgeStatus = .+;/);
    expect(ts).toMatch(/export type MeterState = .+;/);
    expect(ts).toMatch(/export type SpacingToken = .+;/);

    for (const status of ['success', 'warning', 'info', 'danger', 'neutral']) {
      expect(ts).toContain(`'${status}'`);
    }
  });
});

describe('emitDart', () => {
  it('dart_emits_a_theme_for_each_brightness', () => {
    const dart = emitDart(loadTokens());
    expect(dart).toContain('ThemeData eqLightTheme()');
    expect(dart).toContain('ThemeData eqDarkTheme()');
    expect(dart).toContain('class EqLightColors');
    expect(dart).toContain('class EqDarkColors');
  });
});

describe('cross-artifact parity', () => {
  it('all_three_outputs_agree_on_every_value', () => {
    const tokens = loadTokens();
    const css = emitCss(tokens);
    const ts = emitTs(tokens);
    const dart = emitDart(tokens);

    for (const theme of ['light', 'dark'] as const) {
      for (const [role, hex] of Object.entries(tokens.color[theme])) {
        expect(css).toContain(`--color-${role}: ${hex};`);
        expect(ts.toLowerCase()).toContain(`'${role}': '${hex}'`.toLowerCase());

        const dartColor = `Color(0xFF${hex.replace('#', '').toUpperCase()})`;
        expect(dart).toContain(dartColor);
      }
    }
  });
});
