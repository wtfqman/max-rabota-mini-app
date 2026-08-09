CREATE TABLE "job_applications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "vacancy_ad_id" TEXT NOT NULL,
  "applicant_user_id" TEXT NOT NULL,
  "resume_ad_id" TEXT,
  "cover_message" TEXT,
  "contact_snapshot_json" TEXT NOT NULL,
  "resume_snapshot_json" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "viewed_at" DATETIME,
  "contacted_at" DATETIME,
  "decided_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "job_applications_vacancy_ad_id_fkey" FOREIGN KEY ("vacancy_ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "job_applications_applicant_user_id_fkey" FOREIGN KEY ("applicant_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "job_applications_resume_ad_id_fkey" FOREIGN KEY ("resume_ad_id") REFERENCES "ads" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "job_applications_vacancy_ad_id_status_created_at_idx" ON "job_applications"("vacancy_ad_id", "status", "created_at");
CREATE INDEX "job_applications_applicant_user_id_status_created_at_idx" ON "job_applications"("applicant_user_id", "status", "created_at");
CREATE INDEX "job_applications_resume_ad_id_idx" ON "job_applications"("resume_ad_id");
CREATE UNIQUE INDEX "job_applications_active_unique" ON "job_applications"("vacancy_ad_id", "applicant_user_id") WHERE "status" IN ('NEW', 'VIEWED', 'CONTACTED');
