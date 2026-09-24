-- F08 Speech-to-Text Transcription: the generic per-stage pipeline state
-- every stage from transcription onward writes, and the per-participant
-- transcript. F07's branch vocabularies widen here; no existing column
-- changes, so branches written by F07 stay valid.

ALTER TABLE lesson_pipeline_branches
    DROP CONSTRAINT ck_branches_stage,
    DROP CONSTRAINT ck_branches_status,
    DROP CONSTRAINT ck_branches_failure_code;

ALTER TABLE lesson_pipeline_branches
    ADD CONSTRAINT ck_branches_stage CHECK (stage IN
        ('recording','transcription','excerpt_selection')),
    ADD CONSTRAINT ck_branches_status CHECK (status IN
        ('verifying','queued','running','retrying','blocked_missing_key','failed','storage_unavailable')),
    ADD CONSTRAINT ck_branches_failure_code CHECK (failure_code IS NULL OR failure_code IN
        ('recording_failed_to_start','recording_missing','recording_too_short','recording_assembly_failed',
         'transcription_quota_exceeded','transcription_service_error','transcription_storage_unreadable',
         'transcription_no_speech','transcription_audio_rejected','transcription_region_unsupported',
         'internal_error'));

CREATE TABLE lesson_pipeline_stages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id        UUID         NOT NULL REFERENCES lesson_pipeline_branches(id) ON DELETE CASCADE,
    stage            VARCHAR(24)  NOT NULL,
    status           VARCHAR(24)  NOT NULL DEFAULT 'queued',
    run              SMALLINT     NOT NULL DEFAULT 1,
    attempts         SMALLINT     NOT NULL DEFAULT 0,
    queued_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    started_at       TIMESTAMPTZ,
    last_attempt_at  TIMESTAMPTZ,
    next_attempt_at  TIMESTAMPTZ,
    finished_at      TIMESTAMPTZ,
    reason_code      VARCHAR(40),
    reason           VARCHAR(200),
    provider_message VARCHAR(500),
    blocked_provider VARCHAR(32),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_stages_stage  CHECK (stage IN ('transcription','excerpt_selection')),
    CONSTRAINT ck_stages_status CHECK (status IN
        ('queued','running','retrying','blocked_missing_key','failed','completed')),
    CONSTRAINT ck_stages_reason CHECK (
        (status IN ('failed','blocked_missing_key') AND reason_code IS NOT NULL)
        OR status = 'retrying'
        OR (status IN ('queued','running','completed') AND reason_code IS NULL)),
    CONSTRAINT ck_stages_reason_code CHECK (reason_code IS NULL OR reason_code IN
        ('credential_missing','credential_rejected','credential_unreadable',
         'transcription_quota_exceeded','transcription_service_error','transcription_storage_unreadable',
         'transcription_no_speech','transcription_audio_rejected','transcription_region_unsupported',
         'internal_error')),
    CONSTRAINT ck_stages_blocked_provider CHECK (
        (status = 'blocked_missing_key') = (blocked_provider IS NOT NULL)
        AND (blocked_provider IS NULL OR blocked_provider IN ('azure_speech','gemini'))),
    CONSTRAINT ck_stages_next_attempt CHECK ((status = 'retrying') = (next_attempt_at IS NOT NULL)),
    CONSTRAINT ck_stages_finished CHECK ((status IN ('completed','failed')) = (finished_at IS NOT NULL))
);

CREATE UNIQUE INDEX ux_stages_branch_stage ON lesson_pipeline_stages (branch_id, stage);
CREATE INDEX ix_stages_pending ON lesson_pipeline_stages (status)
    WHERE status IN ('queued','running','retrying','blocked_missing_key');

CREATE TABLE lesson_transcripts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id         UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    user_id           UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    provider          VARCHAR(40)  NOT NULL,
    api_version       VARCHAR(16)  NOT NULL,
    locale            VARCHAR(16)  NOT NULL,
    audio_duration_ms INTEGER,
    latency_ms        INTEGER      NOT NULL,
    utterance_count   INTEGER      NOT NULL,
    word_count        INTEGER      NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_transcripts_counts CHECK (utterance_count > 0 AND word_count >= 0)
);

CREATE UNIQUE INDEX ux_transcripts_lesson_user ON lesson_transcripts (lesson_id, user_id);

CREATE TABLE lesson_utterances (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transcript_id UUID         NOT NULL REFERENCES lesson_transcripts(id) ON DELETE CASCADE,
    lesson_id     UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    user_id       UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    idx           INTEGER      NOT NULL,
    start_ms      INTEGER      NOT NULL,
    end_ms        INTEGER      NOT NULL,
    text          TEXT         NOT NULL,
    confidence    REAL,
    words         JSONB        NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_utterances_timing CHECK (start_ms >= 0 AND end_ms >= start_ms),
    CONSTRAINT ck_utterances_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    CONSTRAINT ck_utterances_words CHECK (jsonb_typeof(words) = 'array')
);

CREATE UNIQUE INDEX ux_utterances_lesson_user_idx ON lesson_utterances (lesson_id, user_id, idx);
CREATE INDEX ix_utterances_transcript ON lesson_utterances (transcript_id);
