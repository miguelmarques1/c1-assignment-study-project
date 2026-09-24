-- F09 Excerpt Selection: the per-participant selection of utterances that
-- pronunciation assessment (F10) will spend the owner's Azure quota on.
-- The stage vocabulary gains pronunciation_assessment so a selected branch
-- has somewhere to wait for F10; no existing column or reason code changes.

ALTER TABLE lesson_pipeline_branches DROP CONSTRAINT ck_branches_stage;
ALTER TABLE lesson_pipeline_branches
    ADD CONSTRAINT ck_branches_stage CHECK (stage IN
        ('recording','transcription','excerpt_selection','pronunciation_assessment'));

ALTER TABLE lesson_pipeline_stages DROP CONSTRAINT ck_stages_stage;
ALTER TABLE lesson_pipeline_stages
    ADD CONSTRAINT ck_stages_stage CHECK (stage IN
        ('transcription','excerpt_selection','pronunciation_assessment'));

CREATE TABLE lesson_excerpt_selections (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id         UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    user_id           UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    transcript_id     UUID         NOT NULL REFERENCES lesson_transcripts(id) ON DELETE CASCADE,
    rule_version      VARCHAR(32)  NOT NULL,
    rule_fingerprint  CHAR(64)     NOT NULL,
    rules             JSONB        NOT NULL,
    focus_source      VARCHAR(40)  NOT NULL,
    focus_tags        JSONB        NOT NULL,
    utterance_count   INTEGER      NOT NULL,
    eligible_count    INTEGER      NOT NULL,
    selected_count    INTEGER      NOT NULL,
    selected_audio_ms INTEGER      NOT NULL,
    sparse_sample     BOOLEAN      NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_excerpt_selections_counts CHECK (
        selected_count >= 0 AND selected_count <= eligible_count AND eligible_count <= utterance_count),
    CONSTRAINT ck_excerpt_selections_audio CHECK (selected_audio_ms >= 0),
    CONSTRAINT ck_excerpt_selections_json CHECK (
        jsonb_typeof(rules) = 'object' AND jsonb_typeof(focus_tags) = 'array')
);

CREATE UNIQUE INDEX ux_excerpt_selections_lesson_user ON lesson_excerpt_selections (lesson_id, user_id);
CREATE INDEX ix_excerpt_selections_transcript ON lesson_excerpt_selections (transcript_id);

CREATE TABLE lesson_excerpts (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    selection_id           UUID         NOT NULL REFERENCES lesson_excerpt_selections(id) ON DELETE CASCADE,
    lesson_id              UUID         NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    user_id                UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    utterance_id           UUID         NOT NULL REFERENCES lesson_utterances(id) ON DELETE CASCADE,
    rank                   SMALLINT     NOT NULL,
    start_ms               INTEGER      NOT NULL,
    end_ms                 INTEGER      NOT NULL,
    reference_text         TEXT         NOT NULL,
    selection_rule_version VARCHAR(32)  NOT NULL,
    confidence             REAL,
    word_count             SMALLINT     NOT NULL,
    filler_share           REAL         NOT NULL,
    focus_word_count       SMALLINT     NOT NULL,
    reason                 VARCHAR(200) NOT NULL,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_excerpts_timing CHECK (start_ms >= 0 AND end_ms > start_ms),
    CONSTRAINT ck_excerpts_rank CHECK (rank >= 1),
    CONSTRAINT ck_excerpts_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    CONSTRAINT ck_excerpts_filler_share CHECK (filler_share >= 0 AND filler_share <= 1),
    CONSTRAINT ck_excerpts_counts CHECK (
        word_count > 0 AND focus_word_count >= 0 AND focus_word_count <= word_count)
);

CREATE UNIQUE INDEX ux_excerpts_selection_rank ON lesson_excerpts (selection_id, rank);
CREATE UNIQUE INDEX ux_excerpts_utterance ON lesson_excerpts (utterance_id);
CREATE INDEX ix_excerpts_lesson_user ON lesson_excerpts (lesson_id, user_id);
