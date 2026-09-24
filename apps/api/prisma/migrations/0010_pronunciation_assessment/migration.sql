-- F10 Pronunciation Assessment: per-excerpt assessments written as each
-- excerpt settles (so a retry reprocesses only what failed), the per-lesson
-- result F11, F12 and F19 read, and a generic progress counter on stage rows.
-- The stage vocabulary gains lesson_analysis so an assessed branch has
-- somewhere to wait for F11.

ALTER TABLE lesson_pipeline_stages
    ADD COLUMN progress_done  SMALLINT,
    ADD COLUMN progress_total SMALLINT,
    ADD CONSTRAINT ck_stages_progress CHECK (
        (progress_done IS NULL AND progress_total IS NULL)
        OR (progress_total >= 0 AND progress_done BETWEEN 0 AND progress_total));

ALTER TABLE lesson_pipeline_stages
    DROP CONSTRAINT ck_stages_stage,
    DROP CONSTRAINT ck_stages_reason_code;
ALTER TABLE lesson_pipeline_stages
    ADD CONSTRAINT ck_stages_stage CHECK (stage IN
        ('transcription','excerpt_selection','pronunciation_assessment','lesson_analysis')),
    ADD CONSTRAINT ck_stages_reason_code CHECK (reason_code IS NULL OR reason_code IN
        ('credential_missing','credential_rejected','credential_unreadable',
         'transcription_quota_exceeded','transcription_service_error','transcription_storage_unreadable',
         'transcription_no_speech','transcription_audio_rejected','transcription_region_unsupported',
         'pronunciation_too_few_assessed','pronunciation_quota_exhausted','pronunciation_audio_unprocessable',
         'pronunciation_storage_unreadable','pronunciation_region_unsupported',
         'internal_error'));

ALTER TABLE lesson_pipeline_branches
    DROP CONSTRAINT ck_branches_stage,
    DROP CONSTRAINT ck_branches_failure_code;
ALTER TABLE lesson_pipeline_branches
    ADD CONSTRAINT ck_branches_stage CHECK (stage IN
        ('recording','transcription','excerpt_selection','pronunciation_assessment','lesson_analysis')),
    ADD CONSTRAINT ck_branches_failure_code CHECK (failure_code IS NULL OR failure_code IN
        ('recording_failed_to_start','recording_missing','recording_too_short','recording_assembly_failed',
         'transcription_quota_exceeded','transcription_service_error','transcription_storage_unreadable',
         'transcription_no_speech','transcription_audio_rejected','transcription_region_unsupported',
         'pronunciation_too_few_assessed','pronunciation_quota_exhausted','pronunciation_audio_unprocessable',
         'pronunciation_storage_unreadable','pronunciation_region_unsupported',
         'internal_error'));

CREATE TABLE lesson_excerpt_assessments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    excerpt_id      UUID         NOT NULL REFERENCES lesson_excerpts(id) ON DELETE CASCADE,
    lesson_id       UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    user_id         UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    status          VARCHAR(16)  NOT NULL DEFAULT 'pending',
    attempts        SMALLINT     NOT NULL DEFAULT 0,
    failure_code    VARCHAR(32),
    failure_message VARCHAR(500),
    clip_start_ms   INTEGER,
    clip_end_ms     INTEGER,
    pronunciation   REAL,
    accuracy        REAL,
    fluency         REAL,
    prosody         REAL,
    completeness    REAL,
    words           JSONB,
    recognized_text TEXT,
    latency_ms      INTEGER,
    assessed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_excerpt_assessments_status CHECK (status IN ('pending','assessed','failed','dropped','abandoned')),
    CONSTRAINT ck_excerpt_assessments_failure CHECK ((status IN ('failed','dropped','abandoned')) = (failure_code IS NOT NULL)),
    CONSTRAINT ck_excerpt_assessments_failure_code CHECK (failure_code IS NULL OR failure_code IN
        ('service_error','audio_rejected','no_speech_recognized','slice_failed','quota_exhausted')),
    CONSTRAINT ck_excerpt_assessments_assessed CHECK (status <> 'assessed' OR (
        pronunciation IS NOT NULL AND accuracy IS NOT NULL AND fluency IS NOT NULL AND completeness IS NOT NULL
        AND words IS NOT NULL AND assessed_at IS NOT NULL AND clip_start_ms IS NOT NULL)),
    CONSTRAINT ck_excerpt_assessments_scores CHECK (
        (pronunciation IS NULL OR pronunciation BETWEEN 0 AND 100) AND (accuracy IS NULL OR accuracy BETWEEN 0 AND 100)
        AND (fluency IS NULL OR fluency BETWEEN 0 AND 100) AND (prosody IS NULL OR prosody BETWEEN 0 AND 100)
        AND (completeness IS NULL OR completeness BETWEEN 0 AND 100)),
    CONSTRAINT ck_excerpt_assessments_clip CHECK (clip_start_ms IS NULL OR (clip_start_ms >= 0 AND clip_end_ms > clip_start_ms)),
    CONSTRAINT ck_excerpt_assessments_words CHECK (words IS NULL OR jsonb_typeof(words) = 'array')
);

