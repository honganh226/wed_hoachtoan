import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';

if (process.env.RENDER_READ_ONLY !== 'true') throw new Error('This initializer requires RENDER_READ_ONLY=true');
const password = process.env.DIRECTOR_INIT_PASSWORD;
if (!password || password.length < 12) throw new Error('Configure DIRECTOR_INIT_PASSWORD with at least 12 characters');
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('giamdoc');
if (!existing) {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users (id, username, password_hash, full_name, role, area_id, phone, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, 1, ?, ?)')
    .run(randomUUID(), 'giamdoc', bcrypt.hashSync(password, 12), 'Giám đốc', 'DIRECTOR', now, now);
  console.log('[TEST] Director account initialized; password remains in environment variables.');
} else console.log('[TEST] Existing account preserved.');
