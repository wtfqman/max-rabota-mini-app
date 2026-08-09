CREATE TABLE "user_vacancy_publication_balances" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "purchased" INTEGER NOT NULL DEFAULT 0,
    "bonus" INTEGER NOT NULL DEFAULT 0,
    "used" INTEGER NOT NULL DEFAULT 0,
    "remaining" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_vacancy_publication_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "vacancy_publication_usages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'PACKAGE',
    "returned_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "vacancy_publication_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vacancy_publication_usages_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "vacancy_publication_usages_ad_id_key" ON "vacancy_publication_usages"("ad_id");
CREATE INDEX "vacancy_publication_usages_user_id_created_at_idx" ON "vacancy_publication_usages"("user_id", "created_at");
CREATE INDEX "vacancy_publication_usages_user_id_returned_at_idx" ON "vacancy_publication_usages"("user_id", "returned_at");

ALTER TABLE "ad_payments" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'VACANCY_PUBLICATION';
ALTER TABLE "ad_payments" ADD COLUMN "package_publications" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ad_payments" ADD COLUMN "includes_media_highlight" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ad_payments" ADD COLUMN "applied_at" DATETIME;
