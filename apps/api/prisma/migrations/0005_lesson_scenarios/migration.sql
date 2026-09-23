-- CreateTable
-- One row per lesson, created as `pending` the moment the lesson opens and
-- before any model call, so every outcome (including no scenario at all) is
-- a recorded status rather than an absent row.
CREATE TABLE "lesson_scenarios" (
    "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "lesson_id"         UUID NOT NULL REFERENCES "lessons"("id") ON DELETE CASCADE,
    "status"            VARCHAR(16) NOT NULL DEFAULT 'pending',
    "setting"           TEXT,
    "premise"           TEXT,
    "vocabulary_domain" VARCHAR(48),
    "roles"             JSONB,
    "discussion_hooks"  JSONB,
    "reroll_count"      SMALLINT NOT NULL DEFAULT 0,
    "generated_by"      UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "prompt_id"         VARCHAR(64),
    "prompt_version"    VARCHAR(16),
    "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "ck_lesson_scenarios_status"
        CHECK ("status" IN ('pending','ready','failed','no_scenario')),
    CONSTRAINT "ck_lesson_scenarios_rerolls"
        CHECK ("reroll_count" BETWEEN 0 AND 3),
    CONSTRAINT "ck_lesson_scenarios_ready"
        CHECK ("status" <> 'ready' OR ("setting" IS NOT NULL AND "premise" IS NOT NULL
               AND "vocabulary_domain" IS NOT NULL AND "roles" IS NOT NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "ux_lesson_scenarios_lesson" ON "lesson_scenarios" ("lesson_id");

-- CreateIndex
-- Domain rotation's lookback and F20's coverage counts both read through this.
CREATE INDEX "ix_lesson_scenarios_domain" ON "lesson_scenarios" ("vocabulary_domain");

-- CreateTable
-- `constraint_text` rather than `constraint`: CONSTRAINT is reserved in
-- PostgreSQL. The API and client contracts keep the PRD's name.
CREATE TABLE "lesson_role_cards" (
    "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "lesson_id"          UUID NOT NULL REFERENCES "lessons"("id") ON DELETE CASCADE,
    "user_id"            UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "role_label"         VARCHAR(120),
    "status"             VARCHAR(16) NOT NULL DEFAULT 'pending',
    "background"         TEXT,
    "objective"          TEXT,
    "constraint_text"    TEXT,
    "register"           VARCHAR(16),
    "target_expressions" JSONB,
    "prompt_id"          VARCHAR(64),
    "prompt_version"     VARCHAR(16),
    "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "ck_lesson_role_cards_status"
        CHECK ("status" IN ('pending','ready','failed')),
    CONSTRAINT "ck_lesson_role_cards_register"
        CHECK ("register" IS NULL OR "register" IN ('formal','neutral','informal')),
    CONSTRAINT "ck_lesson_role_cards_ready"
        CHECK ("status" <> 'ready' OR ("background" IS NOT NULL AND "objective" IS NOT NULL
               AND "constraint_text" IS NOT NULL AND "register" IS NOT NULL
               AND "target_expressions" IS NOT NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "ux_lesson_role_cards_lesson_user"
    ON "lesson_role_cards" ("lesson_id", "user_id");
