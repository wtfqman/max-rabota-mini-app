# Rabst24 Platform

Production-like monorepo for a MAX classifieds platform.

The MAX bot is only an entry point. The primary product is the MAX mini app on `app.rabst24.ru`.

## Applications

- `apps/api` - backend API, MAX webhook endpoint, healthcheck, moderation, publication orchestration.
- `apps/bot` - lightweight MAX long polling bot for `/start` and mini app/channel buttons.
- `apps/web` - React/Vite MAX mini app.

## Packages

- `packages/db` - Prisma schema, migrations, seed, Prisma Client singleton.
- `packages/core` - repositories, domain services, serializers, channel post formatter.
- `packages/bot-core` - bot update router, `/start` handler, keyboards.
- `packages/max-api` - MAX Bot API client.
- `packages/shared` - DTOs, Zod schemas, domain constants, normalization helpers, shared errors.
- `packages/config` - dotenv config and pino logger.

## Implemented First-Version Flows

- MAX init/auth: `POST /api/auth/max/verify`.
- Public ad lists/details for vacancies, resumes, equipment, construction materials, and tools.
- Create vacancy/resume/material/tool ads with review before publishing.
- Mobile-first mini app forms with preview and local draft for create flows.
- Moderation queue with approve/reject/hide actions.
- Automatic channel publishing after approve, with logs and manual retry endpoint.
- User cabinet: profile, my ads, status filters, edit/hide/resubmit.
- Favorites for all ad types.
- Reviews for users.
- Category/district free input with backend normalization and frontend suggestions.

## Quick Start

```bash
cp .env.example .env
docker compose up -d
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Run commands from this repository root. If npm says it cannot find `package.json`, move one folder deeper into `max mini app bot hard` and run the command again.

Run API:

```bash
npm run dev:api
```

Run mini app:

```bash
npm run dev:web
```

Run bot long polling process for local development:

```bash
npm run dev:bot
```

## Build And Checks

```bash
npm run typecheck
npm run lint
npm run build
```

Production-oriented check:

```bash
npm run deploy:check
```

## Important Environment Variables

- `DATABASE_URL` - PostgreSQL connection.
- `MAX_BOT_TOKEN` - MAX bot token.
- `MAX_CHANNEL_CHAT_ID` - MAX channel chat id used for publishing approved ads.
- `CHANNEL_URL` - public channel URL shown in bot/UI.
- `APP_URL` - public application origin, `https://app.rabst24.ru` in production.
- `WEB_APP_URL` - public mini app origin, `https://app.rabst24.ru` in production.
- `API_PUBLIC_URL` - public API base URL, `https://app.rabst24.ru/api` in production.
- `CORS_ORIGIN` - allowed frontend origin list, comma-separated when needed.
- `MINI_APP_URL` - mini app URL, normally `https://app.rabst24.ru`.
- `VITE_API_BASE_URL` - frontend API base URL.
- `VITE_APP_URL` - public mini app URL embedded into the frontend build.
- `VITE_APP_BASE_PATH` - frontend router/static base path, `/` for `app.rabst24.ru`.
- `TRUST_PROXY` - Express trust proxy setting for nginx, normally `loopback`.
- `HTTPS_ENABLED` - enables HSTS and CSP HTTPS upgrade headers only after SSL is active.
- `SESSION_SECRET` - required in production.

See `.env.example` for local development and `.env.production.example` for `app.rabst24.ru`.

## API And Architecture Docs

- `docs/architecture.md`
- `docs/api-endpoints.md`
- `docs/deploy-app-rabst24.md`

## Production Notes

- Use `MAX_BOT_MODE=long-polling` until SSL is connected.
- After SSL is connected, `MAX_BOT_MODE=webhook` can be used with `https://app.rabst24.ru/webhooks/max`.
- Production frontend values: `VITE_APP_URL=https://app.rabst24.ru` and `VITE_API_BASE_URL=https://app.rabst24.ru/api`.
- Production backend values: `APP_URL=https://app.rabst24.ru`, `WEB_APP_URL=https://app.rabst24.ru`, `API_PUBLIC_URL=https://app.rabst24.ru/api`, `CORS_ORIGIN=https://app.rabst24.ru`.
- Production bot value: `MINI_APP_URL=https://app.rabst24.ru`.
- Serve the API and mini app through HTTPS before final MAX production launch.
- Nginx template: `deploy/nginx/app.rabst24.ru.conf`.
- PM2 template: `deploy/pm2/ecosystem.config.cjs`.
- Set MAX webhook subscription to `MAX_WEBHOOK_PATH`.
- Move photo upload storage from the current abstraction to object storage before high-volume production usage.
- Channel publishing currently runs inline after approval; it can be moved to a queue worker while keeping `ChannelPublishLog` as the audit source.
