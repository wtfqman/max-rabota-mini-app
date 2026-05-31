-- Add reusable MAX media metadata, admin lifecycle flags, and channel removal metadata.
ALTER TABLE "ads" ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ad_photos" ADD COLUMN "max_media_token" TEXT;
ALTER TABLE "ad_photos" ADD COLUMN "max_media_type" TEXT;
ALTER TABLE "ad_photos" ADD COLUMN "max_media_strategy" TEXT;
ALTER TABLE "ad_photos" ADD COLUMN "max_media_payload_json" TEXT;
ALTER TABLE "ad_photos" ADD COLUMN "max_media_uploaded_at" DATETIME;

ALTER TABLE "channel_publish_logs" ADD COLUMN "media_strategy" TEXT;
ALTER TABLE "channel_publish_logs" ADD COLUMN "media_attachment_json" TEXT;
ALTER TABLE "channel_publish_logs" ADD COLUMN "removed_at" DATETIME;
ALTER TABLE "channel_publish_logs" ADD COLUMN "remove_error_message" TEXT;

CREATE INDEX "ads_is_test_idx" ON "ads"("is_test");
CREATE INDEX "ad_photos_max_media_token_idx" ON "ad_photos"("max_media_token");
