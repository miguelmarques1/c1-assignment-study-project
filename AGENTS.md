# AGENTS.md

English Quest is a private study platform for reaching CEFR C1 in English. A small group (two people today) holds a live conversation lesson on the web; each participant's audio is then transcribed, scored for pronunciation and analysed into a learning profile and a study plan, which they work through on web or mobile. Everything runs locally under Docker, and every AI and Speech call runs on the user's own API key (BYOK).

This file is for coding agents. Humans start at [README.md](README.md). Each app has its own `AGENTS.md` with the conventions for that app.

## Where things are

| Path | What |
|---|---|
| `docs/prd.md` | Product definition: features F01–F22, what is out of scope (section 7), the dependency graph and waves, acceptance criteria. The source of truth for scope. |
| `docs/context.md` | Validated product decisions, in Portuguese. Where it disagrees with older prose, it wins. |
| `docs/F<NN>-<slug>/` | One folder per feature: `spec.md`, `plan.md` and `progress.md` (status, deviations, soft-fails, follow-ups). |
| `docs/api/openapi.json` | Committed OpenAPI snapshot, generated from the code. |
| `design/` | Stitch mockups (web only so far), `design/README.md` (who owns each mockup region and whether it is implemented, deferred or dropped) and `english_quest_design_system/DESIGN.md`. |
| `apps/api` | NestJS API ([apps/api/AGENTS.md](apps/api/AGENTS.md)). |
| `apps/web` | Next.js client: the live lesson plus everything else ([apps/web/AGENTS.md](apps/web/AGENTS.md)). |
| `apps/mobile` | Flutter client: everything except the live lesson ([apps/mobile/AGENTS.md](apps/mobile/AGENTS.md)). |
| `packages/shared` | Zod contracts, error codes and response envelopes shared by the API and the web. |
| `packages/design-tokens` | `tokens.json`, generating the web's CSS and TypeScript and the mobile's Dart library. |
| `.claude/rules/` | Short checklists for specific file kinds (migrations, prompts, shared contracts, tokens, feature docs). Any agent can read them; Claude Code loads them automatically. |

To see what is already built, read the `**Status:**` line of each `docs/F*/progress.md`. The PRD's dependency graph says what can come next.

## Product rules that cut across every feature

These come from the PRD and `docs/context.md`. Breaking one is a bug even if every test passes.

