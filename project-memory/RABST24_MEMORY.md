# Rabst24 Project Memory

This file is a local project memo for Codex and the maintainer. It contains operational context only. Do not put real secrets, tokens, passwords, or private keys here.

## Project

- Project name: Rabst24 platform.
- Production server path: `/root/rabst24-app`.
- Local repo root: `max mini app bot hard`.
- Public app URL: `https://app.rabst24.ru`.
- Intended API base URL: `https://app.rabst24.ru/api`.
- MAX API base URL: `https://platform-api.max.ru`.
- Bot process in PM2: `rabst24-bot`.
- API process in PM2: `rabst24-api`.
- Bot username from `/me`: `id694201221191_1_bot`.
- MAX mini app deeplink format: `https://max.ru/<bot_username>?startapp`.
- Current expected mini app deeplink: `https://max.ru/id694201221191_1_bot?startapp`.

## Production Env Keys

Known important keys in `/root/rabst24-app/.env`:

- `MAX_BOT_TOKEN` must be non-empty and not `replace_me`.
- `MAX_BOT_MODE=long-polling`.
- `MAX_API_BASE_URL=https://platform-api.max.ru`.
- `MINI_APP_URL=https://app.rabst24.ru`.
- `VITE_APP_URL=https://app.rabst24.ru`.
- `VITE_API_BASE_URL=https://app.rabst24.ru/api`.
- `MAX_MINI_APP_WEB_APP=https://max.ru/id694201221191_1_bot?startapp`.

## Useful Server Commands

Build and restart server-side apps:

```bash
cd /root/rabst24-app
npm run build:server
npm run pm2:restart
```

Build frontend:

```bash
cd /root/rabst24-app
npm run build:web
npm run pm2:restart
```

Fresh bot logs:

```bash
pm2 flush rabst24-bot
pm2 logs rabst24-bot --lines 80
```

Fresh API logs:

```bash
pm2 flush rabst24-api
pm2 logs rabst24-api --lines 120
```

Check production API:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://app.rabst24.ru/api/health
```

Check the bot profile from MAX:

```bash
cd /root/rabst24-app
node <<'EOF'
const fs = require('fs');

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    })
);

const base = (env.MAX_API_BASE_URL || 'https://platform-api.max.ru').replace(/\/$/, '');

fetch(`${base}/me`, {
  headers: { Authorization: env.MAX_BOT_TOKEN }
})
  .then(async response => {
    console.log('status:', response.status);
    console.log(await response.text());
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
EOF
```

## Current MAX Mini App Diagnosis

- The bot receives `/start` and logs `User started bot`, so long polling and basic send flow work.
- Previous MAX API error `Link not found with pk = LinkPK{name='https://app.rabst24.ru'...}` happened because `open_app` was incorrectly pointed at the external site URL.
- The start keyboard should not point directly to `https://app.rabst24.ru`.
- Current preferred button behavior is a MAX deeplink button:
  - button type: `link`
  - URL: `https://max.ru/id694201221191_1_bot?startapp`
- If MAX shows `not found` for that link, the code is probably not the blocker. MAX Partner likely has not connected or activated the mini app for this bot.

## MAX Partner Checklist

In MAX Partner / business console:

- Open the organization profile.
- Open `Chat bots`.
- Choose bot `Bot stroy / id694201221191_1_bot`.
- Open `Chat bot and mini app` settings.
- Set mini app URL to `https://app.rabst24.ru`.
- Save changes.
- Verify moderation/status is active.
- Test `https://max.ru/id694201221191_1_bot?startapp=test`.

## Frontend/Auth Notes

- The frontend should call `POST https://app.rabst24.ru/api/auth/max/verify`.
- If API logs show `POST /auth/max/verify`, the MAX WebView is using an old frontend bundle or the API base URL is wrong.
- If API logs show `POST /api/auth/max/verify` with `401` or `403`, inspect MAX init data validation.
- If API logs show `POST /api/auth/max/verify` with `200` but the screen still loads forever, inspect frontend runtime errors or cached assets.
- `GET https://app.rabst24.ru/auth/max/verify` returning `200` is not a valid auth test; it can be the SPA fallback.

## Important Source Files

- Bot start handler: `packages/bot-core/src/handlers/start.handler.ts`.
- Start keyboard: `packages/bot-core/src/keyboards/start.keyboard.ts`.
- Config env parser: `packages/config/src/env.ts`.
- Bot DI container: `apps/bot/src/app/container.ts`.
- API DI container: `apps/api/src/app/container.ts`.
- API app routing/static behavior: `apps/api/src/app/create-app.ts`.
- API security headers: `apps/api/src/plugins/core-plugins.ts`.
- Frontend app env: `apps/web/src/shared/config/app-env.ts`.
- MAX bridge/init data parsing: `apps/web/src/shared/max/max-bridge.ts`.
- Frontend auth store: `apps/web/src/app/store/app-store.ts`.

## Do Not Forget

- Do not paste tokens into chat or into this file.
- Before changing production manually, check whether the same fix exists locally and should be committed.
- After changing server TypeScript, run `npm run build:server`.
- After changing frontend env or React code, run `npm run build:web`.
- After rebuilds, restart PM2 and use fresh flushed logs.
