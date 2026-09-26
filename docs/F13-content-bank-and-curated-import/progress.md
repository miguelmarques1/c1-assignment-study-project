# Implementation Progress: Content Bank and Curated Import

**Status:** in progress
**Branch:** claude/content-bank-curated-import-044f65
**Started:** 2026-09-26
**Last updated:** 2026-09-26

## Stage 1: Contract and Data Model — ✅ done

- [x] **1. Shared Content Contract**
- [x] **2. Data Model and Migration**
- [x] **3. Curator Schema Files and Guide**

**Observations:**
- The worktree branch was created at F04 (`1f7a149`) while `main` was already at the F13 spec (`e8932bd`), 42 commits ahead. It was fast-forwarded to `main` before any work. The F13 spec and plan exist only from that commit on.
- `packages/shared/src/schemas/content.ts` follows the codebase's `xxxSchema` naming rather than the spec's bare names: `contentItemTypeSchema`, `importableContentTypeSchema`, `generatedContentTypeSchema`, `contentProvenanceSchema`, `cefrLevelSchema`, `contentAccentSchema`, `contentSkillSchema`, `questionFormatSchema`. The field builders keep the spec's names (`targetTagsField`, `questionsField`, `contentSlugField`).
- **Where the answer-key rules live (deviation from "`questionSchema` with per-format refinements").** The PRD pins the message `/questions/2/answer must be one of /questions/2/options`, which names a sibling by its absolute pointer. Only the enclosing array knows a question's index, so the answer-key checks (option membership, permutation, identity, complete pairs) are one exported function, `answerKeyIssues(question, index)`, run by `questionsField`. `questionSchema` keeps the rules that need no index: shape, duplicate options/segments/sides, one blank marker, equal `left`/`right` lengths. F16 can call `answerKeyIssues` directly if it ever needs to re-check one question.
- Zod v4 skips a refinement when a non-continuable (type) issue came first, as the docs state and a scratch run confirmed. So every type-dependent `meta.json` rule is a field-level rule on a per-type strict schema: `accent` is `contentAccentSchema` for listening and `z.never().optional()` elsewhere (`is only allowed for listening items`); `body` is required or optional by type; `skills` carries a per-type `must include "<type>"` refinement. With no item-level refinement on the curated schemas, a `meta.json` with several unrelated problems reports all of them. `generatedItemInputSchema` still needs one item-level check (`skills` must include `type`, except for `error_review`), which is skipped when another field has a type error. That is acceptable, because the other error is reported.
- `$schema` is an optional field of each curated schema, so strictness does not trip on the editor pointer. The importer ignores it.
- Added `curatedItemMetaJsonSchema(type)` to shared (not in the spec). `.meta()` descriptions and `uniqueItems` live in the registry of the Zod instance that built the schema, so emitting JSON Schema inside shared keeps the generator correct even if the API and shared ever resolve different Zod copies. Today both resolve `zod@4.6.5`.
- Also not in the spec: `apps/api/src/content/meta-schema.ts` (`buildMetaSchema`, `metaSchemaPath`, `renderMetaSchema`). `cli/schema.ts` runs `main()` on import, and the snapshot test has to rebuild the schemas in memory, so the builder has to be importable on its own. The snapshot test compares parsed JSON, not text, because `core.autocrlf=true` checks the files out with CRLF.
- Migration `0013_content_bank` is the spec's SQL verbatim. `0012` is left to F12 (`0012_learning_profile` on its branch). Prisma does not require contiguous numbering, and the two migrations touch unrelated tables, so either merge order works. `ContentItem` / `ContentItemServing` mirror it, and `User` gains `contentServings`. The migration was applied from scratch by Testcontainers (`seed.spec.ts`, 5/5). The CHECK constraints get their own direct-insert test in Stage 3 (`database_rejects_inconsistent_direct_inserts`).
- **`docs/api/openapi.json` changed, against the spec's "no change".** `apiErrorSchema.code` is `z.enum(Object.values(ERROR_CODES))`, so registering `CONTENT001`/`CONTENT002` adds two enum values to the `ApiError` component. No route or operation changed (still 24). Regenerated through `pnpm build` + `node dist/openapi/generate.js`: the `tsx` script still exits 1 silently, the gap F10 recorded.
- `.gitignore` audio patterns are now case-insensitive (`*.[mM][pP]3` and so on). The importer accepts `AUDIO.MP3`, but the old lowercase patterns would let that file into git on a case-sensitive checkout. Verified with `git -c core.ignorecase=false check-ignore`.
- `test/integration/helpers/content-fixtures.ts` is written in full now: valid builders for every type and format, the fixture taxonomy (plus `fixtureTaxonomyWith` for tags F11's regex doesn't accept, like `phoneme:/θ/`), `makeWav` and the content-root writer. The Stage 1 unit tests already use it.
- The `content:schema` script has no `--env-file`, because it reads no environment.