- **BYOK routing.** A user's key processes only that user's data. There is no fallback to another participant's key. Keys never reach a client, which only ever sees a credential's status. Gemini calls go through `PromptExecutionService.execute(userId, promptId, variables)`, which runs under that user's key. Azure Speech follows the same rule.
- **Per-participant privacy.** Role cards, analyses, profiles, plans and results belong to their owner. Enforce this where data leaves the API (a response carries only the caller's own data), not by hiding it in the UI. There are no views comparing participants.
- **N participants, not a pair.** Room size is `LESSON_MAX_PARTICIPANTS` (default 2, up to 4). Never hard-code "the partner". Post-lesson processing forks per participant, and one participant's missing key or failure never blocks another's.
- **Client parity.** Web and mobile both do everything except the live lesson, which is web-only. A feature with a user-facing surface ships on both clients unless its spec says otherwise.
- **Design fidelity, both ways.** Match `./design` for what the product has, and don't build what the PRD excludes (XP, streaks, badges, leaderboards, social login, password reset, and so on). Record every dropped region in `design/README.md` with the PRD clause behind it. Mobile has extra rules in [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md).
- **The product speaks English.** UI copy, prompts, feedback and explanations are all in English.
- **Prompts are files.** They live in `apps/api/prompts/*.yaml`, versioned in git, and every generated artifact stores the prompt id and version that produced it.
- **No media in git.** Imported audio is uploaded to MinIO by the importer; only its `meta.json` is versioned.

## Running things

The host is Windows with Git Bash. Docker Desktop must be running, both for the stack and for integration tests (Testcontainers).

- **Stack:** `docker compose up -d`. The `api` and `web` containers start idle on purpose.
- **Dev servers** run inside the containers. Their file watchers miss host edits on this bind mount unless polling is on, so start them like this:

  ```bash
  MSYS_NO_PATHCONV=1 docker compose exec -d api sh -c 'cd /workspace/apps/api && TSC_WATCHFILE=DynamicPriorityPolling TSC_WATCHDIRECTORY=DynamicPriorityPolling pnpm dev > /tmp/api-dev.log 2>&1'
  MSYS_NO_PATHCONV=1 docker compose exec -d web sh -c 'cd /workspace/apps/web && WATCHPACK_POLLING=true CHOKIDAR_USEPOLLING=true pnpm dev > /tmp/web-dev.log 2>&1'
  ```

  Web runs on :3000 and the API on :3001 (`/health`, Swagger at `/docs`). Before trusting a runtime check after an edit, confirm the log shows a recompile, or restart the server.
- **Accounts** come from `SEED_USERS` in `.env`: `docker compose exec api pnpm db:seed`. There is no sign-up screen.
- **Validation** runs on the host:

  | Check | Command |
  |---|---|
  | Typecheck everything | `pnpm -r typecheck` |
  | Lint (zero warnings allowed) | `pnpm lint` |
  | Every JS/TS test suite | `pnpm -r test` |
  | API unit / integration | `pnpm --filter @english-quest/api test:unit` · `test:integration` |
  | One API test file | `pnpm --filter @english-quest/api test test/integration/scenario.spec.ts` |
  | Web tests | `pnpm --filter @english-quest/web test` |
  | Mobile | `flutter analyze` and `flutter test`, from `apps/mobile` |

**Gotchas**
- In Git Bash, any container path in a `docker compose exec` command needs `MSYS_NO_PATHCONV=1`, or the path gets mangled.
- Editing `.env` doesn't reach a running container. Apply it with `docker compose up -d --force-recreate api web`.
- The containers have their own `node_modules` volumes. After adding a dependency, run `pnpm install` both on the host and in the container (`docker compose exec api pnpm install`).
- Prompt and rule YAML (`apps/api/prompts`, `apps/api/rules`) is only read when the API boots, so restart the API after editing either.
- The containers have no `ps`. To find a stale dev server's PID, look through `/proc/*/cmdline`.

## Definition of done

- Typecheck, lint and the affected test suites pass, because you ran them. Written code is not working code.
- Anything with a runtime surface (a route, a screen, a migration) was exercised against the running stack. If it wasn't, say so plainly and say why.
- A new or changed route has its OpenAPI decorators, and `docs/api/openapi.json` was regenerated. A test fails otherwise.
- If a change contradicts a feature's `spec.md`, either update the spec or record the change in that feature's `progress.md`.
- Report failures and skipped checks as they are. A check you couldn't run and said so is fine; a hidden one isn't.

## How work is organized

- **Features** go from PRD to spec, plan and implementation: `docs/F<NN>-<slug>/spec.md` and `plan.md`, then an implementation run that keeps `progress.md` up to date. In Claude Code these are the `prd-writer`, `spec-writer` and `implement-feature` skills.
- **Everything else** (fixes, redesigns, tooling) needs no ceremony: make the change, validate it as above, commit when asked.
- Earlier features' `progress.md` files list open follow-ups. Check the relevant ones before changing an area.
- **Agent tooling** lives in `.claude/`:
  - `skills/`: `prd-writer`, `spec-writer`, `implement-feature`, and `mobile-ui` for any Flutter screen or widget work.
  - `rules/`: checklists that apply to specific file kinds.
  - `settings.json`: shared and committed. Personal permissions go in `settings.local.json`.
  - `launch.json`: its `web` (:3000) and `api` (:3001) entries attach to dev servers that are already running; they don't start them.

## Code conventions (all apps)

- Match the surrounding code: naming, comment density, idiom. Comments explain why, not what.
- Test names are snake_case sentences describing behaviour: `it('reroll_is_blocked_at_the_limit', …)`, `test('maps_401_to_session_expired', …)`.
- **Contracts are defined once**, as Zod schemas in `packages/shared`. The API validates with them and the web imports their types. The mobile mirrors them in hand-written Dart models, so change all three together. See [.claude/rules/shared-contracts.md](.claude/rules/shared-contracts.md).
- **Error codes** live in `packages/shared/src/errors/codes.ts` with their HTTP status and user-facing message. Clients switch on the code, never on the message.
- **Styling values** come only from `packages/design-tokens/tokens.json`. Never edit the generated files by hand. See [.claude/rules/design-tokens.md](.claude/rules/design-tokens.md).

## Git

- Work on `main` unless asked otherwise. Don't create or switch branches on your own.
- Stage explicit paths. Never use `git add -A` or `git add .`: the working tree often holds someone's unrelated work in progress, so leave it alone.
- Never skip hooks or rewrite pushed history.
- Commit subject: `<scope> - <what changed>`, lowercase after the dash, no trailing period. The scope is a feature id (`F06`) or an area: `api`, `web`, `mobile`, `tokens`, `PRD`, `harness`, `skill`. Implementation runs use `F06 stage 2 - generation` and `F06 final verification - close the run`. The body says why, not what.

## Language

- Talk to the user in Brazilian Portuguese.
- Everything committed is in English: code, comments, docs, specs, commit messages and UI copy. The one exception is `docs/context.md`, which stays in Portuguese.
