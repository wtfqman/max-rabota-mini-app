const path = require('node:path');

const projectRoot = path.resolve(__dirname, '../..');

module.exports = {
  apps: [
    {
      name: 'rabst24-api',
      cwd: projectRoot,
      script: 'dist/apps/api/src/main.js',
      exec_mode: 'fork',
      instances: 1,
      env_production: {
        NODE_ENV: 'production',
        APP_URL: 'https://app.rabst24.ru',
        WEB_APP_URL: 'https://app.rabst24.ru',
        API_PUBLIC_URL: 'https://app.rabst24.ru/api',
        CORS_ORIGIN: 'https://app.rabst24.ru',
        MINI_APP_URL: 'https://app.rabst24.ru'
      },
      max_memory_restart: '512M',
      out_file: 'logs/api.out.log',
      error_file: 'logs/api.err.log',
      time: true
    },
    {
      name: 'rabst24-bot',
      cwd: projectRoot,
      script: 'dist/apps/bot/src/main.js',
      exec_mode: 'fork',
      instances: 1,
      env_production: {
        NODE_ENV: 'production',
        APP_URL: 'https://app.rabst24.ru',
        WEB_APP_URL: 'https://app.rabst24.ru',
        API_PUBLIC_URL: 'https://app.rabst24.ru/api',
        CORS_ORIGIN: 'https://app.rabst24.ru',
        MINI_APP_URL: 'https://app.rabst24.ru'
      },
      max_memory_restart: '256M',
      out_file: 'logs/bot.out.log',
      error_file: 'logs/bot.err.log',
      stop_exit_codes: [0],
      time: true
    }
  ]
};
