/**
 * Module kết nối SQLite Database sử dụng node:sqlite chuẩn của Node.js 22
 * và tích hợp Drizzle ORM (sqlite-proxy).
 * Hỗ trợ WAL mode, VACUUM INTO, Prepared Statements và Drizzle Type-safe queries.
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema.js';
import { initDatabase } from './init.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPERATIONAL_DB_PATH = path.resolve(__dirname, '../../data/hoachtoan.db');
const DEFAULT_TEST_DB_PATH = path.resolve(__dirname, '../../data/test_hoachtoan.db');

// Tự động nhận diện khi đang chạy bất kỳ lệnh kiểm thử nào (npm test, verify script, test runner)
const isRunningTests = Boolean(
  process.env.NODE_ENV === 'test' ||
  process.env.IS_TEST === 'true' ||
  (process.env.npm_lifecycle_event && process.env.npm_lifecycle_event.includes('test')) ||
  process.argv.some(arg => /test|verify/i.test(arg))
);

if (isRunningTests) {
  process.env.NODE_ENV = 'test';
  process.env.IS_TEST = 'true';
  // Nếu DB_PATH chưa set hoặc đang trỏ tới database vận hành (do nạp từ .env), tự động ép sang database thử
  if (!process.env.DB_PATH || path.resolve(process.cwd(), process.env.DB_PATH).toLowerCase() === OPERATIONAL_DB_PATH.toLowerCase()) {
    process.env.DB_PATH = DEFAULT_TEST_DB_PATH;
  }
}

let resolvedDbPath;
if (process.env.DB_PATH) {
  resolvedDbPath = path.resolve(process.cwd(), process.env.DB_PATH);
} else if (process.env.NODE_ENV === 'production') {
  // Railway Persistent Volume gắn tại /app/data
  resolvedDbPath = '/app/data/hoachtoan.db';
} else {
  resolvedDbPath = OPERATIONAL_DB_PATH;
}

const DB_PATH = resolvedDbPath;

// Đảm bảo thư mục lưu file db tồn tại
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Nếu là kiểm thử và file DB thử chưa tồn tại, tự động sao chép để có dữ liệu thử nghiệm an toàn
if (isRunningTests && !fs.existsSync(DB_PATH)) {
  if (fs.existsSync(OPERATIONAL_DB_PATH)) {
    try {
      fs.copyFileSync(OPERATIONAL_DB_PATH, DB_PATH);
      console.log('[TEST DB] Đã tự động tạo bản sao test_hoachtoan.db phục vụ kiểm thử an toàn.');
    } catch (e) {}
  }
}

// BẢO MẬT: Chốt chặn cứng tuyệt đối - cấm chạy test trên database vận hành
if (isRunningTests) {
  if (path.resolve(DB_PATH).toLowerCase() === OPERATIONAL_DB_PATH.toLowerCase()) {
    throw new Error('[SECURITY FATAL] Tuyệt đối không được chạy kiểm thử trên database vận hành (hoachtoan.db)! Đã chặn tự động.');
  }
}

// Khởi tạo DatabaseSync
const rawDb = new DatabaseSync(DB_PATH);

// Cấu hình PRAGMA tối ưu hóa theo Hợp đồng Kỹ thuật
rawDb.exec('PRAGMA journal_mode = WAL;');
rawDb.exec('PRAGMA synchronous = NORMAL;');
rawDb.exec('PRAGMA foreign_keys = ON;');
rawDb.exec('PRAGMA cache_size = -64000;');
rawDb.exec('PRAGMA busy_timeout = 30000;');

/**
 * Lớp bọc db tương thích chuẩn better-sqlite3 API
 */
class DatabaseWrapper {
  constructor(internalDb) {
    this.internal = internalDb;
    this._txDepth = 0;
  }

