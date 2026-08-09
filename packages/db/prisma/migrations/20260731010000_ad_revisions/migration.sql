CREATE TABLE "ad_revisions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ad_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "data_json" TEXT NOT NULL,
    "media_json" TEXT,
    "created_by" TEXT NOT NULL,
    "payment_id" TEXT,
    "submitted_at" DATETIME,
    "approved_at" DATETIME,
    "rejected_at" DATETIME,
    "rejection_reason" TEXT,
    "cancelled_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ad_revisions_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ad_revisions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ad_revisions_ad_id_version_key" ON "ad_revisions"("ad_id", "version");
CREATE UNIQUE INDEX "ad_revisions_payment_id_key" ON "ad_revisions"("payment_id");
CREATE INDEX "ad_revisions_ad_id_status_created_at_idx" ON "ad_revisions"("ad_id", "status", "created_at");
CREATE INDEX "ad_revisions_created_by_status_created_at_idx" ON "ad_revisions"("created_by", "status", "created_at");
CREATE INDEX "ad_revisions_payment_id_idx" ON "ad_revisions"("payment_id");
