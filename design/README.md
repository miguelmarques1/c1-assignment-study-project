# Design Reference

This file maps every region of every mockup under `design/` to the feature that owns it. It exists so that building a screen starts from a decision already made instead of a fresh interpretation of the mockup — see F22 in `docs/prd.md`.

**Status column:**
- `implemented` — the region exists in the product today, in the form recorded in the Reference column
- `deferred` — the region's content belongs to a feature not yet built; the owning feature reviews this table before building its screen rather than approximating the region now
- `dropped` — the region contradicts the product and will not be built; the Reference column names the PRD clause that excludes it

A region with no row is a gap in this document, not an undocumented decision — the completeness guard at `apps/web/test/design-reference.spec.ts` enforces that every mockup with a `screen.png` is covered here.

Two things intentionally have no row anywhere in this document: elements that never render in the mockup's `screen.png` because the mockup tool hides them by default (the settings mockup's toast notification, its key-replacement modal), and cosmetic micro-detail within an already-listed region (a secondary trust icon beside a provider name, an icon riding on an action button). Both are sub-detail of a region already tracked, not regions of their own — inflating the table to that granularity would make it harder to read, not more accurate.

---

## design/english_quest_sign_in

| Region | Owner | Status | Reference |
|---|---|---|---|
| Logo mark | F21 | implemented | Already the `Logo` component; unchanged by this pass |
| "Quest Season 3" badge | — | dropped | Section 7, Social and comparison: "Leaderboards, streaks, badges…" — a seasonal badge chip is the same gamification device the clause excludes |
| Title + subtitle | F22 | implemented | "English Quest" / "Sign in to continue." — existing copy, unchanged |
| Email field, leading icon, address hint | F22 | implemented | `TextField` with a leading mail icon and the example address as `labelAside` |
| Password field, leading icon, reveal control | F22 | implemented | `TextField` with a leading lock icon and `revealable` |
| "Esqueci minha senha" (forgot password) link | — | dropped | Section 7, Accounts and access: "…password reset by email" |
| Primary "Sign In" action | F22 | implemented | Existing submit button, brought to the mockup's fuller weight |
| "ou continue com" divider + Google button | — | dropped | Section 7, Accounts and access: "Social login, two-factor authentication, and single sign-on" |
| "Daily Conversational Roleplay" value card | — | dropped | Section 7, Accounts and access: this card exists to persuade an anonymous visitor to register; moot without public registration |
| "Ainda não tem uma conta? Crie uma agora" footer | — | dropped | Section 7, Accounts and access: "Public registration, invitations, email verification…" |
| Bottom encrypted-connection trust note | — | dropped | Section 7, Accounts and access: the same registration-funnel trust copy as the value card above, moot for the same reason |

## design/english_quest_dashboard

| Region | Owner | Status | Reference |
|---|---|---|---|
| Header: logo + wordmark | F21 | implemented | Shared with settings; unchanged |
| Header: pill navigation | F22 | implemented | Shared with settings; carries Dashboard and Settings today. "Scenarios & Practice" is a third pill entry deferred to F06 |
| Header: streak chip ("7 Day Streak") | — | dropped | Section 7, Social and comparison: "Leaderboards, streaks, badges…" |
| Header: XP chip ("1,420 XP") | — | dropped | Section 7, Social and comparison: the same clause — XP is this product's name for the points mechanic it excludes |
| Header: avatar | F22 | implemented | Shared with settings; initials avatar rather than the mockup's generic person icon |
| Hero banner (season badge, welcome heading, subtitle, "Iniciar Sessão Diária" CTA) | F05 | deferred | The CTA starts a live classroom session, which is F05's surface to build |
| Module cards — section header ("Módulos Essenciais") | F05 | deferred | Frames the module grid below; built with whichever module ships first |
| Module card — "Praticar com IA" | — | dropped | Section 7, AI and providers: "…live voice conversation with the AI" — this card is exactly that capability |
| Module card — "Cenários & Ligações" | F06 | deferred | Lesson Scenario and Role Cards |
| Module card — "Lições Diárias" | F15 | deferred | Study Plan Generation surfaces the activity this card links to |
| Module card — "Treino de Pronúncia" | F18 | deferred | Speaking and Pronunciation Activities |
| Module card — "Desafios & Metas" (XP, streak, troféus) | — | dropped | Section 7, Social and comparison: "Leaderboards, streaks, badges…" — the card's entire premise is the excluded mechanic |
| Stat card — "Ofensiva Diária" (streak) | — | dropped | Section 7, Social and comparison: "…streaks…" |
| Stat card — "Tempo de Conversação" | F20 | deferred | Progress and Evolution Dashboard; the PRD's F22 entry names this explicitly rather than mocking a number now |
| Stat card — "Nível de Domínio" | F20 | deferred | Progress and Evolution Dashboard, same reasoning |
| Recommended-scenario card, including its "+75 XP" chip | F06 | deferred | Lesson Scenario and Role Cards; the XP chip within it is dropped once built, under the same Social-and-comparison clause as the header XP chip |
| Footer (© 2025, Privacy Policy, Terms of Service, Support Desk) | — | dropped | Section 7, Accounts and access: a private, two-seeded-user deployment has no public visitor needing these pages |

## design/english_quest_settings

| Region | Owner | Status | Reference |
|---|---|---|---|
| Header: logo + wordmark | F21 | implemented | Shared with dashboard; unchanged |
| Header: pill navigation | F22 | implemented | Shared with dashboard; see the dashboard table for the deferred third destination |
| Header: streak chip | — | dropped | Shared with dashboard; see the dashboard table |
| Header: XP chip | — | dropped | Shared with dashboard; see the dashboard table |
| Header: avatar | F22 | implemented | Shared with dashboard; see the dashboard table |
| Heading with leading icon | F22 | implemented | `SettingsIcon` beside "Settings" |
| "BYOK Environment Active" status chip | F22 | implemented | Reads `Environment ready` / `Keys need attention`, derived from real per-provider validity rather than the mockup's decorative always-on pulse |
| BYOK explanation paragraph | F22 | implemented | Promoted from a paragraph to a `Card` |
| Gemini credential card (icon, title, status badge, masked key field, last-checked, actions) | F22 | implemented | `TextField` read-only presentation for the key; `Replace key` / `Re-check` / icon-only delete |
| Azure Speech credential card (icon, title, status badge, masked key field, region chip, last-checked, actions) | F22 | implemented | Same as the Gemini card, plus the region chip |
| Copy-key control on each card | — | dropped | Section 6, F02: "the original value cannot be revealed anywhere… replacing it is the only way to change it" — a control offering to copy a masked value delivers nothing |
| Help banner ("Precisa de ajuda…") | F22 | implemented | Ships as a static card with no link in Core Scope; the real links to the Google AI Studio and Azure Portal consoles are this same feature's Full Scope addition, not a different feature |
| "Visual Pattern Guide" reference block | — | dropped | Section 7, Design and visual alignment: not a proposed product element — the mockup tool's own note about where it drew inspiration from, never intended to ship |
| Footer (© 2025, Privacy Policy, Terms of Service, Support Desk) | — | dropped | Section 7, Accounts and access: same reasoning as the dashboard footer |

## design/english_quest_logo

| Region | Owner | Status | Reference |
|---|---|---|---|
| App icon mark | F21 | implemented | The `Logo` component, recoloured onto token roles instead of the mockup's literal hex values |
