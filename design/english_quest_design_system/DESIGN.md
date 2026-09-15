---
name: English Quest Design System
colors:
  surface: '#fbf8fc'
  surface-dim: '#dcd9dd'
  surface-bright: '#fbf8fc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f2f7'
  surface-container: '#f0edf1'
  surface-container-high: '#eae7eb'
  surface-container-highest: '#e4e1e6'
  on-surface: '#1b1b1e'
  on-surface-variant: '#59413c'
  inverse-surface: '#303033'
  inverse-on-surface: '#f3f0f4'
  outline: '#8d716a'
  outline-variant: '#e1bfb8'
  surface-tint: '#ae3115'
  primary: '#ae3115'
  on-primary: '#ffffff'
  primary-container: '#ff6b4a'
  on-primary-container: '#661000'
  inverse-primary: '#ffb4a3'
  secondary: '#0058be'
  on-secondary: '#ffffff'
  secondary-container: '#2170e4'
  on-secondary-container: '#fefcff'
  tertiary: '#006c49'
  on-tertiary: '#ffffff'
  tertiary-container: '#00b07a'
  on-tertiary-container: '#003b26'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad2'
  primary-fixed-dim: '#ffb4a3'
  on-primary-fixed: '#3d0600'
  on-primary-fixed-variant: '#8c1900'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#fbf8fc'
  on-background: '#1b1b1e'
  surface-variant: '#e4e1e6'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 44px
    fontWeight: '800'
    lineHeight: 52px
  display-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  title-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '800'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system blends **Soft Neo-brutalism** with a **Warm Editorial** sensibility tailored specifically for an English learning and conversational roleplay platform. Moving decisively away from cold, generic dark-mode dashboards, it infuses language acquisition with warmth, tactile delight, and physical presence.

### Brand Personality
- **Warm & Encouraging:** A welcoming, conversational companion that softens the anxiety often tied to learning and speaking a foreign language.
- **Tactile & Gamified:** Tangible cards, crisp black outlines, and responsive mechanical-press interactions evoke early flashcards, physical desk notebooks, and playful indie games.
- **Crisp & Authoritative:** High-contrast typography and intentional editorial layout balance the playful neo-brutalism with academic clarity.

