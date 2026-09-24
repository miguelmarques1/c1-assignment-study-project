-- F11 AI Lesson Analysis: one analysis per participant per lesson, written by
-- the lesson_analysis stage with its tagged errors (what F12's ledger ingests),
-- and profile_update added to the stage vocabulary so an analysed branch has
-- somewhere to wait for F12.

ALTER TABLE lesson_pipeline_stages
    DROP CONSTRAINT ck_stages_stage,
    DROP CONSTRAINT ck_stages_reason_code;
ALTER TABLE lesson_pipeline_stages
    ADD CONSTRAINT ck_stages_stage CHECK (stage IN
        ('transcription','excerpt_selection','pronunciation_assessment','lesson_analysis','profile_update')),
    ADD CONSTRAINT ck_stages_reason_code CHECK (reason_code IS NULL OR reason_code IN
        ('credential_missing','credential_rejected','credential_unreadable',
         'transcription_quota_exceeded','transcription_service_error','transcription_storage_unreadable',
         'transcription_no_speech','transcription_audio_rejected','transcription_region_unsupported',
         'pronunciation_too_few_assessed','pronunciation_quota_exhausted','pronunciation_audio_unprocessable',
         'pronunciation_storage_unreadable','pronunciation_region_unsupported',
         'analysis_quota_exceeded','analysis_timeout','analysis_service_error',
         'analysis_invalid_output','analysis_request_rejected',
         'internal_error'));

ALTER TABLE lesson_pipeline_branches
    DROP CONSTRAINT ck_branches_stage,
    DROP CONSTRAINT ck_branches_failure_code;
ALTER TABLE lesson_pipeline_branches
    ADD CONSTRAINT ck_branches_stage CHECK (stage IN
        ('recording','transcription','excerpt_selection','pronunciation_assessment','lesson_analysis','profile_update')),
    ADD CONSTRAINT ck_branches_failure_code CHECK (failure_code IS NULL OR failure_code IN
        ('recording_failed_to_start','recording_missing','recording_too_short','recording_assembly_failed',
         'transcription_quota_exceeded','transcription_service_error','transcription_storage_unreadable',
         'transcription_no_speech','transcription_audio_rejected','transcription_region_unsupported',
         'pronunciation_too_few_assessed','pronunciation_quota_exhausted','pronunciation_audio_unprocessable',
         'pronunciation_storage_unreadable','pronunciation_region_unsupported',
         'analysis_quota_exceeded','analysis_timeout','analysis_service_error',
         'analysis_invalid_output','analysis_request_rejected',
         'internal_error'));

CREATE TABLE lesson_analyses (
    id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id                    UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    user_id                      UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    grammar                      SMALLINT     NOT NULL,
    vocabulary                   SMALLINT     NOT NULL,
    fluency                      SMALLINT     NOT NULL,
    interaction                  SMALLINT     NOT NULL,
    comprehension                SMALLINT     NOT NULL,
    justifications               JSONB        NOT NULL,
    strengths                    JSONB        NOT NULL,
    recurring_tags               JSONB        NOT NULL,
    topics                       JSONB        NOT NULL,
    scenario_context             VARCHAR(16)  NOT NULL,
    scenario_fit                 JSONB,
    pronunciation_context        VARCHAR(16)  NOT NULL,
    transcript_tokens_estimated  INTEGER      NOT NULL,
    transcript_truncated         BOOLEAN      NOT NULL,
    truncation                   JSONB,
    profile_tag_count            SMALLINT     NOT NULL DEFAULT 0,
    discarded_error_count        SMALLINT     NOT NULL DEFAULT 0,
    curator_flags                JSONB        NOT NULL DEFAULT '[]',
    taxonomy_version             VARCHAR(32)  NOT NULL,
    prompt_id                    VARCHAR(64)  NOT NULL,
    prompt_version               VARCHAR(16)  NOT NULL,
    model                        VARCHAR(64)  NOT NULL,
    input_tokens                 INTEGER,
    output_tokens                INTEGER,
    latency_ms                   INTEGER      NOT NULL,
    schema_retried                BOOLEAN     NOT NULL,
    created_at                   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_lesson_analyses_scores CHECK (
        grammar BETWEEN 0 AND 100 AND vocabulary BETWEEN 0 AND 100 AND fluency BETWEEN 0 AND 100
        AND interaction BETWEEN 0 AND 100 AND comprehension BETWEEN 0 AND 100),
    CONSTRAINT ck_lesson_analyses_scenario_context CHECK (scenario_context IN ('full','situation_only','none')),
    CONSTRAINT ck_lesson_analyses_fit CHECK (
        scenario_fit IS NULL OR (scenario_context = 'full' AND jsonb_typeof(scenario_fit) = 'object')),
    CONSTRAINT ck_lesson_analyses_pronunciation_context CHECK (pronunciation_context IN ('assessed','no_sample')),
    CONSTRAINT ck_lesson_analyses_truncation CHECK (transcript_truncated = (truncation IS NOT NULL)),
    CONSTRAINT ck_lesson_analyses_json CHECK (
        jsonb_typeof(justifications) = 'object'
        AND jsonb_typeof(strengths) = 'array' AND jsonb_array_length(strengths) BETWEEN 3 AND 5
        AND jsonb_typeof(topics) = 'array' AND jsonb_array_length(topics) BETWEEN 3 AND 6
        AND jsonb_typeof(recurring_tags) = 'array' AND jsonb_typeof(curator_flags) = 'array')
);

CREATE UNIQUE INDEX ux_lesson_analyses_lesson_user ON lesson_analyses (lesson_id, user_id);
CREATE INDEX ix_lesson_analyses_user_created ON lesson_analyses (user_id, created_at DESC);

CREATE TABLE lesson_analysis_errors (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id  UUID         NOT NULL REFERENCES lesson_analyses(id) ON DELETE CASCADE,
    lesson_id    UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    user_id      UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    idx          SMALLINT     NOT NULL,
    quote        TEXT         NOT NULL,
    tag          VARCHAR(64)  NOT NULL,
    correction   TEXT         NOT NULL,
    explanation  TEXT         NOT NULL,
    severity     VARCHAR(8)   NOT NULL,
    utterance_id UUID         REFERENCES lesson_utterances(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_analysis_errors_severity CHECK (severity IN ('minor','moderate','major')),
    CONSTRAINT ck_analysis_errors_tag CHECK (tag ~ '^[a-z]+:[a-z0-9-]+$')
);

CREATE UNIQUE INDEX ux_analysis_errors_analysis_idx ON lesson_analysis_errors (analysis_id, idx);
CREATE INDEX ix_analysis_errors_user_tag ON lesson_analysis_errors (user_id, tag);
