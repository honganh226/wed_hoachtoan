/**
 * Snapshot Supabase nén (gz1) phải đọc được cả bản mới lẫn bản cũ chưa nén.
 *   node src/tests/snapshotCodec.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCipheriv, randomBytes } from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hoachtoan-snapshot-'));
process.env.NODE_ENV = 'test';
process.env.IS_TEST = 'true';
process.env.DB_PATH = path.join(tmp, 'snap.db');
process.env.GROUP_ALLOCATIONS_PATH = path.join(tmp, 'groups.json');
process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
process.env.SUPABASE_URL = '';
fs.writeFileSync(process.env.DB_PATH, '');

const { db } = await import('../db/database.js');
const { captureState, restoreState, __snapshotCodec } = await import('../services/durableState.service.js');
const { seedJanuaryIfMissing } = await import('./helpers/seedJanuary.mjs');

await seedJanuaryIfMissing();
const state = captureState();
const json = JSON.stringify(state);

// Bản mới: có tiền tố gz1, nhỏ hơn rõ rệt, giải mã ra đúng dữ liệu
const packed = __snapshotCodec.encrypt(state);
assert.ok(packed.startsWith('gz1:'));
assert.deepEqual(__snapshotCodec.decrypt(packed), JSON.parse(json));
const legacySize = Math.ceil(Buffer.byteLength(json) / 3) * 4;
assert.ok(packed.length * 3 < legacySize, `nén chưa đủ: ${packed.length} so với ${legacySize}`);

// Bản cũ chưa nén (định dạng trước 26/11/2026) vẫn đọc được
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.ENCRYPTION_KEY, 'hex'), iv);
const body = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
const legacy = Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
assert.deepEqual(__snapshotCodec.decrypt(legacy), JSON.parse(json));

// Sửa một byte -> phải báo lỗi (GCM vẫn kiểm tra toàn vẹn)
const broken = 'gz1:' + Buffer.from(Buffer.from(packed.slice(4), 'base64').map((b, i) => (i === 40 ? b ^ 1 : b))).toString('base64');
assert.throws(() => __snapshotCodec.decrypt(broken));

// Khôi phục từ bản nén giữ đủ 77 cuốc tháng 1
db.prepare("DELETE FROM trips WHERE trip_date LIKE '2026-01%'").run();
restoreState(__snapshotCodec.decrypt(packed));
assert.equal(db.prepare("SELECT COUNT(*) n FROM trips WHERE trip_date LIKE '2026-01%'").get().n, 77);

console.log(`PASS snapshot codec: ${Buffer.byteLength(json)} B JSON -> ${packed.length} B (gz1), legacy ${legacy.length} B`);
