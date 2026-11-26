/**
 * PM2 Ecosystem Configuration cho Hệ Thống Điều Vận Container - WED_HOACHTOAN
 * Quản lý chạy ngầm 24/7 dưới nền Windows Service
 */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'hoachtoan-service',
      script: './src/index.js',
      cwd: path.resolve(__dirname, 'server'),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        CLIENT_ORIGIN: 'http://localhost:5000'
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 5000,
        CLIENT_ORIGIN: 'http://localhost:5173'
      },
      error_file: path.resolve(__dirname, 'server/logs/pm2-error.log'),
      out_file: path.resolve(__dirname, 'server/logs/pm2-out.log'),
      log_file: path.resolve(__dirname, 'server/logs/pm2-combined.log'),
      time: true,
      merge_logs: true
    }
  ]
};
