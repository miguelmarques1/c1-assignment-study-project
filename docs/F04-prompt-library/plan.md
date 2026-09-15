# Implementation Plan: Prompt Library

**Prerequisites:**
- F01 implemented: running stack, Prisma, the shared error envelope
- F02 implemented: `CredentialExecutorService.withKey`, `@google/genai` already a dependency
- New dependencies: `yaml`, `ajv`
- A real Gemini key stored in the BYOK vault — needed from the **first** stage, not only at the end, because the schema-dialect spike calls the live API
- Remember the container has its own `node_modules` volume: new dependencies need `docker compose exec api pnpm install` as well as a host install

---

### Stage 1: Format and Feasibility

**1. Schema Dialect Spike** - Before any prompt file is authored, prove the round trip the whole feature rests on: one hand-built schema sent to the live Gemini API in the dialect the specification chose, a parseable structured response coming back, and that same schema object compiling under the validator's strict mode. If the dialect turns out to behave differently than documented, this is the cheapest possible moment to discover it.

**2. Envelope Definition and Types** - Define the validator schema describing a valid prompt file's shape and the corresponding types, so every later step reads and validates prompts against one authoritative definition of the format.

**3. The Nine MVP Prompt Files** - Author the nine PRD-listed prompt files, each with its system prompt, user template, declared variables, constraints, few-shot examples, and an output schema taken from the consuming feature's own acceptance criteria rather than invented here. The specification's component table names the source for each.

---

### Stage 2: Boot-Time Loading and Validation

**4. Single-File Loader** - Implement the function that parses one prompt file and runs every structural check the specification lists — envelope shape, filename matching its declared id, output schema validity, the two-way agreement between declared variables and template placeholders, and each example's conformance to the file's own output schema — collecting issues rather than throwing, so the registry can aggregate across files.

**5. Registry and Boot Wiring** - Implement the injectable registry that loads every prompt file, aggregates every issue across every file into a single failure when any exist, logs one line per successfully loaded prompt, and exposes lookup by id with a distinct error for being queried before loading has run. Wire it into the bootstrap sequence so any problem stops the process before it starts listening.

---

### Stage 3: Rendering and Execution

**6. Template Rendering** - Implement variable substitution with the required-and-non-empty check at render time, the rendering of constraints into the instruction text, the few-shot examples block, and the correction-retry variant that appends validation errors to the already-rendered content. Banned phrases stay out of the outgoing request by design.

**7. Response Validation** - Implement schema-based validation of a model response against a prompt's declared output schema, with cached compiled validators and error messages that name every violated field rather than only the first.

**8. Execution Service** - Implement the orchestration that renders the request, calls the model through the existing credential executor contract under the specification's time budget, retries once on schema failure, and classifies every outcome across the categories the specification defines — including the two that are deliberately never retried. Returns the validated output together with the prompt id and version for the caller to stamp on its own artifact.

**9. Execution Telemetry** - Add the telemetry table and its migration, and the non-blocking writer that records one row per execution with token counts totalled across attempts, storing the raw response only on the hard-failure path and only up to the specification's cap.

---

### Stage 4: Integration and Verification

**10. Error Registry Additions** - Add the prompt-related error codes to the shared registry, following the existing pattern of code, status and pinned message.

**11. Module Registration** - Register the prompt module globally and confirm the registry and execution service are reachable by dependency injection from anywhere in the app, matching the credentials module's precedent.

**12. Full Prompt Verification** - Exercise all nine prompts once against the real Gemini API on the running stack, confirming each one's structured output actually satisfies its declared schema. The Stage 1 spike proved the mechanism; this proves the content. Record the result — the feature is not complete on mocked runs alone.
