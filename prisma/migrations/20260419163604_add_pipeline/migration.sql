-- CreateTable
CREATE TABLE "video_job" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "stage" VARCHAR(16) NOT NULL DEFAULT 'validate',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leased_at" TIMESTAMPTZ(6),
    "lease_id" TEXT,
    "last_error_code" VARCHAR(48),
    "last_error_message" VARCHAR(500),
    "failed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "video_job_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_video_job_stage" CHECK ("stage" IN ('validate','transcribe','summarize')),
    CONSTRAINT "ck_video_job_attempt" CHECK ("attempt" >= 0 AND "attempt" <= 3)
);

-- CreateIndex
CREATE UNIQUE INDEX "video_job_video_id_key" ON "video_job"("video_id");

-- CreateIndex
CREATE INDEX "ix_video_job_due" ON "video_job"("scheduled_at", "leased_at");

-- AddForeignKey
ALTER TABLE "video_job" ADD CONSTRAINT "video_job_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "transcription" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "detected_language" VARCHAR(8),
    "model" VARCHAR(48) NOT NULL DEFAULT 'whisper-1',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transcription_video_id_key" ON "transcription"("video_id");

-- AddForeignKey
ALTER TABLE "transcription" ADD CONSTRAINT "transcription_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "transcription_segment" (
    "id" TEXT NOT NULL,
    "transcription_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "segment_index" INTEGER NOT NULL,
    "start_seconds" DECIMAL(10,3) NOT NULL,
    "end_seconds" DECIMAL(10,3) NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcription_segment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_transcription_segment_times" CHECK ("start_seconds" >= 0 AND "end_seconds" >= "start_seconds")
);

-- CreateIndex
CREATE UNIQUE INDEX "ux_transcription_segment_order" ON "transcription_segment"("video_id", "segment_index");

-- CreateIndex
CREATE INDEX "ix_transcription_segment_time" ON "transcription_segment"("video_id", "start_seconds");

-- AddForeignKey
ALTER TABLE "transcription_segment" ADD CONSTRAINT "transcription_segment_transcription_id_fkey" FOREIGN KEY ("transcription_id") REFERENCES "transcription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcription_segment" ADD CONSTRAINT "transcription_segment_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "summary" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "overview" TEXT NOT NULL,
    "key_topics" JSONB NOT NULL DEFAULT '[]',
    "model" VARCHAR(48) NOT NULL DEFAULT 'gpt-4.1-nano',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "summary_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_summary_key_topics_array" CHECK (jsonb_typeof("key_topics") = 'array')
);

-- CreateIndex
CREATE UNIQUE INDEX "summary_video_id_key" ON "summary"("video_id");

-- AddForeignKey
ALTER TABLE "summary" ADD CONSTRAINT "summary_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "video_event" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "from_status" VARCHAR(16),
    "to_status" VARCHAR(16) NOT NULL,
    "stage" VARCHAR(16),
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(48),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_video_event_to_status" CHECK ("to_status" IN ('validating','transcribing','summarizing','ready','failed'))
);

-- CreateIndex
CREATE INDEX "ix_video_event_user_created" ON "video_event"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_video_event_video_created" ON "video_event"("video_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "video_event" ADD CONSTRAINT "video_event_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_event" ADD CONSTRAINT "video_event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- LISTEN/NOTIFY trigger
CREATE OR REPLACE FUNCTION notify_video_event() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('video_events', json_build_object(
    'videoId',    NEW.video_id,
    'userId',     NEW.user_id,
    'fromStatus', NEW.from_status,
    'toStatus',   NEW.to_status,
    'stage',      NEW.stage,
    'attempt',    NEW.attempt,
    'errorCode',  NEW.error_code,
    'createdAt',  NEW.created_at
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_video_event_notify
AFTER INSERT ON "video_event"
FOR EACH ROW EXECUTE FUNCTION notify_video_event();

-- Backfill video_job rows for any video already in 'validating' at deploy time.
-- Uses gen_random_uuid() through pgcrypto if available, else md5-based fallback ids.
INSERT INTO "video_job" ("id", "video_id", "stage", "attempt", "scheduled_at", "created_at", "updated_at")
SELECT
  substr(md5(random()::text || clock_timestamp()::text), 1, 25),
  "id",
  'validate',
  0,
  NOW(),
  NOW(),
  NOW()
FROM "video"
WHERE "status" = 'validating'
ON CONFLICT ("video_id") DO NOTHING;
