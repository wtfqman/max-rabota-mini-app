CREATE TABLE "ad_payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ad_id" TEXT NOT NULL,
    "yookassa_payment_id" TEXT NOT NULL,
    "yookassa_refund_id" TEXT,
    "idempotence_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount_value" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "confirmation_url" TEXT,
    "paid_at" DATETIME,
    "canceled_at" DATETIME,
    "refunded_at" DATETIME,
    "raw_payload_json" TEXT,
    "refund_payload_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ad_payments_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ad_payments_yookassa_payment_id_key" ON "ad_payments"("yookassa_payment_id");
CREATE UNIQUE INDEX "ad_payments_yookassa_refund_id_key" ON "ad_payments"("yookassa_refund_id");
CREATE UNIQUE INDEX "ad_payments_idempotence_key_key" ON "ad_payments"("idempotence_key");
CREATE INDEX "ad_payments_ad_id_created_at_idx" ON "ad_payments"("ad_id", "created_at");
CREATE INDEX "ad_payments_ad_id_status_idx" ON "ad_payments"("ad_id", "status");
CREATE INDEX "ad_payments_status_idx" ON "ad_payments"("status");
