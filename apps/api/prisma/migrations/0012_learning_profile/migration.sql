-- F12 Learning Profile and Error Ledger: the per-user learning profile (six
-- competency scores folded from an ordered measurement log), the error ledger
-- (one record per tag, aggregated from an occurrence log), the correct
-- encounters the mastery lifecycle will read, and plan_generation appended to
-- the stage vocabulary so a profiled branch has somewhere to wait for F15.

ALTER TABLE lesson_pipeline_stages DROP CONSTRAINT ck_stages_stage;
ALTER TABLE lesson_pipeline_stages ADD CONSTRAINT ck_stages_stage CHECK (stage IN
    ('transcription','excerpt_selection','pronunciation_assessment','lesson_analysis','profile_update','plan_generation'));

ALTER TABLE lesson_pipeline_branches DROP CONSTRAINT ck_branches_stage;
ALTER TABLE lesson_pipeline_branches ADD CONSTRAINT ck_branches_stage CHECK (stage IN
    ('recording','transcription','excerpt_selection','pronunciation_assessment','lesson_analysis','profile_update','plan_generation'));

CREATE TABLE learning_profiles (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE profile_sources (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    kind              VARCHAR(24) NOT NULL,
    source_key        UUID        NOT NULL,
    revision          VARCHAR(64) NOT NULL,
    lesson_id         UUID                 REFERENCES lessons(id) ON DELETE CASCADE,
    activity_id       UUID,
    occurred_at       TIMESTAMPTZ NOT NULL,
    taxonomy_version  VARCHAR(32) NOT NULL,
    measurement_count SMALLINT    NOT NULL DEFAULT 0,
    occurrence_count  SMALLINT    NOT NULL DEFAULT 0,
    encounter_count   SMALLINT    NOT NULL DEFAULT 0,
    rejected_tags     JSONB       NOT NULL DEFAULT '[]',
    ingested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_profile_sources_kind CHECK (kind IN ('lesson_analysis','lesson_pronunciation','activity')),
    CONSTRAINT ck_profile_sources_links CHECK (
        (kind = 'activity' AND activity_id IS NOT NULL AND lesson_id IS NULL)
        OR (kind <> 'activity' AND lesson_id = source_key AND activity_id IS NULL)),
    CONSTRAINT ck_profile_sources_rejected CHECK (jsonb_typeof(rejected_tags) = 'array')
);
CREATE UNIQUE INDEX ux_profile_sources_user_kind_key ON profile_sources (user_id, kind, source_key);
CREATE INDEX ix_profile_sources_user_occurred ON profile_sources (user_id, occurred_at DESC);
CREATE INDEX ix_profile_sources_lesson ON profile_sources (lesson_id);

CREATE TABLE profile_measurements (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID        NOT NULL REFERENCES users(id)           ON DELETE CASCADE,
    source_id      UUID        NOT NULL REFERENCES profile_sources(id) ON DELETE CASCADE,
    competency     VARCHAR(16) NOT NULL,
    source_kind    VARCHAR(8)  NOT NULL,
    weight         REAL        NOT NULL,
    value          REAL        NOT NULL,
    accuracy       REAL,
    prosody        REAL,
    measured_at    TIMESTAMPTZ NOT NULL,
    score_after    REAL        NOT NULL,
    accuracy_after REAL,
    prosody_after  REAL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_profile_measurements_competency CHECK (competency IN
        ('grammar','vocabulary','fluency','interaction','comprehension','pronunciation')),
    CONSTRAINT ck_profile_measurements_range CHECK (
        source_kind IN ('lesson','activity') AND weight > 0 AND weight <= 1
        AND value BETWEEN 0 AND 100 AND score_after BETWEEN 0 AND 100
        AND (accuracy IS NULL OR accuracy BETWEEN 0 AND 100)
        AND (prosody IS NULL OR prosody BETWEEN 0 AND 100)
        AND (accuracy_after IS NULL OR accuracy_after BETWEEN 0 AND 100)
        AND (prosody_after IS NULL OR prosody_after BETWEEN 0 AND 100)),
    CONSTRAINT ck_profile_measurements_subscores CHECK (competency = 'pronunciation'
        OR (accuracy IS NULL AND prosody IS NULL AND accuracy_after IS NULL AND prosody_after IS NULL))
);
CREATE UNIQUE INDEX ux_profile_measurements_source_competency ON profile_measurements (source_id, competency);
CREATE INDEX ix_profile_measurements_user_competency_time
    ON profile_measurements (user_id, competency, measured_at, created_at);

CREATE TABLE profile_competencies (
    user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competency        VARCHAR(16) NOT NULL,
    score             REAL        NOT NULL,
    previous_score    REAL,
    measurement_count INTEGER     NOT NULL,
    trend             VARCHAR(8),
    accuracy          REAL,
    prosody           REAL,
    prosody_count     INTEGER     NOT NULL DEFAULT 0,
    last_measured_at  TIMESTAMPTZ NOT NULL,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, competency),
    CONSTRAINT ck_profile_competencies_competency CHECK (competency IN
        ('grammar','vocabulary','fluency','interaction','comprehension','pronunciation')),
    CONSTRAINT ck_profile_competencies_count CHECK (measurement_count >= 1 AND score BETWEEN 0 AND 100),
    CONSTRAINT ck_profile_competencies_trend CHECK (
        (measurement_count >= 3) = (trend IS NOT NULL) AND (trend IS NULL OR trend IN ('up','down','flat'))),
    CONSTRAINT ck_profile_competencies_first CHECK ((measurement_count = 1) = (previous_score IS NULL)),
    CONSTRAINT ck_profile_competencies_subscores CHECK (competency = 'pronunciation'
        OR (accuracy IS NULL AND prosody IS NULL AND prosody_count = 0))
);

