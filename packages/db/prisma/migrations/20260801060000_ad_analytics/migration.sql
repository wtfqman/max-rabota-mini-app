-- Daily ad analytics aggregates. Unique view rows store only a non-reversible visitor hash.

CREATE TABLE "ad_metric_daily" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ad_id" TEXT NOT NULL,
  "date" DATETIME NOT NULL,
  "views" INTEGER NOT NULL DEFAULT 0,
  "unique_views" INTEGER NOT NULL DEFAULT 0,
  "favorite_adds" INTEGER NOT NULL DEFAULT 0,
  "favorite_removes" INTEGER NOT NULL DEFAULT 0,
  "contact_opens" INTEGER NOT NULL DEFAULT 0,
  "phone_clicks" INTEGER NOT NULL DEFAULT 0,
  "email_clicks" INTEGER NOT NULL DEFAULT 0,
  "max_clicks" INTEGER NOT NULL DEFAULT 0,
  "website_clicks" INTEGER NOT NULL DEFAULT 0,
  "applications" INTEGER NOT NULL DEFAULT 0,
  "contact_unlocks" INTEGER NOT NULL DEFAULT 0,
  "promotion_purchases" INTEGER NOT NULL DEFAULT 0,
  "internal_events" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "ad_metric_daily_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ad_metric_unique_views" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ad_id" TEXT NOT NULL,
  "date" DATETIME NOT NULL,
  "visitor_hash" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ad_metric_unique_views_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ad_metric_daily_ad_id_date_key" ON "ad_metric_daily"("ad_id", "date");
CREATE INDEX "ad_metric_daily_date_idx" ON "ad_metric_daily"("date");
CREATE INDEX "ad_metric_daily_ad_id_date_idx" ON "ad_metric_daily"("ad_id", "date");
CREATE UNIQUE INDEX "ad_metric_unique_views_ad_id_date_visitor_hash_key" ON "ad_metric_unique_views"("ad_id", "date", "visitor_hash");
CREATE INDEX "ad_metric_unique_views_date_idx" ON "ad_metric_unique_views"("date");
