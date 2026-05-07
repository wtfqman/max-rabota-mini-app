# Rabst24 Architecture

Rabst24 is a MAX-first classifieds platform where the bot is only an entry point and the mini app is the main product.

## High-Level Shape

The project is a monorepo with three applications and shared packages:

- `apps/api` - backend API, MAX webhook endpoint, healthcheck, HTTP error boundary.
- `apps/bot` - long polling bot process for development or worker-style deployments.
- `apps/web` - MAX mini app frontend on React, Vite, React Router, Zustand, Tailwind.
- `packages/db` - Prisma schema, Prisma Client singleton, migrations.
- `packages/core` - business services, repositories, serializers, channel post formatter.
- `packages/bot-core` - bot update router, `/start` handler, keyboards.
- `packages/max-api` - typed MAX Bot API HTTP client.
- `packages/shared` - DTO schemas, domain constants, shared errors and helpers.
- `packages/config` - environment parsing and pino logger.

## Boundaries

The bot does not contain classifieds UX. It only handles:

- `/start`
- registration or last-seen update
- welcome message
- open mini app button
- optional channel link button

The mini app owns user workflows:

- vacancies
- resumes
- equipment
- creating ads
- profile
- favorites
- reviews
- moderation screens for moderators

The API owns validation, authorization, persistence, moderation state changes, and channel publication orchestration.

## Domain Entities

- `User` - MAX-linked account, role, status, last activity.
- `Profile` - city, about, avatar, contact profile.
- `Ad` - common ad aggregate for vacancy, resume, and equipment.
- `VacancyDetails` - vacancy-specific fields.
- `ResumeDetails` - resume-specific fields.
- `EquipmentDetails` - equipment-specific fields.
- `categoryText` - normalized free-text category, designed to migrate to a future dictionary.
- `districtText` - normalized free-text district, designed to migrate to a future dictionary.
- `ContactMethod` - public contact methods for profile or ad.
- `Photo` - profile or ad photos.
- `AdRequirement`, `AdResponsibility`, `AdBenefit` - structured vacancy blocks.
- `ModerationLog` - audit trail for moderation actions.
- `Favorite` - user-ad favorite relation.
- `Review` - user reviews.
- `ChannelPublishLog` - channel publication attempts, status, payload and errors.

## Service Layer

- `UserService` registers users from MAX and keeps profile initialization idempotent.
- `AdService` creates typed ads as `PENDING_MODERATION`, lists public approved/published ads, and owns current-user edit/hide/resubmit flows.
- `ModerationService` transitions ads through moderation states and writes audit logs.
- `ChannelPublishingService` records publication attempts and sends prepared channel posts via MAX API.
- `ChannelPostFormatter` keeps a single publication style for all ad types.
- `FavoriteRepository` and `ReviewRepository` keep favorite/review persistence independent from frontend state.

Repositories are thin Prisma adapters. Services contain business rules. API routes only parse DTOs, call services, and serialize responses.

## DTOs and Serializers

DTO schemas live in `packages/shared/src/dto` and use Zod:

- `createAdSchema`
- `adListQuerySchema`
- `rejectAdSchema`
- `createReviewSchema`
- `paginationQuerySchema`
- reference suggestion schemas for category and district autocomplete

Serializers live close to domain services in `packages/core`:

- `serializeAd`
- `serializeUser`

This keeps API responses stable even if Prisma models evolve.

## First-Version Flow

1. User opens bot and taps the mini app button.
2. Mini app verifies MAX launch data through `/api/auth/max/verify`.
3. User creates vacancy, resume, or equipment ad.
4. API stores the ad with `PENDING_MODERATION`.
5. Moderator approves or rejects it.
6. Approved ad becomes visible in mini app.
7. Channel publication is enqueued and sent with the unified channel post template.
8. Publication result is saved to `ChannelPublishLog`.

## Future Expansion

Paid features:

- add `BillingAccount`, `Payment`, `PaidFeature`, `AdBoost` modules without changing bot handlers.
- paid capabilities attach to `Ad` or `User`, not to the bot UI.

Autopublication:

- add `PublicationRule` and queue worker.
- keep `ChannelPublishLog` as the audit source.

Map:

- current `locationLat` and `locationLon` fields already support geo search.
- add geospatial indexes or PostGIS later without changing API contracts.

References:

- current `categoryText` and `districtText` support free text with normalization and suggestions.
- future `Category` and `District` tables can be added next to the text fields, then backfilled gradually.

Admin panel:

- first version uses protected mini app routes for moderation.
- a separate admin frontend can be added later as `apps/admin` using the same API modules.

## Scaling

- API and bot can be deployed independently.
- Long polling can be disabled in production while webhook stays in `apps/api`.
- Shared services prevent duplicated business rules across bot, API, and future workers.
- Channel publication can move from inline execution to a queue worker without changing public API.
- Prisma schema keeps moderation and publication audit logs append-only, which helps operations and support.
