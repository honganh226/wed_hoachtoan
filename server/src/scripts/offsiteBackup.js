/**
 * Script chạy sao lưu Offsite độc lập (Dùng cho Windows Task Scheduler hoặc cron máy chủ)
 * Lệnh chạy: node server/src/scripts/offsiteBackup.js
 */
import 'dotenv/config';
import { performOffsiteBackup } from '../services/offsiteBackup.service.js';

async function run() {
  console.log('====================================================');
  console.log('   CHẠY TÁC VỤ SAO LƯU OFFSITE RA TELEGRAM / CLOUD  ');
  console.log('====================================================');
  try {
    const result = await performOffsiteBackup({
      triggeredBy: 'STANDALONE_SCRIPT',
      channel: process.env.OFFSITE_BACKUP_CHANNEL || 'TELEGRAM'
    });
    console.log('[SUCCESS]', result.message);
    process.exit(0);
  } catch (err) {
    console.error('[ERROR] Lỗi sao lưu offsite:', err);
    process.exit(1);
  }
}

run();
