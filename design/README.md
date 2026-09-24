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
| Hero banner (season badge, welcome heading, subtitle, "Iniciar Sessão Diária" CTA) | F05 | implemented | Heading, subtitle and the primary action are `ClassroomHero`, labelled "Open classroom" (English, matching the product's established UI copy rather than the mockup's Portuguese text) and reflecting an in-progress lesson when one is open. The season badge is out of scope: Section 7, Social and comparison excludes it, the same clause that already dropped the identical badge on the sign-in mockup above |
| Module cards — section header ("Módulos Essenciais") | F05 | deferred | Frames the module grid below; built with whichever module ships first |
| Module card — "Praticar com IA" | — | dropped | Section 7, AI and providers: "…live voice conversation with the AI" — this card is exactly that capability |
| Module card — "Cenários & Ligações" | F06 | deferred | Lesson Scenario and Role Cards |
| Module card — "Lições Diárias" | F15 | deferred | Study Plan Generation surfaces the activity this card links to |
| Module card — "Treino de Pronúncia" | F18 | deferred | Speaking and Pronunciation Activities |
| Module card — "Desafios & Metas" (XP, streak, troféus) | — | dropped | Section 7, Social and comparison: "Leaderboards, streaks, badges…" — the card's entire premise is the excluded mechanic |
| Stat card — "Ofensiva Diária" (streak) | — | dropped | Section 7, Social and comparison: "…streaks…" |
| Stat card — "Tempo de Conversação" | F20 | deferred | Progress and Evolution Dashboard; the PRD's F22 entry names this explicitly rather than mocking a number now |
| Stat card — "Nível de Domínio" | F20 | deferred | Progress and Evolution Dashboard, same reasoning |
| Recommended-scenario card, including its "+75 XP" chip | F06 | implemented | `RecommendedScenarioCard` below the hero: the eyebrow, heading, description and action mirror the mockup. With a lesson open and its situation ready it shows that situation's title, premise, domain and role count; otherwise it invites opening the classroom — nothing is generated ahead of time (Section 6, F06: "This is preparation inside the room, not scheduling"). The "+75 XP" and duration chips are not built: Section 7, Social and comparison, the same clause as the header XP chip |
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

## design/english_quest_pr_chamada_teste_de_dispositivos

The four classroom mockups arrived during F06 and were built in the same pass, at the user's request: the screens themselves are F05's (their owner below), the scenario regions F06's. All four sit in a 1200px container under the shared `AppHeader` — `apps/web/src/app/classroom/layout.tsx` — and scroll like any other page.

| Region | Owner | Status | Reference |
|---|---|---|---|
| Header: logo, pill navigation, avatar | F22 | implemented | The shared `AppHeader`; see the dashboard table |
| Header: streak chip | — | dropped | See the dashboard table |
| Header: XP chip | — | dropped | See the dashboard table |
| Session eyebrow ("Sessão ao vivo") | F05 | implemented | "Live classroom" with the pulsing dot |
| Level label ("Nível B2 intermediário") | — | dropped | Section 7, Pedagogy: "Formal CEFR level certification or an official level placement test" — the product assigns no level a lesson could display |
| Title and subtitle | F05 | implemented | "Conversation scenario · Practice room". The subtitle names no scenario: Section 6, F06 generates it only once someone joins — "preparation inside the room, not scheduling" |
| Connection-latency badge ("38ms") | — | dropped | Section 6, F05: connection quality is reported per participant once connected — before joining there is no connection to measure |
| Camera stage with the camera-state pill | F05 | implemented | `PreCallScreen`'s stage, mirrored local video; "Camera on / off / unavailable" without the mockup's "HD 1080p", which the product never measures |
| "Áudio estéreo ativo" badge | — | dropped | Section 6, F05: the classroom reports mute state and connection quality only — a stereo claim would have nothing behind it |
| "Voz detectada" pill with activity bars | F05 | implemented | Driven by the real preview level |
| Floating microphone and camera toggles | F05 | implemented | Mute the preview tracks; the choice carries into the call |
| "Desfoque de fundo" (background blur) | — | dropped | Section 6, F05: the controls are microphone, camera, device settings, the scenario toggle and `End lesson` — no video effects |
| Microphone level card with the segmented meter | F05 | implemented | `LevelBars`, sixteen segments; the chip reads the live level ("Picking you up", "Speak to test") |
| Configure-devices card with per-device status | F05 | implemented | Three `DeviceSelect`s with Active/Ready/Unavailable; "N detected" counts the enumerated devices |
| "Testar som" action | F05 | implemented | A short tone on the selected output |
| Partner block ("Sarah Jenkins (Tutor AI)") | F05 | implemented | The real other account(s) from `GET /classroom/session` — initials avatar, name, whether they are already in. The AI-tutor persona is not built: Section 7, Scenarios, "Role-play with the AI as one of the participants" |
| Pre-call checklist | F05 | implemented | The headphones line, plus "Today's situation is generated the moment you join." |
| Checklist line "+50 XP" | — | dropped | Section 7, Social and comparison; see the dashboard table's XP chip |
| "Entrar na sala de aula" action | F05 | implemented | "Join classroom", in the product's English UI copy |
| "Voltar para a lista de cenários" link | F05 | implemented | Leads to the dashboard: the scenario-list destination is the deferred "Scenarios & Practice" pill entry, see the dashboard table |
| Footer | — | dropped | See the dashboard table |

