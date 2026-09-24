# apps/web: Next.js client

Next.js 15 (App Router) with React 19, Tailwind v4 built on `@english-quest/design-tokens`, and `livekit-client` for the live lesson. The web client is where lessons happen, and it also does everything the mobile app does (see "Client parity" in the root [AGENTS.md](../../AGENTS.md)).

## Layout

- `src/app/`: `(app)/` holds the signed-in screens (dashboard, settings) under the shared `AppHeader` layout. `classroom/` is the lesson flow (pre-call, waiting room, live stage). `(dev)/design-system` is the component gallery. `login/` is the only public page.
- `src/middleware.ts` redirects users without a session.
- `src/components/ui/`: design-system primitives (Button, Card, Badge, Meter, Chip, Field, TextField, Stack, Grid, page states, Avatar, NavPill, Logo) and `ui/icons`. Build screens from these. Extend a primitive before hand-rolling a one-off.
- `src/components/<area>/`: screen components (`classroom/`, `dashboard/`, …). Hooks that wrap browser or LiveKit APIs sit next to them (`use-classroom-room.ts`, `use-media-preview.ts`).
- `src/lib/`: `api-client.ts` (`apiFetch`, which is browser-side, sends the session cookie and throws `ApiRequestError` with the error code), `server-session.ts` (server-component reads over the container network: `getCurrentUser`, `getClassroomSession`, `getScenarioView`), and one small module per API area (`classroom.ts`, `scenario.ts`, `credentials.ts`).

## Styling: tokens only

Tests enforce these rules, so a violation fails the build:

- **No raw values.** No hex colours and no Tailwind arbitrary values (`bg-[#…]`, `p-[13px]`). `test/no-raw-values.spec.ts` keeps a named allowlist, which is currently empty.
- **Every class must resolve to a token.** `test/token-resolution.spec.ts` checks colour roles, radii, spacing and type steps against the token package.
- **Widths use the numeric scale** (`max-w-96`, `max-w-128`, `max-w-200`, `max-w-300`). The named ones (`max-w-sm` … `max-w-xl`) collide with the `--spacing-*` tokens and resolve to tiny values.
- **Build conditional or multi-part class strings with `cn()`** (`components/ui/cn.ts`), not nested template literals, which the token scanner misreads.
- Tailwind preflight makes `svg` a block element. For an icon next to text inside a Button, wrap both in an `inline-flex` span.
- Aspect ratios work without brackets: `aspect-4/3`, `aspect-16/10`.

## Design fidelity

- Before building or changing a screen, open its mockup in `design/<screen>/` (`screen.png` for the look, `code.html` for exact structure) and its section in `design/README.md`.
- Build only the regions marked `implemented` or owned by the feature you're working on. When you drop a region, add a row with the PRD clause that excludes it. When you implement a deferred one, flip its row. `test/design-reference.spec.ts` checks that every mockup is covered.
- Match layout, spacing, composition and visual weight. Deviate only for real data, auth state or platform needs, never for taste.

## Accessibility

- `eslint-plugin-jsx-a11y` runs with the recommended set, and `control-has-associated-label` is promoted to an error. Every interactive control needs an accessible name.
- Tests query by role and name (`getByRole('button', { name: … })`), which also checks the names.

## Tests

- Vitest and Testing Library, in `test/*.spec.tsx`, with setup in `test/setup.ts`. Run them with `pnpm --filter @english-quest/web test`.
- LiveKit and media APIs are faked in tests. The live stage is covered by component tests that seed a remote participant.
- Visual regression: Playwright runs in the `visual` compose service against the containerised web server (the web dev server must be running). Run `docker compose up -d visual`, then `docker compose exec visual npx playwright test`, adding `--update-snapshots` to accept new baselines. Baselines live in `e2e/__screenshots__`. Starting `visual` can recreate `web` and `api`, which kills their dev servers, so restart them afterwards.

## Runtime checks

- The dev server is at http://localhost:3000. Log in with a seeded account from `SEED_USERS`.
- In development only, the classroom offers "Continue without camera or microphone" after an 8-second stall on the permission prompt or when the microphone is denied. Use it to walk the pre-call screen and the waiting room in a browser without devices. Production keeps F05's rule that a denied microphone blocks joining.
- An embedded agent browser, such as Claude's preview pane, can't grant camera or microphone access and can't complete WebRTC to the local LiveKit. That's why the no-media path exists.
- A real call (remote video, audio, the speaking indicator) needs two real browsers with working WebRTC. If you can't run that, say so and leave it as a manual check.
