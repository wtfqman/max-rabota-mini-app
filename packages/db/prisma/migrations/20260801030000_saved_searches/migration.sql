-- Saved searches for all public ad categories.
CREATE TABLE "saved_searches" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ad_type" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "canonical_filters_json" TEXT NOT NULL,
  "notification_frequency" TEXT NOT NULL DEFAULT 'IMMEDIATE',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_matched_at" DATETIME,
  "deleted_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "saved_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "saved_search_matches" (
  "saved_search_id" TEXT NOT NULL,
  "ad_id" TEXT NOT NULL,
  "notified_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("saved_search_id", "ad_id"),
  CONSTRAINT "saved_search_matches_saved_search_id_fkey" FOREIGN KEY ("saved_search_id") REFERENCES "saved_searches" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "saved_search_matches_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "saved_searches_user_id_enabled_created_at_idx" ON "saved_searches"("user_id", "enabled", "created_at");
CREATE INDEX "saved_searches_ad_type_enabled_notification_frequency_idx" ON "saved_searches"("ad_type", "enabled", "notification_frequency");
CREATE INDEX "saved_searches_deleted_at_idx" ON "saved_searches"("deleted_at");
CREATE INDEX "saved_search_matches_ad_id_idx" ON "saved_search_matches"("ad_id");
CREATE INDEX "saved_search_matches_saved_search_id_notified_at_idx" ON "saved_search_matches"("saved_search_id", "notified_at");
