-- F13: the content bank. One table backs every activity type (curated
-- listening audio imported from disk, and later F14's generated items), and
-- a serving log lets plan composition skip what a user saw in the last 30
-- days. The CHECK constraints repeat the importer's rules so a direct
-- insert cannot create an item F16 could never answer correctly.
CREATE TABLE "content_item" (
    "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "slug"             VARCHAR(80)   NOT NULL,
    "type"             VARCHAR(16)   NOT NULL,
    "provenance"       VARCHAR(16)   NOT NULL,
    "cefr_level"       VARCHAR(2)    NOT NULL,
    "title"            VARCHAR(200)  NOT NULL,
    "topic"            VARCHAR(80)   NOT NULL,
    "accent"           VARCHAR(24),
    "duration_seconds" INTEGER,
    "word_count"       INTEGER,
    "skills"           TEXT[]        NOT NULL,
    "difficulty"       SMALLINT      NOT NULL,
    "source_name"      VARCHAR(200),
    "source_url"       VARCHAR(2048),
    "body"             TEXT,
    "questions"        JSONB         NOT NULL,
    "target_tags"      TEXT[]        NOT NULL,
    "media_object_key" VARCHAR(512),
    "media_checksum"   CHAR(64),
    "media_bytes"      INTEGER,
    "prompt_id"        VARCHAR(64),
    "prompt_version"   VARCHAR(16),
    "gate_metrics"     JSONB,
    "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "content_item_slug_key" UNIQUE ("slug"),
    CONSTRAINT "content_item_slug_format_ck" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT "content_item_type_ck" CHECK ("type" IN ('listening','reading','vocabulary','grammar','error_review')),
    CONSTRAINT "content_item_provenance_ck" CHECK ("provenance" IN ('curated','generated')),
    CONSTRAINT "content_item_cefr_level_ck" CHECK ("cefr_level" IN ('A1','A2','B1','B2','C1','C2')),
    CONSTRAINT "content_item_accent_ck" CHECK ("accent" IS NULL OR "accent" IN
        ('american','british','australian','canadian','irish','scottish','new_zealand','south_african','indian','other')),
    CONSTRAINT "content_item_difficulty_ck" CHECK ("difficulty" BETWEEN 1 AND 5),
    CONSTRAINT "content_item_skills_ck" CHECK (cardinality("skills") >= 1
        AND "skills" <@ ARRAY['listening','reading','vocabulary','grammar']::TEXT[]),
    CONSTRAINT "content_item_target_tags_ck" CHECK (cardinality("target_tags") BETWEEN 1 AND 10),
    CONSTRAINT "content_item_questions_ck" CHECK (jsonb_typeof("questions") = 'array'
        AND jsonb_array_length("questions") = 5),
    CONSTRAINT "content_item_duration_ck" CHECK ("duration_seconds" IS NULL OR "duration_seconds" > 0),
    CONSTRAINT "content_item_word_count_ck" CHECK ("word_count" IS NULL OR "word_count" >= 0),
    CONSTRAINT "content_item_provenance_fields_ck" CHECK (
        ("provenance" = 'generated' AND "prompt_id" IS NOT NULL AND "prompt_version" IS NOT NULL
            AND "gate_metrics" IS NOT NULL)
     OR ("provenance" = 'curated' AND "prompt_id" IS NULL AND "prompt_version" IS NULL
            AND "gate_metrics" IS NULL AND "source_name" IS NOT NULL)),
    CONSTRAINT "content_item_media_all_or_none_ck" CHECK (
        ("media_object_key" IS NULL) = ("media_checksum" IS NULL)
        AND ("media_object_key" IS NULL) = ("media_bytes" IS NULL)),
    CONSTRAINT "content_item_listening_only_fields_ck" CHECK ("type" = 'listening'
        OR ("media_object_key" IS NULL AND "accent" IS NULL AND "duration_seconds" IS NULL)),
    CONSTRAINT "content_item_listening_ck" CHECK ("type" <> 'listening'
        OR ("provenance" = 'curated' AND "media_object_key" IS NOT NULL AND "duration_seconds" IS NOT NULL
            AND "accent" IS NOT NULL AND "body" IS NOT NULL)),
    CONSTRAINT "content_item_media_key_ck" CHECK ("media_object_key" IS NULL
        OR "media_object_key" LIKE 'content/' || "type" || '/' || "slug" || '/%'),
    CONSTRAINT "content_item_reading_body_ck" CHECK ("type" <> 'reading' OR "body" IS NOT NULL),
    CONSTRAINT "content_item_error_review_ck" CHECK ("type" <> 'error_review' OR "provenance" = 'generated')
);

CREATE INDEX "ix_content_item_type_level" ON "content_item" ("type", "cefr_level");
CREATE INDEX "ix_content_item_target_tags" ON "content_item" USING GIN ("target_tags");

CREATE TRIGGER content_item_set_updated_at
    BEFORE UPDATE ON "content_item"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE "content_item_serving" (
    "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id"         UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "content_item_id" UUID NOT NULL REFERENCES "content_item"("id") ON DELETE CASCADE,
    "served_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX "ix_content_item_serving_user_item_time"
    ON "content_item_serving" ("user_id", "content_item_id", "served_at" DESC);
CREATE INDEX "ix_content_item_serving_item" ON "content_item_serving" ("content_item_id");
