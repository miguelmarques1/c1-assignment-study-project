CREATE TABLE "user_credentials" (
    "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id"           UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "provider"          VARCHAR(32) NOT NULL,
    "ciphertext"        BYTEA NOT NULL,
    "iv"                BYTEA NOT NULL,
    "auth_tag"          BYTEA NOT NULL,
    "last_four"         CHAR(4) NOT NULL,
    "region"            VARCHAR(40),
    "status"            VARCHAR(16) NOT NULL DEFAULT 'unverified',
    "last_validated_at" TIMESTAMPTZ(6),
    "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "user_credentials_user_provider_key" UNIQUE ("user_id", "provider"),
    CONSTRAINT "user_credentials_provider_ck" CHECK ("provider" IN ('gemini','azure_speech')),
    CONSTRAINT "user_credentials_status_ck" CHECK ("status" IN ('valid','invalid','unverified')),
    -- Azure Speech is unusable without a region, so the database refuses the
    -- combination rather than leaving it to be discovered at call time.
    CONSTRAINT "user_credentials_region_ck" CHECK ("provider" <> 'azure_speech' OR "region" IS NOT NULL)
);

CREATE TRIGGER user_credentials_set_updated_at
    BEFORE UPDATE ON "user_credentials"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE "credential_usage" (
    "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id"     UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "provider"    VARCHAR(32) NOT NULL,
    "feature"     VARCHAR(64) NOT NULL,
    "outcome"     VARCHAR(24) NOT NULL,
    "error_code"  VARCHAR(64),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX "ix_credential_usage_user_provider_time"
    ON "credential_usage" ("user_id", "provider", "occurred_at" DESC);
