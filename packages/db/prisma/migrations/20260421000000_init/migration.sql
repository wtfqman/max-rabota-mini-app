-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "max_user_id" TEXT NOT NULL,
    "max_username" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "display_name" TEXT,
    "locale" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "started_at" DATETIME,
    "last_seen_at" DATETIME,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "city" TEXT,
    "district_text" TEXT,
    "about" TEXT,
    "avatar_url" TEXT,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_MODERATION',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "city" TEXT,
    "district_text" TEXT,
    "category_text" TEXT,
    "location_lat" REAL,
    "location_lon" REAL,
    "price_amount" REAL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "metadata_json" TEXT,
    "moderated_at" DATETIME,
    "published_at" DATETIME,
    "hidden_at" DATETIME,
    "archived_at" DATETIME,
    "expires_at" DATETIME,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vacancy_details" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ad_id" TEXT NOT NULL,
    "company_name" TEXT,
    "position" TEXT,
    "employment_type" TEXT,
    "work_format" TEXT,
    "salary_from" REAL,
    "salary_to" REAL,
    "salary_currency" TEXT NOT NULL DEFAULT 'RUB',
    "salary_period" TEXT,
    "is_salary_negotiable" BOOLEAN NOT NULL DEFAULT false,
    "schedule" TEXT,
    "experience" TEXT,
    "education" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "vacancy_details_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "resume_details" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ad_id" TEXT NOT NULL,
    "desired_position" TEXT,
    "experience_years" INTEGER,
    "employment_type" TEXT,
    "work_format" TEXT,
    "expected_salary" REAL,
    "salary_currency" TEXT NOT NULL DEFAULT 'RUB',
    "skills_json" TEXT,
    "education" TEXT,
    "availability" TEXT,
    "portfolio_url" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "resume_details_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "equipment_details" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ad_id" TEXT NOT NULL,
    "category_text" TEXT,
    "condition" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "production_year" INTEGER,
    "rental_price" REAL,
    "sale_price" REAL,
    "deposit_amount" REAL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "availability" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "equipment_details_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ad_photos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ad_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "preview_url" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "alt_text" TEXT,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ad_photos_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ad_contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ad_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "value" TEXT NOT NULL,
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ad_contacts_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "metro_stations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "city" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "line_name" TEXT,
    "line_color" TEXT,
    "external_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "vacancy_metro_stations" (
    "vacancy_details_id" TEXT NOT NULL,
    "metro_station_id" TEXT NOT NULL,
    "walking_minutes" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("vacancy_details_id", "metro_station_id"),
    CONSTRAINT "vacancy_metro_stations_vacancy_details_id_fkey" FOREIGN KEY ("vacancy_details_id") REFERENCES "vacancy_details" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vacancy_metro_stations_metro_station_id_fkey" FOREIGN KEY ("metro_station_id") REFERENCES "metro_stations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ad_requirements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ad_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ad_requirements_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ad_responsibilities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ad_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ad_responsibilities_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ad_benefits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ad_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ad_benefits_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "favorites_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "author_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "ad_id" TEXT,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "moderation_reason" TEXT,
    "published_at" DATETIME,
    "moderated_at" DATETIME,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reviews_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reviews_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "moderation_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ad_id" TEXT NOT NULL,
    "moderator_id" TEXT,
    "action" TEXT NOT NULL,
    "status_from" TEXT,
    "status_to" TEXT,
    "reason" TEXT,
    "comment" TEXT,
    "metadata_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "moderation_logs_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "moderation_logs_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "channel_publish_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ad_id" TEXT NOT NULL,
    "channel_id" TEXT,
    "channel_url" TEXT,
    "max_chat_id" TEXT,
    "max_message_id" TEXT,
    "max_message_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error_code" TEXT,
    "error_message" TEXT,
    "payload_json" TEXT,
    "published_text" TEXT,
    "scheduled_at" DATETIME,
    "published_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "channel_publish_logs_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_max_user_id_key" ON "users"("max_user_id");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_max_username_idx" ON "users"("max_username");

-- CreateIndex
CREATE INDEX "users_last_seen_at_idx" ON "users"("last_seen_at");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE INDEX "user_profiles_city_idx" ON "user_profiles"("city");

-- CreateIndex
CREATE INDEX "user_profiles_district_text_idx" ON "user_profiles"("district_text");

-- CreateIndex
CREATE INDEX "user_profiles_deleted_at_idx" ON "user_profiles"("deleted_at");

-- CreateIndex
CREATE INDEX "ads_owner_id_idx" ON "ads"("owner_id");

