-- F15 Study Plan Generation: one active plan per user, composed after each
-- lesson (or from the existing profile when the recording failed or the
-- analysis waits for a Gemini key), with every activity's state kept so that
-- progress, carry-over and completion history are queries. Requests hold the
-- builds that run outside the pipeline. The pipeline gains its terminal
-- branch status with its last stage.
ALTER TABLE lesson_pipeline_branches DROP CONSTRAINT ck_branches_status;
ALTER TABLE lesson_pipeline_branches ADD CONSTRAINT ck_branches_status CHECK (status IN
    ('verifying','queued','running','retrying','blocked_missing_key','failed','storage_unavailable','completed'));

CREATE TABLE study_plans (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id             UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    origin                VARCHAR(24)  NOT NULL,
    status                VARCHAR(16)  NOT NULL,
    precedence_at         TIMESTAMPTZ  NOT NULL,
    composition           VARCHAR(16)  NOT NULL,
    deterministic_reason  VARCHAR(32),
    general_material      BOOLEAN      NOT NULL DEFAULT FALSE,
    notes                 JSONB        NOT NULL DEFAULT '[]',
    focus_tags            TEXT[]       NOT NULL DEFAULT '{}',
    prompt_id             VARCHAR(64),
    prompt_version        VARCHAR(16),
    model                 VARCHAR(64),
    model_selection_stats JSONB,
    generation_run_id     UUID REFERENCES content_generation_runs(id) ON DELETE SET NULL,
    rules_version         VARCHAR(32)  NOT NULL,
    rules_fingerprint     CHAR(64)     NOT NULL,
    taxonomy_version      VARCHAR(16)  NOT NULL,
    superseded_by_plan_id UUID REFERENCES study_plans(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    activated_at          TIMESTAMPTZ,
    archived_at           TIMESTAMPTZ,
    CONSTRAINT ck_study_plans_origin CHECK (origin IN ('lesson','recording_failed','analysis_blocked')),
    CONSTRAINT ck_study_plans_status CHECK (status IN ('active','archived')),
    CONSTRAINT ck_study_plans_composition CHECK (composition IN ('model','deterministic')),
    CONSTRAINT ck_study_plans_reason CHECK ((composition = 'deterministic') = (deterministic_reason IS NOT NULL)
        AND (deterministic_reason IS NULL OR deterministic_reason IN ('gemini_key_missing','gemini_key_rejected',
            'gemini_quota_exhausted','model_call_failed','model_output_invalid','no_profile'))),
    CONSTRAINT ck_study_plans_prompt CHECK (composition <> 'model' OR prompt_id IS NOT NULL),
    CONSTRAINT ck_study_plans_archived CHECK ((status = 'archived') = (archived_at IS NOT NULL)),
    CONSTRAINT ck_study_plans_active CHECK (status <> 'active' OR activated_at IS NOT NULL),
    CONSTRAINT ck_study_plans_notes CHECK (jsonb_typeof(notes) = 'array')
);
CREATE UNIQUE INDEX ux_study_plans_user_active ON study_plans (user_id) WHERE status = 'active';
CREATE UNIQUE INDEX ux_study_plans_user_lesson_origin ON study_plans (user_id, lesson_id, origin);
CREATE INDEX ix_study_plans_user_created ON study_plans (user_id, created_at DESC);

CREATE TABLE study_plan_activities (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id                  UUID         NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
    user_id                  UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day                      SMALLINT     NOT NULL,
    position                 SMALLINT     NOT NULL,
    kind                     VARCHAR(16)  NOT NULL,
    content_item_id          UUID REFERENCES content_item(id),
    title                    VARCHAR(200) NOT NULL,
    target_tags              TEXT[]       NOT NULL DEFAULT '{}',
    is_review                BOOLEAN      NOT NULL DEFAULT FALSE,
    estimated_minutes        SMALLINT     NOT NULL,
    rationale                VARCHAR(240) NOT NULL,
    rationale_source         VARCHAR(16)  NOT NULL,
    placement                VARCHAR(16)  NOT NULL,
    carried_from_activity_id UUID REFERENCES study_plan_activities(id) ON DELETE SET NULL,
    state                    VARCHAR(16)  NOT NULL DEFAULT 'pending',
    started_at               TIMESTAMPTZ,
    completed_at             TIMESTAMPTZ,
    skipped_at               TIMESTAMPTZ,
    skip_reason              VARCHAR(200),
    completion_key           UUID,
    score_correct            SMALLINT,
    score_total              SMALLINT,
    time_spent_seconds       INTEGER,
    difficulty_rating        VARCHAR(12),
    not_useful               BOOLEAN      NOT NULL DEFAULT FALSE,
    rated_at                 TIMESTAMPTZ,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_plan_activities_day CHECK (day BETWEEN 1 AND 7),
    CONSTRAINT ck_plan_activities_position CHECK (position BETWEEN 1 AND 4),
    CONSTRAINT ck_plan_activities_kind CHECK (kind IN ('listening','reading','vocabulary','grammar','error_review',
        'writing','speaking','pronunciation')),
    CONSTRAINT ck_plan_activities_item CHECK (
        (kind IN ('listening','reading','vocabulary','grammar','error_review')) = (content_item_id IS NOT NULL)),
    CONSTRAINT ck_plan_activities_minutes CHECK (estimated_minutes BETWEEN 1 AND 60),
    CONSTRAINT ck_plan_activities_tags CHECK (cardinality(target_tags) <= 5),
    CONSTRAINT ck_plan_activities_rationale_source CHECK (rationale_source IN ('model','template')),
    CONSTRAINT ck_plan_activities_placement CHECK (placement IN ('model','guardrail','carry_over','task')),
    CONSTRAINT ck_plan_activities_state CHECK (state IN ('pending','in_progress','completed','skipped')),
    CONSTRAINT ck_plan_activities_states CHECK (
        (state = 'completed') = (completed_at IS NOT NULL)
        AND (state = 'skipped') = (skipped_at IS NOT NULL AND skip_reason IS NOT NULL)
        AND (state IN ('pending','skipped') OR started_at IS NOT NULL)),
    CONSTRAINT ck_plan_activities_score CHECK ((score_correct IS NULL) = (score_total IS NULL)
        AND (score_total IS NULL OR score_correct BETWEEN 0 AND score_total)),
    CONSTRAINT ck_plan_activities_rating CHECK (
        (difficulty_rating IS NULL OR difficulty_rating IN ('too_easy','just_right','too_hard'))
        AND ((difficulty_rating IS NULL AND NOT not_useful) OR state = 'completed'))
);
CREATE UNIQUE INDEX ux_plan_activities_plan_slot ON study_plan_activities (plan_id, day, position);
CREATE UNIQUE INDEX ux_plan_activities_plan_item ON study_plan_activities (plan_id, content_item_id)
    WHERE content_item_id IS NOT NULL;
CREATE UNIQUE INDEX ux_plan_activities_carried_from ON study_plan_activities (carried_from_activity_id)
    WHERE carried_from_activity_id IS NOT NULL;
CREATE INDEX ix_plan_activities_user_completed ON study_plan_activities (user_id, completed_at DESC)
    WHERE state = 'completed';

CREATE TABLE study_plan_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id       UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    origin          VARCHAR(24)  NOT NULL,
    status          VARCHAR(16)  NOT NULL DEFAULT 'pending',
    attempts        SMALLINT     NOT NULL DEFAULT 0,
    claimed_at      TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,
    progress_done   SMALLINT,
    progress_total  SMALLINT,
    failure_reason  VARCHAR(200),
    plan_id         UUID REFERENCES study_plans(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    CONSTRAINT ck_plan_requests_origin CHECK (origin IN ('recording_failed','analysis_blocked')),
    CONSTRAINT ck_plan_requests_status CHECK (status IN ('pending','running','retrying','completed','superseded','failed')),
    CONSTRAINT ck_plan_requests_failed CHECK ((status = 'failed') = (failure_reason IS NOT NULL)),
    CONSTRAINT ck_plan_requests_retrying CHECK ((status = 'retrying') = (next_attempt_at IS NOT NULL)),
    CONSTRAINT ck_plan_requests_finished CHECK (
        (status IN ('completed','superseded','failed')) = (finished_at IS NOT NULL))
);
CREATE UNIQUE INDEX ux_plan_requests_user_lesson_origin ON study_plan_requests (user_id, lesson_id, origin);
CREATE INDEX ix_plan_requests_claim ON study_plan_requests (status, next_attempt_at);
