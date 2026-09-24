-- F07 Lesson Recording: per-track egress segments, the assembled
-- per-participant audio object, and one pipeline branch per participant.
-- Every column added to an existing table is defaulted or nullable, so
-- lessons written by F05 and F06 stay valid (they read as never recorded).

ALTER TABLE lessons
    ADD COLUMN recording_status           VARCHAR(24) NOT NULL DEFAULT 'idle',
    ADD COLUMN recording_started_at       TIMESTAMPTZ,
    ADD COLUMN recording_finalizing_since TIMESTAMPTZ,
    ADD COLUMN storage_unavailable_since  TIMESTAMPTZ,
    ADD COLUMN recording_finalized_at     TIMESTAMPTZ,
    ADD COLUMN recording_lease_until      TIMESTAMPTZ,
    ADD CONSTRAINT ck_lessons_recording_status CHECK (recording_status IN
        ('idle','starting','recording','not_recording','finalizing','recorded',
         'recording_partial','recording_failed','too_short','storage_unavailable'));

CREATE INDEX ix_lessons_recording_pending ON lessons (recording_status)
    WHERE recording_status IN ('starting','recording','not_recording','finalizing');

ALTER TABLE lesson_participants
    ADD COLUMN recording_status     VARCHAR(24)  NOT NULL DEFAULT 'not_started',
    ADD COLUMN audio_object_key     VARCHAR(255),
    ADD COLUMN audio_bytes          BIGINT,
    ADD COLUMN recording_started_at TIMESTAMPTZ,
    ADD COLUMN audio_duration_ms    INTEGER,
    ADD COLUMN captured_ms          INTEGER,
    ADD CONSTRAINT ck_lesson_participants_recording_status CHECK (recording_status IN
        ('not_started','recording','stopped','failed_to_start','complete','partial','missing')),
    ADD CONSTRAINT ck_lesson_participants_audio CHECK (
        (audio_object_key IS NULL) = (audio_bytes IS NULL)
        AND (audio_bytes IS NULL OR audio_bytes > 10240));

CREATE TABLE lesson_recording_segments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id       UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    user_id         UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    track_sid       VARCHAR(64)  NOT NULL,
    egress_id       VARCHAR(64),
    object_key      VARCHAR(255) NOT NULL,
    status          VARCHAR(16)  NOT NULL DEFAULT 'requested',
    attempt         SMALLINT     NOT NULL DEFAULT 1,
    unexpected      BOOLEAN      NOT NULL DEFAULT FALSE,
    error           VARCHAR(500),
    file_started_at TIMESTAMPTZ,
    file_ended_at   TIMESTAMPTZ,
    duration_ms     INTEGER,
    size_bytes      BIGINT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_segments_status
        CHECK (status IN ('requested','starting','active','ending','complete','failed'))
);

CREATE UNIQUE INDEX ux_segments_egress ON lesson_recording_segments (egress_id);
CREATE UNIQUE INDEX ux_segments_open_track ON lesson_recording_segments (track_sid)
    WHERE status IN ('requested','starting','active','ending');
CREATE INDEX ix_segments_lesson_user_started
    ON lesson_recording_segments (lesson_id, user_id, file_started_at);

CREATE TABLE lesson_pipeline_branches (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id             UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    user_id               UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    stage                 VARCHAR(24)  NOT NULL DEFAULT 'recording',
    status                VARCHAR(24)  NOT NULL DEFAULT 'verifying',
    failure_code          VARCHAR(40),
    failure_reason        VARCHAR(200),
    attempts              SMALLINT     NOT NULL DEFAULT 1,
    launched_at           TIMESTAMPTZ,
    fallback_requested_at TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_branches_stage  CHECK (stage IN ('recording','transcription')),
    CONSTRAINT ck_branches_status CHECK (status IN ('verifying','queued','failed','storage_unavailable')),
    CONSTRAINT ck_branches_failure CHECK ((status = 'failed') = (failure_code IS NOT NULL)),
    CONSTRAINT ck_branches_failure_code CHECK (failure_code IS NULL OR failure_code IN
        ('recording_failed_to_start','recording_missing','recording_too_short','recording_assembly_failed'))
);

CREATE UNIQUE INDEX ux_branches_lesson_user ON lesson_pipeline_branches (lesson_id, user_id);
CREATE INDEX ix_branches_stage_status ON lesson_pipeline_branches (stage, status);
CREATE INDEX ix_branches_user_created ON lesson_pipeline_branches (user_id, created_at DESC);
