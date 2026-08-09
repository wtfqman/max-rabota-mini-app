-- Verified resume contacts and safe connection entitlements.
-- Additive only: legacy ad_contacts remain unchanged and are not marked verified.

ALTER TABLE "resume_details" ADD COLUMN "verified_contact_id" TEXT;
ALTER TABLE "resume_details" ADD COLUMN "contact_consent_id" TEXT;
ALTER TABLE "resume_details" ADD COLUMN "contact_availability_status" TEXT NOT NULL DEFAULT 'UNVERIFIED_LEGACY';

ALTER TABLE "resume_contact_unlocks" ADD COLUMN "verified_contact_id" TEXT;
ALTER TABLE "resume_contact_unlocks" ADD COLUMN "consent_id" TEXT;
ALTER TABLE "resume_contact_unlocks" ADD COLUMN "access_mode" TEXT NOT NULL DEFAULT 'MAX_VERIFIED_CONNECTION';

CREATE TABLE "verified_contacts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "normalized_value_encrypted" TEXT NOT NULL,
  "masked_value" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "max_user_id" TEXT,
  "verified_at" DATETIME,
  "verification_auth_date" DATETIME,
  "verification_hash_fingerprint" TEXT,
  "expires_at" DATETIME,
  "revoked_at" DATETIME,
  "last_confirmed_at" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "verified_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "contact_disclosure_consents" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "verified_contact_id" TEXT NOT NULL,
  "consent_type" TEXT NOT NULL,
  "document_version" TEXT NOT NULL,
  "accepted_at" DATETIME NOT NULL,
  "revoked_at" DATETIME,
  "ip_hash" TEXT,
  "session_metadata_json" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_disclosure_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contact_disclosure_consents_verified_contact_id_fkey" FOREIGN KEY ("verified_contact_id") REFERENCES "verified_contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "contact_access_entitlements" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "buyer_user_id" TEXT NOT NULL,
  "resume_ad_id" TEXT NOT NULL,
  "author_user_id" TEXT NOT NULL,
  "verified_contact_id" TEXT NOT NULL,
  "consent_id" TEXT NOT NULL,
  "payment_id" TEXT,
  "legacy_unlock_id" TEXT,
  "access_mode" TEXT NOT NULL DEFAULT 'MAX_VERIFIED_CONNECTION',
  "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  "granted_at" DATETIME,
  "expires_at" DATETIME,
  "revoked_at" DATETIME,
  "dispute_id" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "contact_access_entitlements_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contact_access_entitlements_resume_ad_id_fkey" FOREIGN KEY ("resume_ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contact_access_entitlements_verified_contact_id_fkey" FOREIGN KEY ("verified_contact_id") REFERENCES "verified_contacts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contact_access_entitlements_consent_id_fkey" FOREIGN KEY ("consent_id") REFERENCES "contact_disclosure_consents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contact_access_entitlements_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "ad_payments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "contact_access_entitlements_legacy_unlock_id_fkey" FOREIGN KEY ("legacy_unlock_id") REFERENCES "resume_contact_unlocks" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "contact_disputes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entitlement_id" TEXT NOT NULL,
  "buyer_user_id" TEXT NOT NULL,
  "author_user_id" TEXT NOT NULL,
  "resume_ad_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "comment" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "opened_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "evidence_json" TEXT,
  "author_reverify_deadline" DATETIME,
  "resolved_by" TEXT,
  "resolution" TEXT,
  "refund_payment_id" TEXT,
  "resolved_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "contact_disputes_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "contact_access_entitlements" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contact_disputes_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contact_disputes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contact_disputes_resume_ad_id_fkey" FOREIGN KEY ("resume_ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contact_disputes_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "contact_access_entitlements_payment_id_key" ON "contact_access_entitlements"("payment_id");
CREATE UNIQUE INDEX "contact_access_entitlements_legacy_unlock_id_key" ON "contact_access_entitlements"("legacy_unlock_id");
CREATE UNIQUE INDEX "contact_access_entitlements_dispute_id_key" ON "contact_access_entitlements"("dispute_id");
CREATE UNIQUE INDEX "contact_access_entitlements_buyer_resume_contact_mode_status_key" ON "contact_access_entitlements"("buyer_user_id", "resume_ad_id", "verified_contact_id", "access_mode", "status");
CREATE UNIQUE INDEX "contact_disputes_entitlement_id_key" ON "contact_disputes"("entitlement_id");

CREATE INDEX "resume_details_verified_contact_id_idx" ON "resume_details"("verified_contact_id");
CREATE INDEX "resume_details_contact_consent_id_idx" ON "resume_details"("contact_consent_id");
CREATE INDEX "resume_details_contact_availability_status_idx" ON "resume_details"("contact_availability_status");
CREATE INDEX "resume_contact_unlocks_verified_contact_id_idx" ON "resume_contact_unlocks"("verified_contact_id");
CREATE INDEX "resume_contact_unlocks_consent_id_idx" ON "resume_contact_unlocks"("consent_id");
CREATE UNIQUE INDEX "resume_contact_unlocks_buyer_resume_contact_mode_key" ON "resume_contact_unlocks"("buyer_user_id", "resume_ad_id", "verified_contact_id", "access_mode");
CREATE INDEX "verified_contacts_user_id_status_idx" ON "verified_contacts"("user_id", "status");
CREATE INDEX "verified_contacts_max_user_id_idx" ON "verified_contacts"("max_user_id");
CREATE INDEX "verified_contacts_expires_at_idx" ON "verified_contacts"("expires_at");
CREATE INDEX "verified_contacts_status_expires_at_idx" ON "verified_contacts"("status", "expires_at");
CREATE INDEX "contact_disclosure_consents_user_type_accepted_idx" ON "contact_disclosure_consents"("user_id", "consent_type", "accepted_at");
CREATE INDEX "contact_disclosure_consents_contact_type_revoked_idx" ON "contact_disclosure_consents"("verified_contact_id", "consent_type", "revoked_at");
CREATE INDEX "contact_access_entitlements_buyer_status_created_idx" ON "contact_access_entitlements"("buyer_user_id", "status", "created_at");
CREATE INDEX "contact_access_entitlements_resume_status_idx" ON "contact_access_entitlements"("resume_ad_id", "status");
CREATE INDEX "contact_access_entitlements_contact_status_idx" ON "contact_access_entitlements"("verified_contact_id", "status");
CREATE INDEX "contact_access_entitlements_author_status_idx" ON "contact_access_entitlements"("author_user_id", "status");
CREATE INDEX "contact_disputes_status_opened_idx" ON "contact_disputes"("status", "opened_at");
CREATE INDEX "contact_disputes_buyer_status_idx" ON "contact_disputes"("buyer_user_id", "status");
CREATE INDEX "contact_disputes_author_status_idx" ON "contact_disputes"("author_user_id", "status");
CREATE INDEX "contact_disputes_resume_status_idx" ON "contact_disputes"("resume_ad_id", "status");
