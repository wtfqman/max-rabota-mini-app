# Rabst24 Mini App API

Base path: `/api`

Legacy `/api/v1` routes are still mounted for backwards compatibility.

Routes marked as reserved are intentionally left as extension points for later releases.

## Auth

- `POST /auth/max/verify` - verify MAX mini app launch data, create or update user, return app session payload.
- `POST /auth/refresh` - reserved for persistent refresh sessions.
- `POST /auth/logout` - reserved for session revocation.

## Users and Profiles

- `GET /users/me` - current user, profile, role, and ad counters.
- `PATCH /users/me` - update lightweight account/profile fields.
- `GET /profiles/me` - current user's editable profile.
- `PATCH /profiles/me` - update city, district, about, avatar.
- `GET /users/:userId` - reserved for public user profile.

## Public Ads

- `GET /ads` - public search across vacancies, resumes, equipment, materials, and tools.
- `GET /ads/:adId` - public detail payload for any visible ad type.
- `GET /vacancies` - vacancy list with search, category, district, schedule, experience filters.
- `GET /vacancies/:adId` - vacancy detail.
- `GET /resumes` - resume list.
- `GET /resumes/:adId` - resume detail.
- `GET /equipment` - equipment list.
- `GET /equipment/:adId` - equipment detail.
- `GET /materials` - construction materials list.
- `GET /materials/:adId` - construction material detail.
- `GET /tools` - tools list.
- `GET /tools/:adId` - tool detail.

Public list and detail endpoints only expose approved or published non-deleted ads.

## Create Ads

- `POST /vacancies` - create vacancy as `pending_moderation`.
- `POST /resumes` - create resume as `pending_moderation`.
- `POST /equipment` - create equipment ad as `pending_moderation`.
- `POST /materials` - create construction material ad as `pending_moderation`.
- `POST /tools` - create tool ad as `pending_moderation`.
- `POST /uploads/photos` - current authenticated photo upload abstraction.
- `POST /uploads/intent` - reserved for future object storage uploads.

The generic `POST /ads` route is reserved; first-version creation goes through typed endpoints.

## My Ads

- `GET /ads/my` - current user's ads with type/status filters.
- `PATCH /ads/:adId` - update own ad title, description, category, district.
- `POST /ads/:adId/hide` - hide own ad.
- `POST /ads/:adId/archive` - alias for hiding/archiving in current UI.
- `POST /ads/:adId/submit` - resubmit own edited ad to moderation.
- `POST /ads/:adId/photos` - reserved.
- `DELETE /ads/:adId/photos/:photoId` - reserved.

## Favorites

- `GET /favorites` - current user's favorite ads.
- `POST /favorites/:adId` - add ad to favorites.
- `DELETE /favorites/:adId` - remove ad from favorites.

## Reviews

- `GET /reviews/me` - reviews received by current user.
- `GET /reviews/users/:userId` - public reviews for a user.
- `POST /reviews/users/:userId` - create review for a user.

## Moderation

Admin or moderator role is required.

- `GET /moderation/queue` - pending/moderation queue with filters.
- `GET /moderation/ads/:adId` - moderation preview.
- `POST /moderation/ads/:adId/approve` - approve ad and trigger channel publication.
- `POST /moderation/ads/:adId/reject` - reject ad with reason.
- `POST /moderation/ads/:adId/hide` - hide ad with optional reason.
- `GET /moderation/logs` - moderation audit log.

## Channel Publishing

Admin or moderator role is required.

- `POST /channel-publishing/publish/:adId` - manually publish or retry approved/published ad.
- `GET /channel-publishing/publish-logs` - publication attempts and statuses.

Automatic publication is attempted during moderation approve when `MAX_CHANNEL_CHAT_ID` is configured.

## References

- `GET /references/categories?q=&limit=` - canonical category suggestions.
- `GET /references/districts?q=&limit=` - canonical district suggestions.

Free text is still accepted; create/search flows normalize and canonicalize values on the backend.
