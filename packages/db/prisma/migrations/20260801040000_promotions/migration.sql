-- Additive promotion products and purchases.

ALTER TABLE "ads" ADD COLUMN "boosted_at" DATETIME;
ALTER TABLE "ads" ADD COLUMN "promotion_urgent_until" DATETIME;
ALTER TABLE "ads" ADD COLUMN "promotion_pinned_until" DATETIME;
ALTER TABLE "ads" ADD COLUMN "promotion_highlighted_until" DATETIME;
ALTER TABLE "ads" ADD COLUMN "promotion_recommended_until" DATETIME;

CREATE TABLE "promotion_products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "price_value" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "duration_hours" INTEGER,
    "applicable_ad_types_json" TEXT NOT NULL DEFAULT '[]',
    "configuration_json" TEXT,
    "channel_behavior_json" TEXT,
    "updated_by_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "promotion_products_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "promotion_purchases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_type" TEXT NOT NULL,
    "payment_id" TEXT,
    "amount_value" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "starts_at" DATETIME,
    "ends_at" DATETIME,
    "last_bumped_at" DATETIME,
    "configuration_snapshot_json" TEXT,
    "channel_behavior_snapshot_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "promotion_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "promotion_purchases_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "promotion_purchases_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "promotion_products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "promotion_purchases_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "ad_payments" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "promotion_products_type_key" ON "promotion_products"("type");
CREATE UNIQUE INDEX "promotion_purchases_payment_id_key" ON "promotion_purchases"("payment_id");
CREATE INDEX "promotion_products_enabled_type_idx" ON "promotion_products"("enabled", "type");
CREATE INDEX "promotion_products_updated_by_id_idx" ON "promotion_products"("updated_by_id");
CREATE INDEX "promotion_purchases_user_id_status_created_at_idx" ON "promotion_purchases"("user_id", "status", "created_at");
CREATE INDEX "promotion_purchases_ad_id_status_ends_at_idx" ON "promotion_purchases"("ad_id", "status", "ends_at");
CREATE INDEX "promotion_purchases_product_type_status_ends_at_idx" ON "promotion_purchases"("product_type", "status", "ends_at");
CREATE INDEX "promotion_purchases_payment_id_idx" ON "promotion_purchases"("payment_id");
CREATE INDEX "ads_promotion_pinned_until_idx" ON "ads"("promotion_pinned_until");
CREATE INDEX "ads_promotion_recommended_until_idx" ON "ads"("promotion_recommended_until");
CREATE INDEX "ads_promotion_urgent_until_idx" ON "ads"("promotion_urgent_until");
CREATE INDEX "ads_boosted_at_idx" ON "ads"("boosted_at");
