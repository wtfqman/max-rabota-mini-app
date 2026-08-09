CREATE TABLE "resume_contact_unlocks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "buyer_user_id" TEXT NOT NULL,
  "resume_ad_id" TEXT NOT NULL,
  "payment_id" TEXT,
  "amount" TEXT NOT NULL DEFAULT '20.00',
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "unlocked_at" DATETIME,
  "refunded_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "resume_contact_unlocks_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "resume_contact_unlocks_resume_ad_id_fkey" FOREIGN KEY ("resume_ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "resume_contact_unlocks_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "ad_payments" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "resume_contact_unlocks_payment_id_key" ON "resume_contact_unlocks"("payment_id");
CREATE UNIQUE INDEX "resume_contact_unlocks_buyer_user_id_resume_ad_id_key" ON "resume_contact_unlocks"("buyer_user_id", "resume_ad_id");
CREATE INDEX "resume_contact_unlocks_buyer_user_id_status_created_at_idx" ON "resume_contact_unlocks"("buyer_user_id", "status", "created_at");
CREATE INDEX "resume_contact_unlocks_resume_ad_id_status_idx" ON "resume_contact_unlocks"("resume_ad_id", "status");
CREATE INDEX "resume_contact_unlocks_payment_id_idx" ON "resume_contact_unlocks"("payment_id");