## design/english_quest_sala_de_espera_cen_rio_da_conversa

| Region | Owner | Status | Reference |
|---|---|---|---|
| Header: logo, pill navigation, avatar | F22 | implemented | The shared `AppHeader`; see the dashboard table |
| Header: streak chip | — | dropped | See the dashboard table |
| Header: XP chip | — | dropped | See the dashboard table |
| Session bar: waiting status, room label, timer, connection | F05 | implemented | F05's own "Waiting for {names} to join", "1:1 conversation room" (or the cap above 2), the elapsed timer, and the caller's connection quality in place of a latency figure |
| "Sua prévia de vídeo" card with its "Ao vivo" chip | F05 | implemented | The caller's own `ParticipantTile` at card width |
| Flip-camera button on the preview | — | dropped | Section 6, F05: camera choice lives in device settings on the control bar |
| Microphone level with its rating | F05 | implemented | F21's `Meter` |
| "Procurando parceiro…" box | F05 | implemented | Names who hasn't joined yet. The matchmaking copy ("students at B2/C1 compatible with this theme") is not built: Section 7, Accounts and access — no more than the 2 seeded users, so there is no pool to search |
| Session reminders card | F06 | implemented | The product's own rules: English only, keep the objective private, use the expressions. The mockup's "at least 10 minutes" is not a product rule |
| Scenario card: domain chip | F06 | implemented | The vocabulary domain |
| Scenario card: level chip ("B2 - C1 Advanced") | — | dropped | Section 7, Pedagogy, as for the pre-call level label |
| Scenario card: "Novo cenário (3 restantes)" | F06 | implemented | "New situation (N rerolls left)"; the limit message sits beneath it at zero, the opener-only message for everyone else |
| Scenario card: title and quoted premise | F06 | implemented | The situation's `title` (added to `scenario-situation` v2 for this card) over setting and premise as one quote |
| Scenario card: assigned-roles grid | F06 | implemented | "Your role" highlighted, every other seat "Partner's role", each with its relationship |
| Scenario card: talk-about grid | F06 | implemented | The discussion hooks |
| Secret briefing: "Somente você pode ver isso" badge and register chip | F06 | implemented | "Only you can see this"; the register as a chip |
| Secret briefing: objective and constraint | F06 | implemented | Preceded by the role and the card's background — Section 6, F06 reads the briefing as "who you are" first, which the mockup has no slot for |
| Secret briefing: expressions to try | F06 | implemented | Static chips |
| "+10 XP por expressão" | — | dropped | Section 7, Social and comparison |
| Floating control bar: microphone, camera, device settings, end | F05 | implemented | `ControlBar`, sticky to the viewport |
| Control bar: "Cenário" tab | F06 | implemented | Shown pressed: in the waiting room the scenario is already the page's main column |
| Control bar: "Chat" tab | — | dropped | Section 7, Lesson experience: "Screen sharing, in-lesson chat, whiteboard, or shared documents" |
| Footer | — | dropped | See the dashboard table |

## design/english_quest_chamada_ativa_de_pr_tica

