CREATE TABLE "telegram_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "telegram_user_id" TEXT NOT NULL,
    "username" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "language_code" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "linked_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "telegram_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "telegram_targets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "chat_id" TEXT,
    "title" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISABLED',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "test_target" BOOLEAN NOT NULL DEFAULT false,
    "publish_enabled" BOOLEAN NOT NULL DEFAULT false,
    "edit_enabled" BOOLEAN NOT NULL DEFAULT false,
    "delete_enabled" BOOLEAN NOT NULL DEFAULT false,
    "bot_is_member" BOOLEAN NOT NULL DEFAULT false,
    "bot_is_admin" BOOLEAN NOT NULL DEFAULT false,
    "can_post_messages" BOOLEAN NOT NULL DEFAULT false,
    "can_edit_messages" BOOLEAN NOT NULL DEFAULT false,
    "can_delete_messages" BOOLEAN NOT NULL DEFAULT false,
    "can_send_media_messages" BOOLEAN NOT NULL DEFAULT false,
    "can_manage_topics" BOOLEAN NOT NULL DEFAULT false,
    "last_permission_check_at" DATETIME,
    "last_successful_publish_at" DATETIME,
    "last_error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "external_publications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ad_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "target_id" TEXT,
    "publication_version" INTEGER NOT NULL DEFAULT 1,
    "external_chat_id" TEXT,
    "external_message_id" TEXT,
    "external_media_group_id" TEXT,
    "external_url" TEXT,
    "source_platform" TEXT NOT NULL DEFAULT 'RABST24',
    "correlation_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "last_error" TEXT,
    "published_at" DATETIME,
    "edited_at" DATETIME,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "external_publications_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "external_publications_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "telegram_targets" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "telegram_media_group_buffers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telegram_user_id" TEXT NOT NULL,
    "media_group_id" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL,
    "first_received_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalize_at" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COLLECTING',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "telegram_media_group_buffers_telegram_user_id_fkey" FOREIGN KEY ("telegram_user_id") REFERENCES "telegram_accounts" ("telegram_user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "telegram_link_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telegram_account_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expires_at" DATETIME NOT NULL,
    "consumed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "telegram_link_tokens_telegram_account_id_fkey" FOREIGN KEY ("telegram_account_id") REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "telegram_accounts_telegram_user_id_key" ON "telegram_accounts"("telegram_user_id");
CREATE INDEX "telegram_accounts_user_id_idx" ON "telegram_accounts"("user_id");
CREATE INDEX "telegram_accounts_username_idx" ON "telegram_accounts"("username");
CREATE INDEX "telegram_accounts_status_idx" ON "telegram_accounts"("status");

CREATE UNIQUE INDEX "telegram_targets_username_key" ON "telegram_targets"("username");
CREATE UNIQUE INDEX "telegram_targets_chat_id_key" ON "telegram_targets"("chat_id");
CREATE INDEX "telegram_targets_type_idx" ON "telegram_targets"("type");
CREATE INDEX "telegram_targets_enabled_idx" ON "telegram_targets"("enabled");
CREATE INDEX "telegram_targets_test_target_idx" ON "telegram_targets"("test_target");
CREATE INDEX "telegram_targets_status_idx" ON "telegram_targets"("status");

CREATE UNIQUE INDEX "external_publications_ad_id_platform_target_id_publication_version_key" ON "external_publications"("ad_id", "platform", "target_id", "publication_version");
CREATE UNIQUE INDEX "external_publications_platform_external_chat_id_external_message_id_key" ON "external_publications"("platform", "external_chat_id", "external_message_id");
CREATE INDEX "external_publications_ad_id_platform_status_idx" ON "external_publications"("ad_id", "platform", "status");
CREATE INDEX "external_publications_target_id_status_idx" ON "external_publications"("target_id", "status");
CREATE INDEX "external_publications_correlation_id_idx" ON "external_publications"("correlation_id");

CREATE UNIQUE INDEX "telegram_media_group_buffers_telegram_user_id_media_group_id_key" ON "telegram_media_group_buffers"("telegram_user_id", "media_group_id");
CREATE INDEX "telegram_media_group_buffers_status_finalize_at_idx" ON "telegram_media_group_buffers"("status", "finalize_at");

CREATE UNIQUE INDEX "telegram_link_tokens_code_hash_key" ON "telegram_link_tokens"("code_hash");
CREATE INDEX "telegram_link_tokens_telegram_account_id_status_idx" ON "telegram_link_tokens"("telegram_account_id", "status");
CREATE INDEX "telegram_link_tokens_status_expires_at_idx" ON "telegram_link_tokens"("status", "expires_at");
