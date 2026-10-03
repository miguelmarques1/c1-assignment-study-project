-- F17 Writing Activity with AI Correction: the task composed when a plan's
-- writing activity is first opened; its one server-side draft, versioned so a
-- stale save from another device is detected instead of overwriting it; and
-- every correction request the owner made. The daily limit counts those
-- requests, and the curator reads their prompt stamp and, for invalid output,
-- the raw response.
CREATE TABLE writing_tasks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id       UUID         NOT NULL REFERENCES study_plan_activities(id) ON DELETE CASCADE,
    heading           VARCHAR(80)  NOT NULL,
    statement         TEXT         NOT NULL,
    statement_words   SMALLINT     NOT NULL,
    target_tags       TEXT[]       NOT NULL DEFAULT '{}',
    scenario_id       VARCHAR(48)  NOT NULL,
    rules_version     VARCHAR(32)  NOT NULL,
    rules_fingerprint CHAR(64)     NOT NULL,
    taxonomy_version  VARCHAR(16)  NOT NULL,
    status            VARCHAR(24)  NOT NULL DEFAULT 'draft',
    draft_text        TEXT         NOT NULL DEFAULT '',
    draft_revision    INTEGER      NOT NULL DEFAULT 0,
    draft_saved_at    TIMESTAMPTZ,
    active_seconds    INTEGER      NOT NULL DEFAULT 0,
    submitted_at      TIMESTAMPTZ,
    corrected_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_writing_tasks_status CHECK (status IN
        ('draft','correcting','uncorrected','correction_failed','corrected')),
    CONSTRAINT ck_writing_tasks_statement CHECK (statement_words BETWEEN 80 AND 150),
    CONSTRAINT ck_writing_tasks_tags CHECK (cardinality(target_tags) <= 2),
    CONSTRAINT ck_writing_tasks_draft CHECK (char_length(draft_text) <= 10000 AND draft_revision >= 0
        AND (draft_revision = 0) = (draft_saved_at IS NULL)),
    CONSTRAINT ck_writing_tasks_active CHECK (active_seconds >= 0),
    CONSTRAINT ck_writing_tasks_submitted CHECK (status = 'draft' OR submitted_at IS NOT NULL),
    CONSTRAINT ck_writing_tasks_corrected CHECK ((status = 'corrected') = (corrected_at IS NOT NULL))
);
CREATE UNIQUE INDEX ux_writing_tasks_activity ON writing_tasks (activity_id);
CREATE INDEX ix_writing_tasks_user_created ON writing_tasks (user_id, created_at DESC);

CREATE TABLE writing_corrections (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id                UUID         NOT NULL REFERENCES writing_tasks(id) ON DELETE CASCADE,
    user_id                UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    submission_id          UUID         NOT NULL,
    draft_revision         INTEGER      NOT NULL,
    submitted_text         TEXT         NOT NULL,
    word_count             SMALLINT     NOT NULL,
    status                 VARCHAR(16)  NOT NULL DEFAULT 'running',
    attempts               SMALLINT     NOT NULL DEFAULT 0,
    attempt_outcomes       TEXT[]       NOT NULL DEFAULT '{}',
    requested_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    claimed_at             TIMESTAMPTZ,
    finished_at            TIMESTAMPTZ,
    failure_code           VARCHAR(24),
    failure_detail         VARCHAR(500),
    raw_response           TEXT,
    prompt_id              VARCHAR(64),
    prompt_version         VARCHAR(16),
    model                  VARCHAR(64),
    input_tokens           INTEGER,
    output_tokens          INTEGER,
    latency_ms             INTEGER,
    overall_comment        TEXT,
    score_grammar          SMALLINT,
    score_vocabulary       SMALLINT,
    score_coherence        SMALLINT,
    score_task_achievement SMALLINT,
    revised_text           TEXT,
    discarded_error_count  SMALLINT,
    ledger_prior_counts    JSONB,
    rejected_tags          TEXT[],
    CONSTRAINT ck_writing_corrections_status CHECK (status IN ('running','succeeded','failed')),
    CONSTRAINT ck_writing_corrections_words CHECK (word_count BETWEEN 80 AND 600),
    CONSTRAINT ck_writing_corrections_attempts CHECK (attempts BETWEEN 0 AND 2),
    CONSTRAINT ck_writing_corrections_finished CHECK ((status = 'running') = (finished_at IS NULL)),
    CONSTRAINT ck_writing_corrections_failure CHECK ((status = 'failed') = (failure_code IS NOT NULL)
        AND (failure_code IS NULL OR failure_code IN ('request_failed','invalid_output','gemini_key'))),
    CONSTRAINT ck_writing_corrections_raw CHECK (raw_response IS NULL OR failure_code = 'invalid_output'),
    CONSTRAINT ck_writing_corrections_scores CHECK (
        (score_grammar IS NULL OR score_grammar BETWEEN 0 AND 100)
        AND (score_vocabulary IS NULL OR score_vocabulary BETWEEN 0 AND 100)
        AND (score_coherence IS NULL OR score_coherence BETWEEN 0 AND 100)
        AND (score_task_achievement IS NULL OR score_task_achievement BETWEEN 0 AND 100)),
    CONSTRAINT ck_writing_corrections_result CHECK (status <> 'succeeded' OR (
        prompt_id IS NOT NULL AND prompt_version IS NOT NULL AND overall_comment IS NOT NULL
        AND revised_text IS NOT NULL AND score_grammar IS NOT NULL AND score_vocabulary IS NOT NULL
        AND score_coherence IS NOT NULL AND score_task_achievement IS NOT NULL))
);
CREATE UNIQUE INDEX ux_writing_corrections_submission ON writing_corrections (task_id, submission_id);
CREATE UNIQUE INDEX ux_writing_corrections_task_running ON writing_corrections (task_id) WHERE status = 'running';
CREATE UNIQUE INDEX ux_writing_corrections_task_succeeded ON writing_corrections (task_id) WHERE status = 'succeeded';
CREATE INDEX ix_writing_corrections_user_requested ON writing_corrections (user_id, requested_at DESC);
CREATE INDEX ix_writing_corrections_running ON writing_corrections (claimed_at) WHERE status = 'running';

CREATE TABLE writing_correction_errors (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correction_id UUID         NOT NULL REFERENCES writing_corrections(id) ON DELETE CASCADE,
    idx           SMALLINT     NOT NULL,
    quote         VARCHAR(500) NOT NULL,
    tag           VARCHAR(64)  NOT NULL,
    correction    VARCHAR(500) NOT NULL,
    explanation   TEXT         NOT NULL,
    start_offset  INTEGER      NOT NULL,
    end_offset    INTEGER      NOT NULL,
    CONSTRAINT ck_writing_errors_span CHECK (idx BETWEEN 0 AND 29 AND start_offset >= 0 AND end_offset > start_offset)
);
CREATE UNIQUE INDEX ux_writing_errors_correction_idx ON writing_correction_errors (correction_id, idx);
