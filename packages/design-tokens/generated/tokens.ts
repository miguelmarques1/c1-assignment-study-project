// GENERATED FILE — do not edit by hand.
// Source: packages/design-tokens/tokens.json
// Regenerate with `pnpm tokens:build`.

export const fontFamily = 'Plus Jakarta Sans';

export const color = {
  'surface': '#fbf8fc',
  'surface-container-lowest': '#ffffff',
  'surface-container': '#f0edf1',
  'surface-container-highest': '#e4e1e6',
  'on-surface': '#1b1b1e',
  'on-surface-variant': '#59413c',
  'outline': '#8d716a',
  'outline-variant': '#e1bfb8',
  'outline-strong': '#18181b',
  'primary': '#ae3115',
  'on-primary': '#ffffff',
  'primary-container': '#ff6b4a',
  'on-primary-container': '#18181b',
  'secondary': '#0058be',
  'on-secondary': '#ffffff',
  'tertiary': '#006c49',
  'error': '#ba1a1a',
  'on-error': '#ffffff',
  'badge-success-bg': '#00b07a',
  'badge-success-fg': '#003b26',
  'badge-warning-bg': '#fef3c7',
  'badge-warning-fg': '#92400e',
  'badge-info-bg': '#d8e2ff',
  'badge-info-fg': '#001a42',
  'badge-danger-bg': '#ffdad6',
  'badge-danger-fg': '#93000a',
  'badge-neutral-bg': '#e4e1e6',
  'badge-neutral-fg': '#1b1b1e',
} as const;

export const darkColor = {
  'surface': '#141316',
  'surface-container-lowest': '#1b1a1d',
  'surface-container': '#211f23',
  'surface-container-highest': '#2c2a2e',
  'on-surface': '#e5e1e6',
  'on-surface-variant': '#d8c2bc',
  'outline': '#a08d87',
  'outline-variant': '#4a3530',
  'outline-strong': '#e4e1e6',
  'primary': '#ffb4a3',
  'on-primary': '#5f1500',
  'primary-container': '#7a2a12',
  'on-primary-container': '#ffdad2',
  'secondary': '#adc6ff',
  'on-secondary': '#002e69',
  'tertiary': '#4edea3',
  'error': '#ffb4ab',
  'on-error': '#690005',
  'badge-success-bg': '#00513a',
  'badge-success-fg': '#6ffbbe',
  'badge-warning-bg': '#553f04',
  'badge-warning-fg': '#fde68a',
  'badge-info-bg': '#003c8f',
  'badge-info-fg': '#d8e2ff',
  'badge-danger-bg': '#93000a',
  'badge-danger-fg': '#ffdad6',
  'badge-neutral-bg': '#2c2a2e',
  'badge-neutral-fg': '#e5e1e6',
} as const;

export const spacing = {
  'xs': '0.25rem',
  'sm': '0.5rem',
  'md': '1rem',
  'lg': '1.5rem',
  'xl': '2.5rem',
  'gutter': '1.25rem',
  'gutter-mobile': '0.75rem',
  'margin': '2rem',
  'margin-mobile': '1rem',
} as const;

export const radius = {
  'sm': '0.25rem',
  'DEFAULT': '0.5rem',
  'md': '0.75rem',
  'lg': '1rem',
  'xl': '1.5rem',
  'full': '9999px',
} as const;

/** Each value is "size / lineHeight / weight", exactly as declared in tokens.json. */
export const typeScale = {
  'display': '44px / 52px / 800',
  'display-mobile': '32px / 40px / 800',
  'headline-lg': '32px / 40px / 700',
  'headline-lg-mobile': '26px / 34px / 700',
  'headline-md': '24px / 32px / 700',
  'headline-sm': '20px / 28px / 700',
  'title-lg': '18px / 26px / 600',
  'title-md': '16px / 24px / 600',
  'body-lg': '16px / 26px / 400',
  'body-md': '14px / 22px / 400',
  'body-sm': '12px / 18px / 500',
  'label-lg': '14px / 20px / 700',
  'label-md': '12px / 16px / 700',
  'label-sm': '11px / 14px / 800',
} as const;

/** Names only — shadow values differ by theme and reference a colour role, so they aren't a static JS value. */
export const shadowNames = ['card', 'button', 'modal', 'input-focus'] as const;

export const motion = {
  'duration-press': '120ms',
  'duration-base': '200ms',
  'ease-snappy': 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

export type ColorRole = keyof typeof color;
export type ShadowName = (typeof shadowNames)[number];
export type MotionToken = keyof typeof motion;
export type SpacingToken = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type RadiusToken = keyof typeof radius;
export type TypeStep = keyof typeof typeScale;

export type ButtonVariant = 'primary' | 'secondary' | 'neutral' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type BadgeStatus = 'success' | 'warning' | 'info' | 'danger' | 'neutral';
export type MeterState = 'scored' | 'warming-up';
export type CardTone = 'neutral' | 'primary' | 'info' | 'success';
export type ChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