### Target Audience & Emotional Impact
Designed for language learners, students, and professionals engaging in conversational roleplays and AI speech practice. The interface builds confidence through clear visual states, tactile feedback on button presses, status badges, and zero visual ambiguity. (This reference's gamification vocabulary — XP, levels, streaks — is visual inspiration only; the product excludes it, per Section 7 of `docs/prd.md`.)

## Colors

The palette establishes a high-contrast yet soothing atmosphere. The default color mode is strictly **light**, using a soft violet-tinted paper tone for the background and clean white paper for content surfaces.

*Corrected against the frontmatter above, which is what the rendered reference screens actually use and is authoritative — an earlier draft of this prose named a different, unused palette (`#FF6B4A` primary, `#F8F4EE` canvas, `#3B82F6` secondary, `#10B981` tertiary, `#FBBF24` amber, `#EF4444` danger). Measured against the screens, those hexes appear far less often than the frontmatter's and were never the palette actually shipped.*

### Palette Architecture
- **Canvas / Backgrounds:**
  - Base Canvas: `surface` (`#FBF8FC`)
  - Content Surface: `surface-container-lowest` (`#FFFFFF`)
  - Elevated Surface: `surface-container` (`#F0EDF1`) / `surface-container-highest` (`#E4E1E6`)
- **Primary (Terracotta / Coral):** `#AE3115`, with `primary-container` `#FF6B4A` reserved for decorative washes (its contrast against white is too low for body text — pair it only with `on-primary-container` `#18181B`). Used for main calls-to-action and focus accents.
- **Secondary (Electric / Sky Blue):** `#0058BE`, with `secondary-container` `#2170E4` — used for AI conversational roleplays, speech status, audio playback controls, and link interactions.
- **Tertiary (Mint / Emerald):** `#006C49`, with `tertiary-container` `#00B07A` — signifies successful validation and verified API connections.
- **Warning & Accent Amber:** repurposed in the product for warnings and the profile's "warming up" state, not XP (see Section 7 of `docs/prd.md` for what this product excludes).
- **Danger / Destructive:** `#BA1A1A`, with `error-container` `#FFDAD6` — reserved for delete actions, connection dropouts, and errors.
- **Structural Black / Neutral:** `#18181B` (`outline-strong`) — forms every 2px stroke, typographic header, and hard drop shadow that anchors the neo-brutalist aesthetic. In dark mode this role flips to a light outline (`#E4E1E6`), since a black shadow is invisible on a dark surface — elevation there is carried by the outline, not the shadow.

## Typography

**Plus Jakarta Sans** provides geometric precision paired with friendly, humanist curve profiles. It supports the punchy boldness required by neo-brutalism without sacrificing the readability necessary for comprehensive grammar explanations and conversation transcripts.

### Hierarchy Guidelines
- **Headlines & Titles:** Set in `FontWeight 700` and `800` with tight letter tracking (`-0.02em`). Keep titles punchy and authoritative.
- **Body & Dialogue Microcopy:** Set in `FontWeight 400` or `500` with generous line-height (`1.6x`) to prevent eye fatigue during prolonged reading and speech analysis sessions.
- **Badges & Labels:** Set with strong `FontWeight 700` or `800`, often coupled with uppercase styling and slight tracking (`+0.04em`) to punctuate tags like `VALID`, `WARMING UP`, or `SCENARIO`.

## Layout & Spacing

The layout model relies on a responsive, content-centered fluid grid designed to display learning modules and conversational scenarios cleanly side by side or stacked.

### Grid Architecture
- **Desktop (1024px+):** 12-column grid, max canvas width 1200px, 20px gutters, and 32px outer canvas margins. Cards typically span 4 columns (for 3-column rows) or 6 columns (for dual dashboard cards).
- **Tablet (768px – 1023px):** 8-column grid, 16px gutters, 24px margins. Cards span 4 columns (2-column rows).
- **Mobile (< 768px):** 4-column grid, 12px gutters, 16px margins. Cards reflow to full single-column width (span 4).

### Spacing Principles
- Component internal padding strictly uses `space-md` (16px) for compact elements like inputs and mini-badges, and `space-lg` (24px) for cards and scenario panels.
- Section spacing leverages `space-xl` (40px) to give bold strokes and hard shadows breathing room.

## Elevation & Depth

Visual hierarchy does not rely on soft, blurry box shadows. Instead, it utilizes **Hard Offset Brutalist Drop Shadows** coupled with solid 2px black outlines.

### Drop Shadow Tokens
- **Card Default Elevation:** `box-shadow: 4px 4px 0px #18181B;`
- **Button Rest Elevation:** `box-shadow: 3px 3px 0px #18181B;`
- **Floating Header / Modal Elevation:** `box-shadow: 6px 6px 0px #18181B;`
- **Input Focus Elevation:** `box-shadow: 2px 2px 0px #18181B;`

### Interactive Physics (The Mechanical "Press")
Elements are tactile and interactive:
- **Hover State:** An optional lift: `-translate-x-[1px] -translate-y-[1px]` expanding the shadow by +1px.
- **Active / Pressed State:** The element translates down and right (`transform: translate(3px, 3px)` for buttons, `translate(4px, 4px)` for cards), snapping the shadow to `0px 0px 0px transparent`. This physical click feedback reinforces user confidence during lesson choices.

## Shapes

The design system tempers hard-edged neo-brutalism with generous, friendly rounded corners. The geometric vocabulary uses intentional rounding to keep the interface approachable for learners:

- **Standard Cards & Containers:** `rounded-2xl` (16px to 20px) paired with a 2px solid `#18181B` border.
- **Buttons & Interactive Badges:** `rounded-xl` (12px) to `rounded-2xl` (16px).
- **Status Chips & Pills:** Full pill (`rounded-full` / 9999px) with a 2px solid `#18181B` border.
- **Form Inputs:** `rounded-xl` (12px) with a crisp 2px solid `#18181B` border.

> **Naming note:** these `rounded-*` names describe stock Tailwind's default radius scale, which this system's `radius` frontmatter (`sm .25rem`, `DEFAULT .5rem`, `md .75rem`, `lg 1rem`, `xl 1.5rem`, `full 9999px`) does not match key-for-key. Reading this section's names literally against the token scale above picks the wrong value. The mapping actually implemented: prose `rounded-2xl` (16–20px) → token `rounded-lg` (1rem); prose `rounded-xl` (12px) → token `rounded-md` (0.75rem); `rounded-full` is unambiguous in both.

## Components

### 1. Cards
- **Base Card:** Crisp pure white (`#FFFFFF`) background, 2px solid `#18181B` border, `rounded-2xl`, and `box-shadow: 4px 4px 0px #18181B`.
- **Accent Cards (Lessons / Scenarios):** Can feature soft background washes (`#FFF6F3` terracotta tint, `#F0FDF4` mint tint, or `#EFF6FF` blue tint) to categorize lesson difficulty and practice types.
- **Header & Action:** Cards include an icon container, bold headline (`title-lg`), concise subtext (`body-md`), and an interactive footer link with an underlined arrow.

### 2. Action Buttons
- **Primary Button (Coral / Terracotta):**
  - Background `#FF6B4A`, text `#FFFFFF` (or `#18181B` high contrast), 2px solid `#18181B` border, `rounded-xl`, padding `10px 20px`.
  - Shadow: `3px 3px 0px #18181B`.
  - Active: `translate-x-[3px] translate-y-[3px] shadow-none`.
- **Secondary Button (Electric Blue):**
  - Background `#3B82F6`, text `#FFFFFF`, 2px solid `#18181B` border, `rounded-xl`.
- **Neutral / Outlined Button (White / Cream):**
  - Background `#FFFFFF`, text `#18181B`, 2px solid `#18181B` border, `3px 3px 0px #18181B`.
- **Destructive Button:**
  - Background `#FFFFFF`, text `#EF4444`, border `2px solid #EF4444`, hover background `#FEE2E2`.

### 3. Inputs & Text Fields
- Surface: Creamy off-white (`#FFFDF9`), border 2px solid `#18181B`, `rounded-xl`, padding `12px 16px`.
- Typography: `body-md` in `#18181B`.
- Focus State: Hard border remains 2px solid `#18181B`, accompanied by `box-shadow: 2px 2px 0px #18181B` and a subtle highlight outline.

### 4. Status Badges & XP Chips
- Structure: Full pill shape (`rounded-full`), 2px solid `#18181B`, font `label-sm` (bold tracking).
- Variants:
  - **Success / Valid:** Mint green background (`#D1FAE5`), text `#065F46`.
  - **Active / XP:** Amber background (`#FEF3C7`), text `#92400E`.
  - **Speech / AI Ready:** Soft Blue background (`#DBEAFE`), text `#1E40AF`.
  - **Error / Attention:** Coral red background (`#FEE2E2`), text `#991B1B`.

### 5. Navigation Chrome
- **Top Navigation Bar:** Background `#F8F4EE` with a bottom 2px solid `#18181B` border, housing brand identity, navigation links (Dashboard, Lessons, Scenario Calls, Settings), and profile stats with XP indicators.
- **Active Navigation Indicator:** Selected navigation pills feature `#FFFFFF` background, 2px solid `#18181B` border, and `2px 2px 0px #18181B` shadow.