-- User reports for ads. Reports are moderation records, not visitor analytics.

ALTER TABLE "users" ADD COLUMN "blocked_until" DATETIME;

CREATE TABLE "ad_reports" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reporter_user_id" TEXT NOT NULL,
  "ad_id" TEXT NOT NULL,
  "reported_user_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "comment" TEXT,
  "evidence_json" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "moderator_id" TEXT,
  "resolution" TEXT,
  "resolved_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "ad_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ad_reports_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ad_reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ad_reports_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ad_report_status_history" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "report_id" TEXT NOT NULL,
  "moderator_id" TEXT,
  "action" TEXT NOT NULL,
  "status_from" TEXT,
  "status_to" TEXT NOT NULL,
  "ad_status_from" TEXT,
  "ad_status_to" TEXT,
  "user_status_from" TEXT,
  "user_status_to" TEXT,
  "reason" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ad_report_status_history_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "ad_reports" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ad_report_status_history_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ad_reports_reporter_user_id_ad_id_status_key" ON "ad_reports"("reporter_user_id", "ad_id", "status");
CREATE INDEX "ad_reports_status_created_at_idx" ON "ad_reports"("status", "created_at");
CREATE INDEX "ad_reports_ad_id_status_idx" ON "ad_reports"("ad_id", "status");
CREATE INDEX "ad_reports_reported_user_id_status_idx" ON "ad_reports"("reported_user_id", "status");
CREATE INDEX "ad_reports_moderator_id_idx" ON "ad_reports"("moderator_id");
CREATE INDEX "ad_report_status_history_report_id_created_at_idx" ON "ad_report_status_history"("report_id", "created_at");
CREATE INDEX "ad_report_status_history_moderator_id_created_at_idx" ON "ad_report_status_history"("moderator_id", "created_at");