CREATE UNIQUE INDEX ux_excerpt_assessments_excerpt ON lesson_excerpt_assessments (excerpt_id);
CREATE INDEX ix_excerpt_assessments_lesson_user ON lesson_excerpt_assessments (lesson_id, user_id);

CREATE TABLE lesson_pronunciation_results (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id          UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    user_id            UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    selection_id       UUID         NOT NULL REFERENCES lesson_excerpt_selections(id) ON DELETE CASCADE,
    status             VARCHAR(16)  NOT NULL,
    excerpt_count      SMALLINT     NOT NULL,
    assessed_count     SMALLINT     NOT NULL,
    partial_assessment BOOLEAN      NOT NULL,
    sparse_sample      BOOLEAN      NOT NULL,
    quota_exhausted    BOOLEAN      NOT NULL,
    pronunciation      REAL,
    accuracy           REAL,
    fluency            REAL,
    prosody            REAL,
    completeness       REAL,
    assessed_audio_ms  INTEGER      NOT NULL,
    worst_phonemes     JSONB        NOT NULL,
    worst_words        JSONB        NOT NULL,
    phoneme_tags       JSONB        NOT NULL,
    provider           VARCHAR(40)  NOT NULL,
    locale             VARCHAR(16)  NOT NULL,
    phoneme_alphabet   VARCHAR(8)   NOT NULL,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_pronunciation_results_status CHECK (status IN ('assessed','no_sample')),
    CONSTRAINT ck_pronunciation_results_counts CHECK (
        assessed_count >= 0 AND assessed_count <= excerpt_count
        AND partial_assessment = (assessed_count < excerpt_count)),
    CONSTRAINT ck_pronunciation_results_shape CHECK (
        (status = 'no_sample' AND excerpt_count = 0 AND pronunciation IS NULL AND accuracy IS NULL
            AND fluency IS NULL AND completeness IS NULL)
        OR (status = 'assessed' AND assessed_count > 0 AND pronunciation IS NOT NULL AND accuracy IS NOT NULL
            AND fluency IS NOT NULL AND completeness IS NOT NULL)),
    CONSTRAINT ck_pronunciation_results_scores CHECK (
        (pronunciation IS NULL OR pronunciation BETWEEN 0 AND 100) AND (accuracy IS NULL OR accuracy BETWEEN 0 AND 100)
        AND (fluency IS NULL OR fluency BETWEEN 0 AND 100) AND (prosody IS NULL OR prosody BETWEEN 0 AND 100)
        AND (completeness IS NULL OR completeness BETWEEN 0 AND 100)),
    CONSTRAINT ck_pronunciation_results_json CHECK (
        jsonb_typeof(worst_phonemes) = 'array' AND jsonb_typeof(worst_words) = 'array'
        AND jsonb_typeof(phoneme_tags) = 'array')
);

CREATE UNIQUE INDEX ux_pronunciation_results_lesson_user ON lesson_pronunciation_results (lesson_id, user_id);
CREATE INDEX ix_pronunciation_results_selection ON lesson_pronunciation_results (selection_id);