CREATE TABLE error_ledger_entries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tag              VARCHAR(64)  NOT NULL,
    family           VARCHAR(16)  NOT NULL,
    label            VARCHAR(120) NOT NULL,
    occurrence_count INTEGER      NOT NULL,
    first_seen_at    TIMESTAMPTZ  NOT NULL,
    last_seen_at     TIMESTAMPTZ  NOT NULL,
    state            VARCHAR(12)  NOT NULL DEFAULT 'new',
    due_at           TIMESTAMPTZ,
    taxonomy_version VARCHAR(32)  NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_ledger_entries_tag CHECK (tag ~ '^[a-z]+:([a-z0-9-]+|/[^/[:space:]]{1,4}/)$'),
    CONSTRAINT ck_ledger_entries_family CHECK (split_part(tag, ':', 1) = family),
    CONSTRAINT ck_ledger_entries_count CHECK (occurrence_count >= 1),
    CONSTRAINT ck_ledger_entries_seen CHECK (first_seen_at <= last_seen_at),
    CONSTRAINT ck_ledger_entries_state CHECK (state IN ('new','practicing','mastered'))
);
CREATE UNIQUE INDEX ux_ledger_entries_user_tag ON error_ledger_entries (user_id, tag);
CREATE INDEX ix_ledger_entries_user_last_seen ON error_ledger_entries (user_id, last_seen_at DESC);

CREATE TABLE error_ledger_occurrences (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL REFERENCES users(id)             ON DELETE CASCADE,
    source_id         UUID        NOT NULL REFERENCES profile_sources(id)   ON DELETE CASCADE,
    tag               VARCHAR(64) NOT NULL,
    lesson_id         UUID                 REFERENCES lessons(id)           ON DELETE CASCADE,
    activity_id       UUID,
    quote             TEXT,
    correction        TEXT,
    severity          VARCHAR(8),
    example_words     JSONB       NOT NULL DEFAULT '[]',
    instances         SMALLINT    NOT NULL DEFAULT 1,
    analysis_error_id UUID,
    utterance_id      UUID                 REFERENCES lesson_utterances(id) ON DELETE SET NULL,
    occurred_at       TIMESTAMPTZ NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_ledger_occurrences_tag CHECK (tag ~ '^[a-z]+:([a-z0-9-]+|/[^/[:space:]]{1,4}/)$'),
    CONSTRAINT ck_ledger_occurrences_origin CHECK ((lesson_id IS NULL) <> (activity_id IS NULL)),
    CONSTRAINT ck_ledger_occurrences_detail CHECK (
        (severity IS NULL OR severity IN ('minor','moderate','major'))
        AND instances >= 1
        AND jsonb_typeof(example_words) = 'array' AND jsonb_array_length(example_words) <= 5)
);
CREATE INDEX ix_ledger_occurrences_user_tag_time ON error_ledger_occurrences (user_id, tag, occurred_at DESC);
CREATE INDEX ix_ledger_occurrences_source ON error_ledger_occurrences (source_id);

CREATE TABLE error_ledger_encounters (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id)           ON DELETE CASCADE,
    source_id   UUID        NOT NULL REFERENCES profile_sources(id) ON DELETE CASCADE,
    tag         VARCHAR(64) NOT NULL,
    activity_id UUID        NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_ledger_encounters_tag CHECK (tag ~ '^[a-z]+:([a-z0-9-]+|/[^/[:space:]]{1,4}/)$')
);
CREATE UNIQUE INDEX ux_ledger_encounters_source_tag ON error_ledger_encounters (source_id, tag);
CREATE INDEX ix_ledger_encounters_user_tag_time ON error_ledger_encounters (user_id, tag, occurred_at);
