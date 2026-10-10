-- F16 Objective Activity Execution: one row per attempt at a bank-backed
-- activity. The questions are snapshotted when the attempt starts, so a
-- re-import can never change what an attempt is graded against or what its
-- results show. The attempt id is the idempotency key the plan contract
-- (completion_key) and the profile (source_key) already use, and the prompt
-- stamp is what a difficulty rating is stored against.
CREATE TABLE objective_attempts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_activity_id      UUID         NOT NULL REFERENCES study_plan_activities(id) ON DELETE CASCADE,
    content_item_id       UUID         NOT NULL REFERENCES content_item(id),
    kind                  VARCHAR(16)  NOT NULL,
    status                VARCHAR(16)  NOT NULL DEFAULT 'open',
    provenance            VARCHAR(16)  NOT NULL,
    prompt_id             VARCHAR(64),
    prompt_version        VARCHAR(16),
    questions             JSONB        NOT NULL,
    questions_fingerprint CHAR(64)     NOT NULL,
    started_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    submitted_at          TIMESTAMPTZ,
    abandoned_at          TIMESTAMPTZ,
    answers               JSONB,
    results               JSONB,
    score_correct         SMALLINT,
    score_total           SMALLINT,
    unscored_count        SMALLINT     NOT NULL DEFAULT 0,
    time_spent_seconds    INTEGER,
    difficulty_rating     VARCHAR(12),
    not_useful            BOOLEAN      NOT NULL DEFAULT FALSE,
    rated_at              TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_objective_attempts_kind CHECK (kind IN ('listening','reading','vocabulary','grammar','error_review')),
    CONSTRAINT ck_objective_attempts_status CHECK (status IN ('open','submitted','abandoned')),
    CONSTRAINT ck_objective_attempts_provenance CHECK (provenance IN ('curated','generated')
        AND (provenance = 'curated' OR (prompt_id IS NOT NULL AND prompt_version IS NOT NULL))),
    CONSTRAINT ck_objective_attempts_submitted CHECK ((status = 'submitted') = (submitted_at IS NOT NULL
        AND answers IS NOT NULL AND results IS NOT NULL AND score_correct IS NOT NULL AND score_total IS NOT NULL)),
    CONSTRAINT ck_objective_attempts_abandoned CHECK ((status = 'abandoned') = (abandoned_at IS NOT NULL)),
    CONSTRAINT ck_objective_attempts_score CHECK (score_total IS NULL
        OR (score_total BETWEEN 1 AND 5 AND score_correct BETWEEN 0 AND score_total)),
    CONSTRAINT ck_objective_attempts_unscored CHECK (unscored_count BETWEEN 0 AND 5),
    CONSTRAINT ck_objective_attempts_time CHECK (time_spent_seconds IS NULL OR time_spent_seconds BETWEEN 0 AND 3600),
    CONSTRAINT ck_objective_attempts_rating CHECK (
        (difficulty_rating IS NULL OR difficulty_rating IN ('too_easy','just_right','too_hard'))
        AND ((difficulty_rating IS NULL AND NOT not_useful AND rated_at IS NULL) OR status = 'submitted')),
    CONSTRAINT ck_objective_attempts_json CHECK (jsonb_typeof(questions) = 'array'
        AND (answers IS NULL OR jsonb_typeof(answers) = 'array')
        AND (results IS NULL OR jsonb_typeof(results) = 'array'))
);
CREATE UNIQUE INDEX ux_objective_attempts_open ON objective_attempts (plan_activity_id) WHERE status = 'open';
CREATE UNIQUE INDEX ux_objective_attempts_submitted ON objective_attempts (plan_activity_id) WHERE status = 'submitted';
CREATE INDEX ix_objective_attempts_activity ON objective_attempts (plan_activity_id, status);
CREATE INDEX ix_objective_attempts_item_submitted ON objective_attempts (content_item_id, submitted_at DESC)
    WHERE status = 'submitted';
CREATE INDEX ix_objective_attempts_prompt_rated ON objective_attempts (prompt_id, prompt_version)
    WHERE rated_at IS NOT NULL;
