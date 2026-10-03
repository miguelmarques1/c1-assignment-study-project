-- F18 Speaking and Pronunciation Activities: a speaking plan activity gets one
-- task (a read-aloud passage or an open-response prompt, chosen once from the
-- versioned corpus and kept for the whole carry-over lineage), and every
-- recording its owner uploads becomes an attempt: its audio in MinIO, its
-- scores and its word and phoneme detail. At most three attempts are scored
-- per task and only one is scored at a time; the database enforces both.
CREATE TABLE speaking_tasks (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    root_activity_id   UUID         NOT NULL REFERENCES study_plan_activities(id) ON DELETE CASCADE,
    shape              VARCHAR(16)  NOT NULL,
    corpus_entry_id    VARCHAR(64)  NOT NULL,
    corpus_version     VARCHAR(16)  NOT NULL,
    corpus_fingerprint CHAR(64)     NOT NULL,
    reference_text     TEXT,
    prompt_text        TEXT,
    hint               VARCHAR(200),
    target_tags        TEXT[]       NOT NULL DEFAULT '{}',
    focus_tags         TEXT[]       NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_speaking_tasks_shape CHECK (shape IN ('read_aloud','open_response')),
    CONSTRAINT ck_speaking_tasks_text CHECK ((shape = 'read_aloud') = (reference_text IS NOT NULL)
        AND (shape = 'open_response') = (prompt_text IS NOT NULL)),
    CONSTRAINT ck_speaking_tasks_hint CHECK (hint IS NULL OR shape = 'open_response'),
    CONSTRAINT ck_speaking_tasks_tags CHECK (cardinality(target_tags) <= 5 AND cardinality(focus_tags) <= 3)
);
CREATE UNIQUE INDEX ux_speaking_tasks_root_activity ON speaking_tasks (root_activity_id);
CREATE INDEX ix_speaking_tasks_user_entry ON speaking_tasks (user_id, corpus_entry_id, created_at DESC);

CREATE TABLE speaking_attempts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id               UUID         NOT NULL REFERENCES speaking_tasks(id) ON DELETE CASCADE,
    user_id               UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id           UUID         NOT NULL REFERENCES study_plan_activities(id) ON DELETE CASCADE,
    client_attempt_id     UUID         NOT NULL,
    state                 VARCHAR(16)  NOT NULL,
    ordinal               SMALLINT,
    audio_object_key      VARCHAR(255),
    audio_bytes           INTEGER      NOT NULL,
    duration_ms           INTEGER      NOT NULL,
    scoring_started_at    TIMESTAMPTZ,
    scored_at             TIMESTAMPTZ,
    failure_code          VARCHAR(32),
    failure_reason        VARCHAR(200),
    rescore_count         SMALLINT     NOT NULL DEFAULT 0,
    pronunciation         REAL,
    accuracy              REAL,
    fluency               REAL,
    prosody               REAL,
    completeness          REAL,
    recognized_word_count SMALLINT,
    transcript_text       TEXT,
    words                 JSONB,
    failing_phonemes      JSONB,
    segments              JSONB,
    locale                VARCHAR(16),
    latency_ms            INTEGER,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_speaking_attempts_state CHECK (state IN ('scoring','scored','discarded','failed')),
    CONSTRAINT ck_speaking_attempts_duration CHECK (duration_ms BETWEEN 1 AND 121000 AND audio_bytes > 44),
    CONSTRAINT ck_speaking_attempts_audio CHECK ((state = 'discarded') = (audio_object_key IS NULL)),
    CONSTRAINT ck_speaking_attempts_scoring CHECK (state <> 'scoring' OR scoring_started_at IS NOT NULL),
    CONSTRAINT ck_speaking_attempts_scored CHECK (
        (state = 'scored') = (scored_at IS NOT NULL)
        AND (state = 'scored') = (ordinal IS NOT NULL)
        AND (state <> 'scored' OR (pronunciation IS NOT NULL AND accuracy IS NOT NULL AND fluency IS NOT NULL
            AND completeness IS NOT NULL AND words IS NOT NULL AND failing_phonemes IS NOT NULL
            AND recognized_word_count IS NOT NULL))),
    CONSTRAINT ck_speaking_attempts_ordinal CHECK (ordinal IS NULL OR ordinal BETWEEN 1 AND 3),
    CONSTRAINT ck_speaking_attempts_failure CHECK (
        (state IN ('failed','discarded')) = (failure_code IS NOT NULL AND failure_reason IS NOT NULL)),
    CONSTRAINT ck_speaking_attempts_scores CHECK (
        (pronunciation IS NULL OR pronunciation BETWEEN 0 AND 100)
        AND (accuracy IS NULL OR accuracy BETWEEN 0 AND 100)
        AND (fluency IS NULL OR fluency BETWEEN 0 AND 100)
        AND (prosody IS NULL OR prosody BETWEEN 0 AND 100)
        AND (completeness IS NULL OR completeness BETWEEN 0 AND 100))
);
CREATE UNIQUE INDEX ux_speaking_attempts_client ON speaking_attempts (user_id, client_attempt_id);
CREATE UNIQUE INDEX ux_speaking_attempts_task_ordinal ON speaking_attempts (task_id, ordinal)
    WHERE ordinal IS NOT NULL;
CREATE UNIQUE INDEX ux_speaking_attempts_one_scoring ON speaking_attempts (task_id)
    WHERE state = 'scoring';
CREATE INDEX ix_speaking_attempts_task_created ON speaking_attempts (task_id, created_at);