  exec(sql) {
    const trimmed = typeof sql === 'string' ? sql.trim().toUpperCase() : '';
    if (/^BEGIN(\s+(TRANSACTION|IMMEDIATE|EXCLUSIVE|DEFERRED))?\s*;?$/i.test(trimmed)) {
      if (this._txDepth === 0) {
        this._txDepth++;
        return this.internal.exec('BEGIN TRANSACTION;');
      } else {
        const sp = `raw_sp_${this._txDepth}`;
        this._txDepth++;
        return this.internal.exec(`SAVEPOINT ${sp};`);
      }
    }
    if (/^(COMMIT|END)(\s+TRANSACTION)?\s*;?$/i.test(trimmed)) {
      if (this._txDepth > 1) {
        this._txDepth--;
        const sp = `raw_sp_${this._txDepth}`;
        return this.internal.exec(`RELEASE SAVEPOINT ${sp};`);
      } else if (this._txDepth === 1) {
        this._txDepth = 0;
        return this.internal.exec('COMMIT;');
      }
      return;
    }
    if (/^ROLLBACK(\s+TRANSACTION)?\s*;?$/i.test(trimmed)) {
      if (this._txDepth > 1) {
        this._txDepth--;
        const sp = `raw_sp_${this._txDepth}`;
        try { this.internal.exec(`ROLLBACK TO SAVEPOINT ${sp};`); } catch (_) {}
        return this.internal.exec(`RELEASE SAVEPOINT ${sp};`);
      } else if (this._txDepth === 1) {
        this._txDepth = 0;
        return this.internal.exec('ROLLBACK;');
      }
      return;
    }
    return this.internal.exec(sql);
  }

  prepare(sql) {
    const stmt = this.internal.prepare(sql);
    return {
      run: (...params) => {
        const actualParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return stmt.run(...actualParams);
      },
      get: (...params) => {
        const actualParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return stmt.get(...actualParams);
      },
      all: (...params) => {
        const actualParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return stmt.all(...actualParams);
      }
    };
  }

  pragma(pragmaStr, options = {}) {
    if (pragmaStr.includes('=')) {
      this.internal.exec(`PRAGMA ${pragmaStr}`);
      return;
    }
    const cleanName = pragmaStr.trim();
    const row = this.prepare(`PRAGMA ${cleanName}`).get();
    if (!row) return null;
    if (options.simple) {
      const keys = Object.keys(row);
      return keys.length > 0 ? row[keys[0]] : null;
    }
    return row;
  }

  transaction(fn) {
    return (...args) => {
      const depth = this._txDepth;
      this._txDepth++;
      const sp = `tx_sp_${depth}`;
      if (depth === 0) {
        this.internal.exec('BEGIN TRANSACTION;');
      } else {
        this.internal.exec(`SAVEPOINT ${sp};`);
      }
      try {
        const result = fn(...args);
        if (depth === 0) {
          this.internal.exec('COMMIT;');
        } else {
          this.internal.exec(`RELEASE SAVEPOINT ${sp};`);
        }
        return result;
      } catch (err) {
        if (depth === 0) {
          try { this.internal.exec('ROLLBACK;'); } catch (_) {}
        } else {
          try {
            this.internal.exec(`ROLLBACK TO SAVEPOINT ${sp};`);
            this.internal.exec(`RELEASE SAVEPOINT ${sp};`);
          } catch (_) {}
        }
        throw err;
      } finally {
        this._txDepth = depth;
      }
    };
  }

  close() {
    this.internal.close();
  }
}

const db = new DatabaseWrapper(rawDb);

// Khởi tạo Drizzle ORM thông qua sqlite-proxy driver
export const drizzleDb = drizzle(async (sql, params, method) => {
  try {
    if (method === 'all') {
      const rows = rawDb.prepare(sql).all(...params);
      return { rows: rows.map(r => Object.values(r)) };
    } else if (method === 'get') {
      const row = rawDb.prepare(sql).get(...params);
      return { rows: row ? Object.values(row) : [] };
    } else {
      rawDb.prepare(sql).run(...params);
      return { rows: [] };
    }
  } catch (e) {
    console.error('[DRIZZLE PROXY ERROR]', e.message, 'SQL:', sql);
    throw e;
  }
}, { schema });

// Tự động khởi tạo schema các bảng
initDatabase();

console.log(`[DB] Kết nối SQLite thành công: ${DB_PATH}`);
console.log(`[DB] Journal Mode: ${db.pragma('journal_mode', { simple: true })}`);

export { db, rawDb, DB_PATH, schema };
export default db;
