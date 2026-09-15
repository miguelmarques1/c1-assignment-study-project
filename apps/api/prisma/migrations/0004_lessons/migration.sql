-- CreateTable
CREATE TABLE "lessons" (
    "id"                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "room"                   VARCHAR(64) NOT NULL,
    "status"                 VARCHAR(24) NOT NULL DEFAULT 'waiting',
    "opened_by"              UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "opened_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "started_at"             TIMESTAMPTZ(6),
    "ended_at"               TIMESTAMPTZ(6),
    "duration_seconds"       INTEGER,
    "end_reason"             VARCHAR(32),
    "ended_by"               UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "all_disconnected_since" TIMESTAMPTZ(6),
    "max_participants"       SMALLINT NOT NULL,
    "created_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "ck_lessons_status"
        CHECK ("status" IN ('waiting','live','ended','ended_unexpectedly','abandoned')),
    CONSTRAINT "ck_lessons_end_reason"
        CHECK ("end_reason" IS NULL OR "end_reason" IN
               ('ended_by_participant','all_disconnected','max_duration','abandoned_before_start')),
    CONSTRAINT "ck_lessons_terminal"
        CHECK (("status" IN ('ended','ended_unexpectedly','abandoned')) = ("ended_at" IS NOT NULL))
);

-- CreateIndex
-- Partial unique index: at most one lesson open per room. Enforced here in
-- the database rather than in service code, because a service-level
-- read-then-check-then-write has a race window and two participants opening
-- the classroom at the same instant is the expected usage, not an edge case.
-- Deliberately NOT representable as a Prisma `@@unique` — see schema.prisma.
CREATE UNIQUE INDEX "ux_lessons_open_room"
    ON "lessons" ("room")
    WHERE "status" IN ('waiting', 'live');

-- CreateIndex
CREATE INDEX "ix_lessons_status_opened" ON "lessons" ("status", "opened_at" DESC);

-- CreateTable
CREATE TABLE "lesson_participants" (
    "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "lesson_id"             UUID NOT NULL REFERENCES "lessons"("id") ON DELETE CASCADE,
    "user_id"               UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "identity"              VARCHAR(64) NOT NULL,
    "joined_at"             TIMESTAMPTZ(6) NOT NULL,
    "left_at"               TIMESTAMPTZ(6),
    "last_connected_at"     TIMESTAMPTZ(6),
    "last_disconnected_at"  TIMESTAMPTZ(6),
    "connected"             BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

-- CreateIndex
CREATE UNIQUE INDEX "ux_lesson_participants_lesson_user"
    ON "lesson_participants" ("lesson_id", "user_id");

-- CreateIndex
CREATE INDEX "ix_lesson_participants_user_joined"
    ON "lesson_participants" ("user_id", "joined_at" DESC);
