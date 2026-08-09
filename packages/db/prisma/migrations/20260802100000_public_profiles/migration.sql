ALTER TABLE "user_profiles" ADD COLUMN "profile_type" TEXT NOT NULL DEFAULT 'PERSON';
ALTER TABLE "user_profiles" ADD COLUMN "company_name" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "phone" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "email" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "website" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "max_contact" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "specialization" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "experience" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "company_info" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "registration_details" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "show_phone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_profiles" ADD COLUMN "show_email" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_profiles" ADD COLUMN "show_website" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_profiles" ADD COLUMN "show_max_contact" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_profiles" ADD COLUMN "allow_resume_public_profile" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "user_trust_badge_assignments" (
  "user_id" TEXT NOT NULL,
  "badge" TEXT NOT NULL,
  "assigned_by_id" TEXT,
  "reason" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "user_trust_badge_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_trust_badge_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  PRIMARY KEY ("user_id", "badge")
);

CREATE TABLE "user_trust_badge_history" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "badge" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "moderator_id" TEXT,
  "reason" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_trust_badge_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_trust_badge_history_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "user_profiles_profile_type_idx" ON "user_profiles"("profile_type");
CREATE INDEX "user_trust_badge_assignments_badge_idx" ON "user_trust_badge_assignments"("badge");
CREATE INDEX "user_trust_badge_assignments_assigned_by_id_idx" ON "user_trust_badge_assignments"("assigned_by_id");
CREATE INDEX "user_trust_badge_history_user_id_created_at_idx" ON "user_trust_badge_history"("user_id", "created_at");
CREATE INDEX "user_trust_badge_history_badge_created_at_idx" ON "user_trust_badge_history"("badge", "created_at");
CREATE INDEX "user_trust_badge_history_moderator_id_created_at_idx" ON "user_trust_badge_history"("moderator_id", "created_at");
