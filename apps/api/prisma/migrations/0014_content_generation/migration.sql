-- F14 AI Content Generation: one run per study plan, keyed by the caller's
-- run key so a retried plan stage resumes instead of paying for a second
-- batch; one slot per planned item; one attempt row per model call the
-- difficulty gate judged or that failed. The attempts are the curator's
-- record of why an item passed or was discarded, per prompt version.
CREATE TABLE content_generation_runs (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_key                VARCHAR(128) NOT NULL,
    status                 VARCHAR(16)  NOT NULL DEFAULT 'running',
    abandon_reason         VARCHAR(32),
    max_items              SMALLINT     NOT NULL,
    rules_version          VARCHAR(32)  NOT NULL,
    rules_fingerprint      CHAR(64)     NOT NULL,
    frequency_list_version VARCHAR(80)  NOT NULL,
    taxonomy_version       VARCHAR(16)  NOT NULL,
    notes                  JSONB        NOT NULL DEFAULT '[]',
    started_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    finished_at            TIMESTAMPTZ,
    CONSTRAINT ck_generation_runs_status CHECK (status IN ('running','completed')),
    CONSTRAINT ck_generation_runs_abandon_reason CHECK (abandon_reason IS NULL
        OR abandon_reason IN ('credential_missing','credential_rejected','quota_exhausted')),
    CONSTRAINT ck_generation_runs_max_items CHECK (max_items BETWEEN 1 AND 12),
    CONSTRAINT ck_generation_runs_finished CHECK ((status = 'completed') = (finished_at IS NOT NULL)),
    CONSTRAINT ck_generation_runs_notes CHECK (jsonb_typeof(notes) = 'array')
);
CREATE UNIQUE INDEX ux_generation_runs_user_key ON content_generation_runs (user_id, run_key);
CREATE INDEX ix_generation_runs_user_started ON content_generation_runs (user_id, started_at DESC);

CREATE TABLE content_generation_slots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          UUID        NOT NULL REFERENCES content_generation_runs(id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position        SMALLINT    NOT NULL,
    type            VARCHAR(16) NOT NULL,
    target_tags     TEXT[]      NOT NULL,
    tag_sources     JSONB       NOT NULL,
    genre           VARCHAR(40),
    topic_domain    VARCHAR(40) NOT NULL,
    exemplar_index  SMALLINT    NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'pending',
    reason          VARCHAR(32),
    content_item_id UUID                 REFERENCES content_item(id),
    attempt_count   SMALLINT    NOT NULL DEFAULT 0,
    claimed_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    CONSTRAINT ck_generation_slots_type CHECK (type IN ('reading','vocabulary','grammar','error_review')),
    CONSTRAINT ck_generation_slots_status CHECK (status IN ('pending','running','generated','fallback','dropped')),
    CONSTRAINT ck_generation_slots_reason CHECK (reason IS NULL OR reason IN
        ('gate_failed_twice','generation_failed','quota_exhausted','credential_rejected','credential_missing')),
    CONSTRAINT ck_generation_slots_position CHECK (position BETWEEN 1 AND 12),
    CONSTRAINT ck_generation_slots_tags CHECK (cardinality(target_tags) BETWEEN 1 AND 2),
    CONSTRAINT ck_generation_slots_attempts CHECK (attempt_count BETWEEN 0 AND 2),
    CONSTRAINT ck_generation_slots_exemplar CHECK (exemplar_index >= 0),
    CONSTRAINT ck_generation_slots_genre CHECK ((type = 'reading') = (genre IS NOT NULL)),
    CONSTRAINT ck_generation_slots_item CHECK ((status IN ('generated','fallback')) = (content_item_id IS NOT NULL)),
    CONSTRAINT ck_generation_slots_terminal CHECK (
        (status IN ('generated','fallback','dropped')) = (completed_at IS NOT NULL)
        AND (status IN ('fallback','dropped')) = (reason IS NOT NULL))
);
CREATE UNIQUE INDEX ux_generation_slots_run_position ON content_generation_slots (run_id, position);
CREATE INDEX ix_generation_slots_run_status ON content_generation_slots (run_id, status);
CREATE INDEX ix_generation_slots_user_type_completed ON content_generation_slots (user_id, type, completed_at DESC)
    WHERE status = 'generated';

CREATE TABLE content_generation_attempts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id        UUID        NOT NULL REFERENCES content_generation_slots(id) ON DELETE CASCADE,
    attempt        SMALLINT    NOT NULL,
    prompt_id      VARCHAR(64) NOT NULL,
    prompt_version VARCHAR(16) NOT NULL,
    outcome        VARCHAR(24) NOT NULL,
    failed_checks  TEXT[]      NOT NULL DEFAULT '{}',
    gate_metrics   JSONB,
    error_detail   VARCHAR(500),
    latency_ms     INTEGER,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_generation_attempts_attempt CHECK (attempt IN (1, 2)),
    CONSTRAINT ck_generation_attempts_outcome CHECK (outcome IN ('passed','gate_failed','invalid_output','timeout',
        'empty_response','service_error','request_rejected','quota_exhausted','credential_rejected','credential_missing')),
    CONSTRAINT ck_generation_attempts_gate CHECK (
        (outcome IN ('passed','gate_failed')) = (gate_metrics IS NOT NULL)
        AND (outcome = 'gate_failed') = (cardinality(failed_checks) > 0))
);
CREATE UNIQUE INDEX ux_generation_attempts_slot_attempt ON content_generation_attempts (slot_id, attempt);
CREATE INDEX ix_generation_attempts_prompt_time
    ON content_generation_attempts (prompt_id, prompt_version, created_at DESC);
