ALTER TABLE "vacancy_details" ADD COLUMN "payment_format" TEXT;
ALTER TABLE "vacancy_details" ADD COLUMN "provides_accommodation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vacancy_details" ADD COLUMN "provides_meals" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vacancy_details" ADD COLUMN "project_duration" TEXT;

ALTER TABLE "resume_details" ADD COLUMN "profession" TEXT;
ALTER TABLE "resume_details" ADD COLUMN "specialization" TEXT;
ALTER TABLE "resume_details" ADD COLUMN "experience_text" TEXT;
ALTER TABLE "resume_details" ADD COLUMN "desired_schedule" TEXT;
ALTER TABLE "resume_details" ADD COLUMN "travel_ready" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "resume_details" ADD COLUMN "site_accommodation_ready" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "equipment_details" ADD COLUMN "deal_type" TEXT;
ALTER TABLE "equipment_details" ADD COLUMN "hourly_price" REAL;
ALTER TABLE "equipment_details" ADD COLUMN "shift_price" REAL;
ALTER TABLE "equipment_details" ADD COLUMN "daily_price" REAL;
ALTER TABLE "equipment_details" ADD COLUMN "operator_included" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "equipment_details" ADD COLUMN "delivery_available" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "product_details" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ad_id" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "condition" TEXT,
    "quantity" REAL,
    "unit" TEXT,
    "sale_type" TEXT,
    "delivery_available" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "product_details_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "product_details_ad_id_key" ON "product_details"("ad_id");
CREATE INDEX "product_details_manufacturer_idx" ON "product_details"("manufacturer");
CREATE INDEX "product_details_model_idx" ON "product_details"("model");
CREATE INDEX "product_details_condition_idx" ON "product_details"("condition");
CREATE INDEX "product_details_sale_type_idx" ON "product_details"("sale_type");
