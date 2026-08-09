DROP INDEX IF EXISTS "vacancy_publication_usages_ad_id_key";

CREATE INDEX IF NOT EXISTS "vacancy_publication_usages_ad_id_created_at_idx"
ON "vacancy_publication_usages"("ad_id", "created_at");
