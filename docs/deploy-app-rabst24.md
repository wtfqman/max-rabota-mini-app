# Deploy app.rabst24.ru

Подготовка сделана под схему:

- mini app frontend: `app.rabst24.ru`
- backend API: `app.rabst24.ru/api`
- healthcheck: `app.rabst24.ru/health`
- MAX webhook route на будущее: `app.rabst24.ru/webhooks/max`

Пока SSL не подключён, не переводите сервис в финальный production-режим в MAX. Код и конфиги уже готовы к HTTPS, но mini app URL в боевом bot config оставлен как `https://app.rabst24.ru` на момент выдачи сертификата.

## Env

1. На сервере создайте рабочий `.env` из примера:

```bash
cp .env.production.example .env
```

2. Заполните реальные значения:

- `DATABASE_URL`
- `MAX_BOT_TOKEN`
- `MAX_WEBHOOK_SECRET`
- `SESSION_SECRET`
- `MAX_CHANNEL_CHAT_ID`, если канал уже известен
- `CHANNEL_URL`, если нужна кнопка канала

3. До подключения SSL оставьте:

```dotenv
MAX_BOT_MODE=long-polling
APP_URL=https://app.rabst24.ru
WEB_APP_URL=https://app.rabst24.ru
API_PUBLIC_URL=https://app.rabst24.ru/api
CORS_ORIGIN=https://app.rabst24.ru
MINI_APP_URL=https://app.rabst24.ru
VITE_APP_URL=https://app.rabst24.ru
VITE_API_BASE_URL=https://app.rabst24.ru/api
HTTPS_ENABLED=false
```

После подключения SSL можно переключить MAX на webhook:

```dotenv
MAX_BOT_MODE=webhook
MAX_WEBHOOK_PATH=/webhooks/max
HTTPS_ENABLED=true
```

Webhook URL для MAX: `https://app.rabst24.ru/webhooks/max`.

## Build

```bash
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build:prod
```

Frontend build появится в `dist/apps/web`, server build - в `dist/apps/api` и `dist/apps/bot`.

## Start Without PM2

API:

```bash
NODE_ENV=production npm run start:api
```

Bot long polling, пока SSL не подключён:

```bash
NODE_ENV=production npm run start:bot
```

## Start With PM2

```bash
mkdir -p logs
npm run pm2:start
npm run pm2:logs
pm2 save
```

Restart после нового build:

```bash
npm run pm2:restart
```

Если позже включите `MAX_BOT_MODE=webhook`, отдельный long-polling bot process завершится с кодом `0`, а API продолжит принимать webhook на `/webhooks/max`.

## Nginx

Шаблон лежит в `deploy/nginx/app.rabst24.ru.conf`.

Пример установки:

```bash
sudo cp deploy/nginx/app.rabst24.ru.conf /etc/nginx/sites-available/app.rabst24.ru.conf
sudo ln -s /etc/nginx/sites-available/app.rabst24.ru.conf /etc/nginx/sites-enabled/app.rabst24.ru.conf
sudo nginx -t
sudo systemctl reload nginx
```

В шаблоне активен только HTTP `listen 80`. Блок SSL оставлен комментариями, чтобы не включать несуществующие сертификаты. После выпуска сертификатов перенесите те же `location` блоки в HTTPS server и включите redirect с HTTP на HTTPS.

## Checks

```bash
curl http://app.rabst24.ru/health
curl http://app.rabst24.ru/api/health
```

После SSL:

```bash
curl https://app.rabst24.ru/health
curl https://app.rabst24.ru/api/health
```

## Future api.rabst24.ru Option

Для отдельного API-домена позже:

```dotenv
CORS_ORIGIN=https://app.rabst24.ru
API_PUBLIC_URL=https://api.rabst24.ru/api
VITE_API_BASE_URL=https://api.rabst24.ru/api
```

Понадобится отдельный nginx server для `api.rabst24.ru`, который проксирует `/api/`, `/uploads/`, `/health` и `/webhooks/` на Node API.