-- CreateIndex
CREATE INDEX "ads_owner_id_status_updated_at_idx" ON "ads"("owner_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "ads_type_status_idx" ON "ads"("type", "status");

-- CreateIndex
CREATE INDEX "ads_type_status_published_at_idx" ON "ads"("type", "status", "published_at");

-- CreateIndex
CREATE INDEX "ads_status_moderated_at_idx" ON "ads"("status", "moderated_at");

-- CreateIndex
CREATE INDEX "ads_city_idx" ON "ads"("city");

-- CreateIndex
CREATE INDEX "ads_district_text_idx" ON "ads"("district_text");

-- CreateIndex
CREATE INDEX "ads_category_text_idx" ON "ads"("category_text");

-- CreateIndex
CREATE INDEX "ads_published_at_idx" ON "ads"("published_at");

-- CreateIndex
CREATE INDEX "ads_deleted_at_idx" ON "ads"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "vacancy_details_ad_id_key" ON "vacancy_details"("ad_id");

-- CreateIndex
CREATE INDEX "vacancy_details_employment_type_idx" ON "vacancy_details"("employment_type");

-- CreateIndex
CREATE INDEX "vacancy_details_work_format_idx" ON "vacancy_details"("work_format");

-- CreateIndex
CREATE INDEX "vacancy_details_salary_from_idx" ON "vacancy_details"("salary_from");

-- CreateIndex
CREATE UNIQUE INDEX "resume_details_ad_id_key" ON "resume_details"("ad_id");

-- CreateIndex
CREATE INDEX "resume_details_desired_position_idx" ON "resume_details"("desired_position");

-- CreateIndex
CREATE INDEX "resume_details_experience_years_idx" ON "resume_details"("experience_years");

-- CreateIndex
CREATE INDEX "resume_details_employment_type_idx" ON "resume_details"("employment_type");

-- CreateIndex
CREATE INDEX "resume_details_work_format_idx" ON "resume_details"("work_format");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_details_ad_id_key" ON "equipment_details"("ad_id");

-- CreateIndex
CREATE INDEX "equipment_details_category_text_idx" ON "equipment_details"("category_text");

-- CreateIndex
CREATE INDEX "equipment_details_condition_idx" ON "equipment_details"("condition");

-- CreateIndex
CREATE INDEX "equipment_details_brand_idx" ON "equipment_details"("brand");

-- CreateIndex
CREATE INDEX "equipment_details_model_idx" ON "equipment_details"("model");

-- CreateIndex
CREATE UNIQUE INDEX "ad_photos_storage_key_key" ON "ad_photos"("storage_key");

-- CreateIndex
CREATE INDEX "ad_photos_ad_id_sort_order_idx" ON "ad_photos"("ad_id", "sort_order");

-- CreateIndex
CREATE INDEX "ad_photos_deleted_at_idx" ON "ad_photos"("deleted_at");

-- CreateIndex
CREATE INDEX "ad_contacts_ad_id_sort_order_idx" ON "ad_contacts"("ad_id", "sort_order");

-- CreateIndex
CREATE INDEX "ad_contacts_ad_id_type_idx" ON "ad_contacts"("ad_id", "type");

-- CreateIndex
CREATE INDEX "ad_contacts_deleted_at_idx" ON "ad_contacts"("deleted_at");

-- CreateIndex
CREATE INDEX "metro_stations_city_idx" ON "metro_stations"("city");

-- CreateIndex
CREATE INDEX "metro_stations_is_active_idx" ON "metro_stations"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "metro_stations_city_name_line_name_key" ON "metro_stations"("city", "name", "line_name");

-- CreateIndex
CREATE INDEX "vacancy_metro_stations_metro_station_id_idx" ON "vacancy_metro_stations"("metro_station_id");

-- CreateIndex
CREATE INDEX "vacancy_metro_stations_vacancy_details_id_sort_order_idx" ON "vacancy_metro_stations"("vacancy_details_id", "sort_order");

-- CreateIndex
CREATE INDEX "ad_requirements_ad_id_sort_order_idx" ON "ad_requirements"("ad_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "ad_requirements_ad_id_sort_order_key" ON "ad_requirements"("ad_id", "sort_order");

-- CreateIndex
CREATE INDEX "ad_responsibilities_ad_id_sort_order_idx" ON "ad_responsibilities"("ad_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "ad_responsibilities_ad_id_sort_order_key" ON "ad_responsibilities"("ad_id", "sort_order");

-- CreateIndex
CREATE INDEX "ad_benefits_ad_id_sort_order_idx" ON "ad_benefits"("ad_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "ad_benefits_ad_id_sort_order_key" ON "ad_benefits"("ad_id", "sort_order");

-- CreateIndex
CREATE INDEX "favorites_user_id_created_at_idx" ON "favorites"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "favorites_ad_id_idx" ON "favorites"("ad_id");

-- CreateIndex
CREATE INDEX "favorites_deleted_at_idx" ON "favorites"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_ad_id_key" ON "favorites"("user_id", "ad_id");

-- CreateIndex
CREATE INDEX "reviews_author_id_idx" ON "reviews"("author_id");

-- CreateIndex
CREATE INDEX "reviews_subject_id_status_idx" ON "reviews"("subject_id", "status");

-- CreateIndex
CREATE INDEX "reviews_ad_id_idx" ON "reviews"("ad_id");

-- CreateIndex
CREATE INDEX "reviews_status_idx" ON "reviews"("status");

-- CreateIndex
CREATE INDEX "reviews_deleted_at_idx" ON "reviews"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_author_id_subject_id_ad_id_key" ON "reviews"("author_id", "subject_id", "ad_id");

-- CreateIndex
CREATE INDEX "moderation_logs_ad_id_created_at_idx" ON "moderation_logs"("ad_id", "created_at");

-- CreateIndex
CREATE INDEX "moderation_logs_moderator_id_idx" ON "moderation_logs"("moderator_id");

-- CreateIndex
CREATE INDEX "moderation_logs_action_idx" ON "moderation_logs"("action");

-- CreateIndex
CREATE INDEX "moderation_logs_status_to_idx" ON "moderation_logs"("status_to");

-- CreateIndex
CREATE INDEX "moderation_logs_created_at_idx" ON "moderation_logs"("created_at");

-- CreateIndex
CREATE INDEX "channel_publish_logs_ad_id_created_at_idx" ON "channel_publish_logs"("ad_id", "created_at");

-- CreateIndex
CREATE INDEX "channel_publish_logs_status_idx" ON "channel_publish_logs"("status");

-- CreateIndex
CREATE INDEX "channel_publish_logs_channel_id_idx" ON "channel_publish_logs"("channel_id");

-- CreateIndex
CREATE INDEX "channel_publish_logs_max_chat_id_idx" ON "channel_publish_logs"("max_chat_id");

-- CreateIndex
CREATE INDEX "channel_publish_logs_published_at_idx" ON "channel_publish_logs"("published_at");
