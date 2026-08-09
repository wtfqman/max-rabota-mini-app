CREATE UNIQUE INDEX "job_applications_vacancy_ad_id_applicant_user_id_status_key"
ON "job_applications"("vacancy_ad_id", "applicant_user_id", "status");
