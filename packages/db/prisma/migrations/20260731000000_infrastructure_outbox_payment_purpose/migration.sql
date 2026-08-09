CREATE TABLE "outbox_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload_json" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_attempt_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" DATETIME,
    "locked_by" TEXT,
    "completed_at" DATETIME,
    "last_error" TEXT,
    "result_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "outbox_jobs_idempotency_key_key" ON "outbox_jobs"("idempotency_key");
CREATE INDEX "outbox_jobs_status_next_attempt_at_idx" ON "outbox_jobs"("status", "next_attempt_at");
CREATE INDEX "outbox_jobs_status_locked_at_idx" ON "outbox_jobs"("status", "locked_at");
CREATE INDEX "outbox_jobs_type_status_idx" ON "outbox_jobs"("type", "status");

ALTER TABLE "ad_payments" ADD COLUMN "purpose_code" TEXT NOT NULL DEFAULT 'VACANCY_PACKAGE';
ALTER TABLE "ad_payments" ADD COLUMN "purpose_components_json" TEXT;
