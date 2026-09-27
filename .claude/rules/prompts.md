---
paths:
  - "apps/api/prompts/**"
---

# Prompt YAML (`apps/api/prompts/*.yaml`)

The prompt library (F04) loads and validates every file when the API boots. A malformed prompt stops the boot, so a mistake here is loud, not silent.

- The file name equals `id`. `version` is a quoted string (`"2"`). Unknown top-level fields are rejected.
- Every `{{variable}}` in `user_template` is declared under `variables`, and every declared variable is used.
- `response_schema` is standard JSON Schema with lowercase types (`"string"`, `"object"`). The same object goes to Gemini and to Ajv, with no translation layer.
- Every `examples[].output` must validate against `response_schema`. Examples teach register and shape, not content to copy.
- `constraints` hold the product's hard limits for that prompt (no dialogue, no stated outcome, no profile data where the PRD forbids it). Keep them when you edit.
- **Bump `version` on any change that can alter output** (system, template, schema, examples, constraints, model parameters). Every generated artifact stores the id and version, and that is only useful if a version always means one exact file content.
- Difficulty is expressed as verifiable constraints (length ranges, required structures, banned phrases), never as "write at C1 level". See "Prompts e controle de dificuldade" in `docs/context.md`.
- The four `*-generate` prompts (F14) take their difficulty numbers as variables rendered from `apps/api/rules/content-generation.yaml`, so change a threshold there, not in the YAML text. A boot check (`src/boot/verify-generation-prompts.ts`) pins their variables, their question formats, the fields the difficulty gate reads back, and the 2–3 style exemplars. `test/unit/generation-prompts.spec.ts` checks that every exemplar's evidence and occurrences are verbatim.
- Keep a prompt free of other participants' private data. The BYOK and privacy rules in the root `AGENTS.md` apply to what goes into a prompt as much as to what comes out.
- After editing, restart the API (prompts are read only at boot) and run `pnpm --filter @english-quest/api test test/unit/prompt-file-loader.spec.ts`.
