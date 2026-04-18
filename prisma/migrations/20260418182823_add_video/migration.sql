-- CreateTable
CREATE TABLE "video" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',
    "original_filename" VARCHAR(255) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "duration_seconds" DECIMAL(10,3),
    "container_format" VARCHAR(8) NOT NULL,
    "storage_path" VARCHAR(512) NOT NULL,
    "thumbnail_path" VARCHAR(512),
    "status" VARCHAR(16) NOT NULL DEFAULT 'validating',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "video_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_video_status" CHECK ("status" IN ('validating','transcribing','summarizing','ready','failed')),
    CONSTRAINT "ck_video_size_positive" CHECK ("size_bytes" > 0)
);

-- CreateIndex
CREATE INDEX "ix_video_user_id_created_at" ON "video"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_video_status" ON "video"("status");

-- AddForeignKey
ALTER TABLE "video" ADD CONSTRAINT "video_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
