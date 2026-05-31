# Rabst24: Quick Server Deploy

Use these commands on Ubuntu server to deploy the project fully.

## 1) Install system packages

```bash
sudo apt update
sudo apt install -y nginx git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

## 2) Upload project to server

Run on your local machine:

```bash
rsync -az --delete "/path/to/max mini app bot hard/" root@YOUR_SERVER_IP:/root/rabst24-app/
```

## 3) Build and start app

Run on server:

```bash
cd /root/rabst24-app
cp .env.production.example .env
nano .env
```

Set at least:

- `DATABASE_URL`
- `MAX_BOT_TOKEN`
- `SESSION_SECRET`
- `VITE_APP_URL=https://app.rabst24.ru`
- `VITE_API_BASE_URL=https://app.rabst24.ru/api`
- `APP_URL=https://app.rabst24.ru`
- `API_PUBLIC_URL=https://app.rabst24.ru/api`

Then:

```bash
cd /root/rabst24-app
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build:prod
mkdir -p logs
npm run pm2:start
pm2 save
```

## 4) Install nginx config

```bash
cd /root/rabst24-app
sudo cp deploy/nginx/app.rabst24.ru.conf /etc/nginx/sites-available/app.rabst24.ru.conf
sudo ln -sf /etc/nginx/sites-available/app.rabst24.ru.conf /etc/nginx/sites-enabled/app.rabst24.ru.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 5) Verify routes

```bash
curl -I https://app.rabst24.ru
curl -s -o /dev/null -w "%{http_code}\n" https://app.rabst24.ru/api/health
pm2 logs rabst24-api --lines 120
```

Important: API logs must show `/api/...` routes (not `/auth/...` without `/api`).

## 6) Update after changes

```bash
cd /root/rabst24-app
git pull
npm ci
npm run build:prod
npm run pm2:restart
```