**Validation:** typecheck (shared, design-tokens, api, web) ✅ · lint ✅ · unit 275/275 (19 new: content-item-schema 17, content-meta-schema-snapshot 2) ✅ · integration `seed.spec.ts` 5/5 (applies every migration including 0013) ✅ · `pnpm content:schema` run, 4 files written ✅ · openapi snapshot regenerated (+2 enum values) ✅
**Commit:** 7a9e992 "F13 stage 1 - contract and data model"

## Stage 2: The Importer — ✅ done

- [x] **4. Media Probe**
- [x] **5. Folder Scanner**
- [x] **6. Validation Chokepoint**
- [x] **7. Persistence Repository**
- [x] **8. Import Orchestration**
- [x] **9. Import CLI and Reporting**

**Observations:**
- **Sizes are decimal and switch to KB below 1 MB** (`formatSize`). The PRD's `4.2 MB uploaded` reads as decimal megabytes, and a short clip would otherwise print `0.0 MB`. `MAX_AUDIO_BYTES` is `100_000_000` rather than `100 * 1024 * 1024` for the same reason, so the rejection reads `over the 100.0 MB limit`.
- The probe runs the spec's exact ffmpeg invocation and keeps the last `out_time_us`. A sub-second clip rounds up to 1 s instead of 0, because `content_item_duration_ck` requires a positive duration and the spec sets no lower bound. ffmpeg's `[mp3 @ 0x…]` context prefix is stripped from the reason, so a curator reads `audio file could not be decoded: Failed to read frame size: …`. The probe also owns the file-name rule (`AUDIO_FILE_NAME_PATTERN`), since it is the step that looks at the media file.
- Validation formatting beyond the spec: an `unrecognized_keys` issue is split into one line per key at that key's own pointer (`/dificulty is not a recognized field`), and a Zod type or value issue on a field that is absent from the input reads `is required` instead of `Invalid input: expected string, received undefined`. Taxonomy membership is checked on the raw input, so an unknown tag is reported even when another field fails. Tags the schema already rejects for their shape (empty, over 64 characters) are left to the schema's own issue.
- A `meta.json` saved with a UTF-8 BOM (common with Windows editors) parses: the BOM is dropped before `JSON.parse`. The check compares char codes. A `﻿` literal in the source kept getting written back as the raw character, which fails ESLint's `no-irregular-whitespace`.
- Two small modules not in the spec: `content-schema-guard.ts` (`assertContentSchemaExists(prisma, command)`, shared by both CLIs and `runImport`, checks `to_regclass('public.content_item')`) and `ContentSlugConflictError` in the repository, which the importer turns into a `skipped` line and Stage 3's service will turn into `CONTENT002`.
- Repository writes are race-safe without locks: the owner check runs first, an existing row is updated by id, and a `P2002` on create re-resolves once against the row that won. The spec only requires detecting collisions before writing.
- The importer sorts items by type folder, then slug. A slug is globally unique, so report lines use the bare slug. Only items under an unknown type folder print as `type/slug`.
- `runImport` throws only when nothing can run (`ContentSchemaNotInitializedError`, `NothingToImportError`). Everything per item becomes a `skipped`/`failed` outcome, and an unexpected exception inside one item becomes `failed (unexpected error: …)`. `--dry-run` still calls `statObject` for unchanged media, because that is a read-only check. So an unreachable store fails the item in a dry run as well, with the same exit code.
- Errors are shown as their first meaningful line. For Prisma's `Invalid \`prisma.x()\` invocation:` preamble, the last line is used instead, since that is where the cause is. For `StorageUnavailableError`, the wrapped cause is used (`connect ECONNREFUSED 127.0.0.1:1`, the PRD's example shape).
- CLI output goes to stdout through `process.stdout.write` (the report is the product; ESLint only allows `console.warn`/`console.error`). Fatal errors go to `console.error`, and the exit code is set through `process.exitCode` so Prisma and the S3 client can close cleanly. Also accepted: `--` (from `pnpm x -- args`), an unknown flag (a usage error), and more than one filter (an error).
- The root `package.json` shortcut uses `docker compose exec -w /workspace/apps/api api pnpm content:import`, so appended arguments reach the script. The `sh -c 'cd apps/api && …'` form used in the README rows would swallow them. The README rows keep the `sh -c` form, matching the existing openapi row and avoiding Git Bash path mangling of `-w /workspace/...`.
- **Live run on an isolated stack.** Following the worktree gotchas memory, the stack is `docker compose -p eq-f13` with ports shifted (Postgres 5442, Redis 6389, MinIO 9010/9011, API 3011) and a local, gitignored `.env` with freshly generated secrets. Only `api` and its dependencies were started, nothing from the main checkout's `english-quest` project. Results: the CLI before migrations printed the guidance and exited 1. Usage errors exited 1. After the API boot applied `0013`: a VBR MP3 **without a Xing header** (7.4 s source) measured 7 s, an AAC M4A (6.2 s) 6 s, and an `AUDIO.WAV` 3 s. The upload reached `minio:9000`, proving the container's `S3_ENDPOINT` overrides `.env`'s `localhost:9010`. The objects are in MinIO under `content/listening/<slug>/`. The re-run reported `media unchanged`, the invalid answer key printed the PRD's exact line, and exit codes, dry run, single-item filter and `Nothing to import at assignment-content/grammar.` all behaved as specified. The MP3/M4A were encoded by the container's ffmpeg from a synthetic tone, not sourced by a curator. See Stage 3.
- `.gitignore` confirmed live: `git check-ignore` lists the MP3, M4A and uppercase `AUDIO.WAV` in `assignment-content/`. The `zz-live-*` item folders used for the live run are local only and are not committed.