| Region | Owner | Status | Reference |
|---|---|---|---|
| Header: logo, pill navigation, avatar | F22 | implemented | The shared `AppHeader`; see the dashboard table |
| Header: streak chip | — | dropped | See the dashboard table |
| Header: XP chip | — | dropped | See the dashboard table |
| Top bar: elapsed-time pill | F05 | implemented | Pulsing dot, from `lessons.started_at` |
| Top bar: lesson title | F06 | implemented | The situation's `title`; "Live lesson" without one |
| Top bar: "Level B2+" chip | — | dropped | Section 7, Pedagogy, as on the pre-call screen |
| Top bar: connection line | F05 | implemented | The caller's own quality label; no millisecond figure |
| Top bar: "AI Native Coach: Sarah J." | — | dropped | Section 7, Scenarios: "Role-play with the AI as one of the participants" |
| Top bar: "Live CC" | — | dropped | Section 6, F08: transcription runs on the audio object F07 records — there is no live transcript to caption from |
| Top bar: "Sound: On" | F05 | implemented | Mutes remote playback without unsubscribing |
| Top bar: recording indicator | F07 | implemented | `RecordingIndicator`, mounted in the top bar's reserved slot; `Not recording` shows the dismissible `NotRecordingBanner` beneath the bar |
| Main stage: remote video with the name pill | F05 | implemented | `ParticipantGrid`, 16:9 |
| "Partner is speaking…" pill | F05 | implemented | LiveKit's active-speaker flag |
| "Audio AI Active" chip | — | dropped | Section 7, AI and providers: "live voice conversation with the AI" |
| Resolution chip ("1080p HD") | — | dropped | Section 6, F05: a tile reports connection quality as a three-bar icon, which already sits on it |
| Self picture-in-picture | F05 | implemented | The local tile inset over the stage |
| In-video chat glyph | — | dropped | Section 7, Lesson experience: in-lesson chat |
| "Pronunciation & Fluency Radar" | — | dropped | Section 7, Scenarios: "Real-time coaching, live hints or in-call correction while the lesson is happening" |
| Scenario brief: header, domain chip, close | F06 | implemented | `ScenarioPanel`, toggled from the control bar and closed by default — Section 6, F06: "the scenario collapses into a side panel toggled from the control bar" |
| Scenario brief: context and setting | F06 | implemented | Setting and premise |
| Scenario brief: talk about | F06 | implemented | The discussion hooks |
| Scenario brief: "Only you can see this" card | F06 | implemented | The viewer's role, objective, constraint and register |
| Scenario brief: expressions to try | F06 | implemented | Static chips. "Tap once you speak it" is not built: Section 6, F06 — expression chips dimming as they are used "is not attempted in the MVP" |
| "Request Hint from Sarah" | — | dropped | Section 7, Scenarios: live hints |
| Control bar: microphone with its activity dot, camera, settings, Scenario, End lesson | F05 | implemented | `ControlBar`; the Scenario toggle turns amber while the brief is open |
| Control bar: chat button | — | dropped | Section 7, Lesson experience: in-lesson chat |
| Footer | — | dropped | See the dashboard table |

## design/english_quest_confirma_o_de_encerramento

| Region | Owner | Status | Reference |
|---|---|---|---|
| Blurred call backdrop | F05 | implemented | The real call screen behind a dimmed, blurred overlay |
| Backdrop filler (AI notes panel, current-prompt card, "+30 XP Goal", native-tutor tile, "Audio HD" and "B2 Practice" chips) | — | dropped | Section 7, Scenarios, real-time coaching; the real backdrop is the live call, whose regions the active-call table tracks |
| Icon with the warning badge, "Final call" chip | F05 | implemented | `EndLessonDialog` |
| Bilingual title | F05 | implemented | "End the lesson for everyone?", English only |
| Information box | F05 | implemented | The PRD's "Processing will start and results will be ready in about 30 minutes."; the "Tutor Emma" line becomes "Everyone in the room is disconnected when the lesson ends." |
| Cancel and End lesson actions, close control | F05 | implemented | English labels only |
| "24m 18s audio recorded safely" | F07 | implemented | `EndLessonDialog`'s footer line, from the caller's own captured seconds; reads "This lesson is not being recorded." instead when the recording failed, and is omitted before the lesson starts |
| "+120 XP earned" | — | dropped | Section 7, Social and comparison |
