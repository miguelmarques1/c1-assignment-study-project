-- CreateTable
CREATE TABLE "prompt_execution" (
    "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id"         UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "prompt_id"       VARCHAR(64) NOT NULL,
    "prompt_version"  VARCHAR(16) NOT NULL,
    "model"           VARCHAR(64) NOT NULL,
    "temperature"     REAL NOT NULL,
    "input_tokens"    INTEGER,
    "output_tokens"   INTEGER,
    "latency_ms"      INTEGER NOT NULL,
    "outcome"         VARCHAR(32) NOT NULL,
    "raw_response"    TEXT,
    "occurred_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "prompt_execution_outcome_ck" CHECK ("outcome" IN
        ('ok','validation_failed_retried_ok','validation_failed_hard_error',
         'timeout','empty_response','provider_error'))
);

-- CreateIndex
CREATE INDEX "ix_prompt_execution_prompt_version_time"
    ON "prompt_execution" ("prompt_id", "prompt_version", "occurred_at" DESC);
