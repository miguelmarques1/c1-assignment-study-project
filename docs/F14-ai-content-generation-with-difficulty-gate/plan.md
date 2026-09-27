# Implementation Plan: AI Content Generation with Difficulty Gate

**Prerequisites:**
- F02 implemented: the credential vault, `CredentialExecutorService.withKey` and the masked credential list
- F04 implemented: the prompt registry, `PromptExecutionService.execute` with its schema retry and telemetry, and the boot-time prompt loading. This feature extends `execute` with an optional argument
- F12 implemented (Core): `ErrorLedgerReader`, `LearningProfileReader` and error taxonomy v2 with the `analysis` flag per family
- F13 implemented: `ContentBankService` (`saveGenerated`, `findCandidates`, `existingIds`), `validateGeneratedInput` and the content test fixtures
- F06's vocabulary domain list, from the shared package
- The migration takes the next free number at implementation time (`0014` on today's `main`)
- New dependencies: `wink-lemmatizer` (runtime) and `@msgpack/msgpack` (dev only). Install them on the host and in the API container. No new environment variables
- Network access once, to fetch wordfreq's English data from a pinned commit when building the frequency list
- Docker available to Testcontainers
- A seeded user with a real Gemini key and a ledger holding grammar, vocabulary and quoted tags, for live verification only. The automated suites fake Gemini

---

### Stage 1: Reference Data and Rules

**1. Frequency List Builder and Reference File** - Build the command that turns wordfreq's English data into the top-5,000 lemma list, run it against the pinned source, and commit the generated file with its attribution header. Add the provenance and licence note beside it. The specification fixes the format, the filtering and how word forms become lemmas.

**2. Text Measurement** - Implement the lemmatiser wrapper and the pure measurement module the gate relies on: word and sentence segmentation, mean sentence length, type-token ratio, the out-of-frequency ratio and the frequency bands, and the normalisation used for every verbatim comparison. Follow the tokenisation rules the specification lists, including the exclusions for numbers, acronyms and names.

**3. Frequency List Loading and Boot Refusal** - Load and validate the frequency list when the API starts. A missing or unreadable file stops the boot with the PRD's exact message, and a malformed one stops it with every issue listed. Log the list's size and version at boot.

**4. Generation Rules File** - Add the versioned rules file with the per-type thresholds, the batch mix, the ten genres, the shared banned phrases, the lexicons and the structure markers. Load it at boot, following the excerpt rules pattern, with its invariants, its coupling to the taxonomy in force and a pinned fingerprint per version.

---

### Stage 2: The Difficulty Gate

**5. Target Structure Verification** - Implement the hybrid occurrence check: locate each model-listed quote in the text, count distinct non-overlapping occurrences, require the tag's marker where one exists, and require the occurrences to spread across the text. Report why each rejected quote was rejected.

**6. Gate Checks and Metrics** - Implement the gate as one pure evaluation that runs every check in the specification and reports all failures together with the full metrics record. It covers the length and lexical measures, target structures, banned phrases, the question rules through the content bank's own validation, answer evidence, item shape and the learner-quote privacy check.

**7. Correction Notes** - Render failed checks as the regeneration appendix, each with its measured and required values, and without any item text or learner data.

**8. Output Mapping** - Convert the model's flat output into the content bank's generated-item input: the question union, slot-derived target tags, skills, level, difficulty, slug and prompt stamp. Keep evidence and occurrences for the gate and out of the stored questions. Shape problems become gate issues rather than exceptions.

---

### Stage 3: Prompts and the Prompt Library Extension

**9. Prompt Library Options** - Extend prompt execution with the optional appendix and example selection. Existing callers must get byte-identical rendering, and the schema retry must keep the appendix. Record the change as a dated follow-up in the prompt library's progress file.

**10. Generation Prompts, Version 2** - Rewrite the four generation prompts to the specification's variables, response schema, constraints and question formats. Each carries three short, openly licensed style exemplars with attribution, and the error-review prompt forbids reusing the learner's sentences. Add the one-line note to the prompt authoring rule.

**11. Boot Verification of Generation Prompts** - Add the boot check that refuses to start when a generation prompt's variables, question formats, required fields or exemplar count drift from what the generator renders and reads, and wire it into the boot sequence after the analysis prompt check.

---

### Stage 4: Generation Runs

**12. Data Model and Migration** - Add the run, slot and attempt tables with the migration the specification gives, including every constraint and the partial index, and mirror them in the Prisma schema with the new relations on users and content items.

**13. Batch Planning** - Implement tag ranking from the ledger readers and the deterministic slot planner with the fixed mix, family compatibility, the per-tag cap and the error-review source rule. Add the genre draw with the five-reading window, the topic-domain variation seed and the exemplar rotation. Planning must also work as a read-only preview.

**14. Slot Generation** - Implement the per-slot loop: build the prompt input, call the prompt library on the owner's key with the slot's exemplar and any correction appendix, map, gate, and persist a passing item through the content bank. Record every attempt, classify errors into attempt-ending and run-ending, log discarded items with prompt version and metrics, and resolve curated fallbacks or dropped slots.

**15. Generation Service and Module** - Implement the public generation service: request validation, the idempotent run per user and run key, the upfront Gemini status check, atomic slot claiming with a lease so a retried or crashed run resumes without a third attempt, two slots in flight, progress callbacks, abandonment on quota or credential failure, notes and the final result. Register the module in the application.

---

### Stage 5: Curator Surfaces and Verification

**16. Generation CLI** - Build the `content:generate` command on a minimal application context: user lookup by email, the dry-run preview, an optional run key, per-slot output lines and the summary. Register the package script, the root shortcut and the README rows, and note that it runs from compiled output.

**17. Generation Statistics** - Add the Generation section to `content:stats`: pass rates per prompt version (including the PRD's within-one-regeneration objective), the checks that fail most, mean metrics of passing items, and runs by abandon reason.

**18. Live Verification on the Real Stack** - With an isolated stack and a real Gemini key, run the verification sequence at the end of the specification's testing section: dry run, a small real run, a repeat with the same run key, a full batch with its pass rates recorded, the missing-key run and the boot refusal without the frequency list. Tune prompts from what the real model produces, bumping their version, and confirm the OpenAPI snapshot is unchanged. Record everything in the progress file.