**Validation:** typecheck ✅ · lint ✅ · unit 303/303 (28 new: media-probe 7, folder-scanner 7, item-validation 9, import-report 5) ✅ · integration `content-import.spec.ts` 19/19 (real PostgreSQL + MinIO; the spec's 18 plus `reports_nothing_to_import_for_a_filter_that_matches_no_folder`) ✅ · live CLI on the `eq-f13` stack ✅
**Commit:** 846a335 "F13 stage 2 - the importer"

## Stage 3: Query API, Statistics and Verification — ✅ done

- [x] **10. Content Bank Service and Module**
- [x] **11. Usage Statistics CLI**
- [x] **12. Live Verification on the Real Stack** (with synthetic-tone MP3/M4A, not curator-sourced files; see below)

**Observations:**
- The validation chokepoint now returns structured issues (`ContentIssue { path, message }`, plus `formatIssue` for report lines) instead of plain strings. `ValidationDetail` is `{ path, message }`, so `saveGenerated`'s `VAL001` carries the issues as its details directly, with JSON-pointer paths (`/questions/1/answer`), as the spec's "pointer details" asks. Splitting a string on its first space would have broken on unknown keys that contain spaces. The Stage 2 importer and its tests were adjusted in this commit.
- `ContentBankService` behaviour the spec leaves open:
  - `findCandidates` validates its own query with a local Zod schema (`userId` a UUID, `limit` 1–500, window ≥ 0 integer) and raises `VAL001` on misuse. An **empty filter list is treated like an omitted one**: Prisma's `in: []`/`hasSome: []` would otherwise silently return nothing.
  - `getPayload` and `existingIds` treat a non-UUID id as absent (`CONTENT001` / not in the set) instead of letting Prisma throw a UUID parse error.
  - `recordServed` de-duplicates ids, so an item appearing twice in one plan gets one serving row.
- `CONTENT002`'s details carry `{ slug, existingType, existingProvenance }`, so F14 can tell "curated owns it" from "another generated type owns it".
- `ContentModule` is `@Global()` and imports `TaxonomyModule`. Nest de-duplicates the module, so `ErrorTaxonomyService` stays a singleton. The injectability test compiles a module graph of `PrismaModule + ContentModule + ConsumerModule`, where the consumer never imports `ContentModule`. Compilation only succeeds because the module is global.
- `content-stats.ts`: inventory through Prisma `groupBy`/`aggregate`, per-item usage through one SQL aggregate (`COUNT(DISTINCT user_id)`, `MAX(served_at)`), never-served items through `servings: { none: {} }`, and taxonomy drift through `NOT (target_tags <@ $inForce::text[])` with the offending tags worked out in code. Output is plain aligned text. The corpus target prints three ✓/✗ lines. The drift section appears only when there is drift.
- **Live verification on the isolated `eq-f13` stack (step 12).** In the spec's order:
  1. **Import:** real MinIO objects under `content/listening/<slug>/` and matching rows, with only key, checksum and bytes stored (see Stage 2).
  2. **Re-run, edit, replace:** the re-run printed `media unchanged` for all three. A title edit updated the row in place. Replacing the MP3 printed `↻ zz-live-mp3-vbr (updated, 39.9 KB re-uploaded)`, stored a new checksum and measured 10 s (9.6 s source).
  3. **MinIO stopped** (`docker compose -p eq-f13 stop minio`): the new listening item printed `✗ zz-live-new (upload failed: getaddrinfo ENOTFOUND minio)` and wrote **no row**. The existing listening items printed `storage unavailable: …` with their rows untouched. A new reading item in the same batch still imported. Exit 1, with all four counts. After `start minio`, the re-run imported `zz-live-new`.
  4. **Dry run and filter:** the dry run printed `would update` lines, the orphan warning for a removed folder, and the banner, with exit 0. `listening/zz-live-new` ran only that item.
  5. **`content:stats`:** after `db:seed` and three SQL-inserted servings, the report showed the inventory, the corpus target (✗ 4 listening items, ✓ 3 accents, ✓ difficulties 3–5), usage (served count, distinct users, `3 days ago` / `just now`) and the never-served list.
  - The API dev server in the same stack rebooted on the code change with `ContentModule dependencies initialized` and `Nest application successfully started`, which proves the global module wires into the real app.
- **Soft-fail: no curator-sourced MP3/M4A was available.** The plan asks for real files from the curator. The live MP3 (libmp3lame VBR, written with `-write_xing 0` to hit the no-Xing-header case the spec cites) and M4A (AAC) were encoded by the container's own ffmpeg from a synthetic tone. They are real codec streams that ffmpeg-static decoded and measured correctly (7.4→7 s, 6.2→6 s, 9.6→10 s), but they don't replace a pass over real-world files with odd frames or metadata. Follow-up: import a few curator files on the main stack.
- The live items (`assignment-content/*/zz-live-*`) were local only and are deleted after the run. Nothing about them is committed.

**Validation:** typecheck ✅ · lint ✅ · unit 303/303 ✅ · integration `content-import` 19/19, `content-bank.service` 16/16, `content-stats` 4/4 ✅ · live sequence on `eq-f13` ✅ (synthetic audio, see soft-fail)
**Commit:** _(recorded in the final verification)_
