# Implementation Plan: Content Bank and Curated Import

**Prerequisites:**
- F01 implemented: running stack, Prisma migrations at boot, the storage adapter, the shared error envelope and the `db:seed` CLI pattern
- F07 implemented: `StorageService.uploadFile`, `statObject`, `StorageUnavailableError` and the MinIO test harness
- F10 implemented: `ffmpeg-static` is already an API dependency
- F11 implemented: the error taxonomy file and its loader and service. If F12 lands first, its taxonomy v2 and its `0012_learning_profile` migration are in place too
- The migration takes the next free number at implementation time (`0013` if F12 has landed)
- `@english-quest/shared` is consumed from its build output, so rebuild it after changing its schemas or error codes
- Docker available to Testcontainers (PostgreSQL, Redis and MinIO)
- At least one real MP3 and one real M4A listening file from the curator, for live verification only. The automated suites generate their own audio
- No new dependencies and no new environment variables

---

### Stage 1: Contract and Data Model

**1. Shared Content Contract** - Define the content contract in the shared package: the enumerations, the four-format question union with its answer-key rules, the per-type curated `meta.json` schema, the generated-item input schema, and the candidate and payload types. Register the two new content error codes with their pinned messages. The specification lists every rule and the exact error wording the PRD pins.

**2. Data Model and Migration** - Add the content item table and the serving log with the migration the specification gives, including every consistency constraint, the indexes and the update trigger. Mirror both tables in the Prisma schema, with the new relation on users.

**3. Curator Schema Files and Guide** - Add the command that generates one editor-facing schema file per importable type from the shared contract and the taxonomy in force, and commit the generated files under the curator's content folder. Write the curator guide covering the folder layout, the fields per type, the four question formats, the tag vocabulary and the commands.

---

### Stage 2: The Importer

**4. Media Probe** - Implement the inspection of a listening audio file: size and emptiness checks, the checksum, the full decode and measured duration through the bundled ffmpeg binary, and the content type mapping. Each problem becomes a skip reason, never an exception.

**5. Folder Scanner** - Implement discovery of item folders under the content root: derive type and slug from the path, apply the optional type or item filter, and classify each folder's files. Unknown type folders and invalid folder names are reported per item rather than silently ignored.

**6. Validation Chokepoint** - Implement the single validation entry point that both the importer and generated-item persistence go through. It runs the shared schemas, checks every target tag against the loaded taxonomy, and reports every issue as a JSON pointer with its message.

**7. Persistence Repository** - Implement the plain persistence class usable from both the CLI and the Nest service. It covers lookup by slug, collision detection against another type or provenance, upsert of curated and generated items, derived word counts, and the list of curated slugs used for the orphan report.

**8. Import Orchestration** - Implement the per-item pipeline in the order the specification fixes: validate, probe, check collisions, upload only when needed (including restoring an object missing from storage), write the row, then clean up a replaced object. Add dry-run behaviour and the report of bank items whose folder is gone. A problem with one item never stops the batch, and a storage failure never leaves a row behind.

**9. Import CLI and Reporting** - Build the standalone import command: argument parsing, the guard for an uninitialized schema, taxonomy loading, the per-item output lines in the PRD's shape, the four-count summary, the dry-run banner and the exit code. Register the package scripts, the root shortcuts and the README command rows.

---

### Stage 3: Query API, Statistics and Verification

**10. Content Bank Service and Module** - Implement the globally injectable service F14, F15 and F16 call. It provides candidate metadata with filters and the 30-day recently-served exclusion, full payloads, the existence check, generated-item persistence keyed by slug through the same validation chokepoint, and serving records that can join a caller's transaction. Register the module in the application.

**11. Usage Statistics CLI** - Build the read-only statistics command. It reports bank inventory by type, provenance, level, difficulty and accent; stored media volume; the PRD's listening corpus target with a pass or fail per condition; per-item usage including the never-served list; and items whose tags left the taxonomy.

**12. Live Verification on the Real Stack** - With the Docker stack running and real MP3 and M4A files, run the verification sequence at the end of the specification's testing section: import, re-run, metadata edit, audio replacement, MinIO stopped mid-batch, a dry run, a filtered run and the statistics report. Confirm the objects and rows directly, and confirm the OpenAPI snapshot is unchanged. Record the results. The feature is not complete on container-generated audio alone.
