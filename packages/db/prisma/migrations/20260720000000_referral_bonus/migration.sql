CREATE TABLE "referrals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referrer_id" TEXT NOT NULL,
    "referred_id" TEXT NOT NULL,
    "rewarded_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "referrals_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "vacancy_publication_grants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'REFERRAL',
    "source_referral_id" TEXT,
    "publications" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vacancy_publication_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vacancy_publication_grants_source_referral_id_fkey" FOREIGN KEY ("source_referral_id") REFERENCES "referrals" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "referrals_referred_id_key" ON "referrals"("referred_id");
CREATE INDEX "referrals_referrer_id_created_at_idx" ON "referrals"("referrer_id", "created_at");
CREATE INDEX "referrals_rewarded_at_idx" ON "referrals"("rewarded_at");
CREATE UNIQUE INDEX "vacancy_publication_grants_source_referral_id_key" ON "vacancy_publication_grants"("source_referral_id");
CREATE INDEX "vacancy_publication_grants_user_id_created_at_idx" ON "vacancy_publication_grants"("user_id", "created_at");
CREATE INDEX "vacancy_publication_grants_source_idx" ON "vacancy_publication_grants"("source");
