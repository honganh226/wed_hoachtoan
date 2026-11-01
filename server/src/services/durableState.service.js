import { createCipheriv, createDecipheriv, randomBytes, randomUUID, createHash } from 'node:crypto';
import { db } from '../db/database.js';
import { initDatabase } from '../db/init.js';
import { excelMonthService, invalidateExcelMonthCache } from './excelMonthService.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { broadcastPLUpdate } from './plEngine.service.js';

let revision = null;
let ready = false;
let queue = Promise.resolve();

const getSupabaseKey = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
const configured = () => Boolean(process.env.SUPABASE_URL && getSupabaseKey());

function sanitizeError(msg) {
  let s = String(msg || '');
  const key = getSupabaseKey();
  if (key) s = s.replaceAll(key, '[REDACTED]');
  const enc = (process.env.ENCRYPTION_KEY || '').trim();
  if (enc) s = s.replaceAll(enc, '[REDACTED]');
  return s;
}

function key() {
  const value = (process.env.ENCRYPTION_KEY || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw Error('Cần ENCRYPTION_KEY gồm 64 ký tự hex');
  }
  return Buffer.from(value, 'hex');
}

function encrypt(data) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

function decrypt(value) {
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < 28) throw Error('Dữ liệu snapshot không hợp lệ (độ dài quá ngắn)');
  const cipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
}

export function captureState() {
  const tables = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
    if (!/^[a-zA-Z0-9_]+$/.test(name)) throw Error('Tên bảng không hợp lệ');
    tables[name] = db.prepare(`SELECT * FROM ${name}`).all();
  }
  return { format: 1, tables, allocations: Object.fromEntries(excelMonthService.groupAllocations) };
}

export function restoreState(state) {
  if (state?.format !== 1 || !state?.tables) throw Error('Định dạng snapshot không hỗ trợ');
  initDatabase();
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
  db.exec('PRAGMA foreign_keys=OFF');
  try {
    db.transaction(() => {
      for (const name of names) db.prepare(`DELETE FROM ${name}`).run();
      for (const name of names) {
        const columns = new Set(db.prepare(`PRAGMA table_info(${name})`).all().map(c => c.name));
        for (const row of state.tables[name] || []) {
          const keys = Object.keys(row).filter(k => columns.has(k));
          if (keys.length) {
            db.prepare(`INSERT INTO ${name}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map(k => row[k]));
          }
        }
      }
    })();
    initDatabase();
  } finally {
    db.exec('PRAGMA foreign_keys=ON');
  }
  excelMonthService.groupAllocations = new Map(Object.entries(state.allocations || {}));
  excelMonthService.cachedData = null;
  invalidateExcelMonthCache();
}

async function remote(method, suffix = '', body) {
  const keyStr = getSupabaseKey();
  const url = process.env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/hoachtoan_state' + suffix;
  const headers = {
    apikey: keyStr,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
  // Chỉ gửi Authorization Bearer nếu key là JWT (bắt đầu bằng ey).
  // Với Secret key mới của Supabase (sb_secret_...), gửi apikey header để PostgREST xác thực service_role.
  if (keyStr.startsWith('ey')) {
    headers.Authorization = 'Bearer ' + keyStr;
  }
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    throw Error(`Không thể lưu database bền vững (HTTP ${response.status})`);
  }
  return response.json();
}

export async function initializeDurableState() {
  if (!configured()) {
    ready = false;
    return false;
  }
  try {
    const rows = await remote('GET', '?id=eq.main&select=id,revision,payload');
    if (rows && rows.length > 0) {
      const decrypted = decrypt(rows[0].payload);
      restoreState(decrypted);
      revision = Number(rows[0].revision);
      ready = true;
      console.log(`[DURABLE STATE] Khôi phục thành công từ Supabase snapshot (revision: ${revision}).`);
      return true;
    } else {
      console.log('[DURABLE STATE] Chưa có snapshot trên Supabase. Đang nạp snapshot mốc ban đầu...');
      const rawState = captureState();
      const writeId = randomUUID();
      const payloadHash = createHash('sha256').update(JSON.stringify(rawState)).digest('hex');
      const payload = encrypt(rawState);
      await remote('POST', '', {
        id: 'main',
        revision: 1,
        payload,
        write_id: writeId,
        payload_hash: payloadHash,
        updated_at: new Date().toISOString()
      });
      revision = 1;
      ready = true;
      console.log('[DURABLE STATE] Đã tạo snapshot mốc ban đầu trên Supabase (revision: 1).');
      return true;
    }
  } catch (err) {
    ready = false;
    console.error('[DURABLE STATE] Lỗi khởi tạo hoặc giải mã snapshot (chuyển sang chỉ đọc):', sanitizeError(err.message));
    return false;
  }
}

async function flushState() {
  const next = revision + 1;
  const writeId = randomUUID();
  const rawState = captureState();
  const rawString = JSON.stringify(rawState);
  const payloadHash = createHash('sha256').update(rawString).digest('hex');
  const encryptedPayload = encrypt(rawState);
  const now = new Date().toISOString();
  let patchSuccess = false;

  try {
    const rows = await remote('PATCH', `?id=eq.main&revision=eq.${revision}`, {
      revision: next,
      payload: encryptedPayload,
      write_id: writeId,
      payload_hash: payloadHash,
      updated_at: now
    });
    if (rows && rows.length === 1) {
      patchSuccess = true;
      revision = next;
      return;
    }
  } catch (err) {
    // Xử lý timeout hoặc rớt mạng khi PATCH:
    // Tuyệt đối không coi cloud revision === next là thành công nếu write_id hoặc hash không khớp!
    try {
      const checkRows = await remote('GET', '?id=eq.main&select=revision,write_id,payload_hash');
      if (checkRows && checkRows.length > 0) {
        const cloudRev = Number(checkRows[0].revision);
        const cloudWriteId = checkRows[0].write_id;
        const cloudHash = checkRows[0].payload_hash;

        if (cloudRev === next) {
          if (cloudWriteId === writeId || (cloudHash && cloudHash === payloadHash)) {
            // Đúng là lượt ghi này đã lưu thành công trước khi mất phản hồi
            patchSuccess = true;
            revision = next;
            return;
          } else {
            // Phiên khác đã ghi payload khác với cùng revision dự kiến!
            ready = false;
            throw Error('Xung đột phiên bản: Supabase đã được cập nhật bởi một phiên khác với nội dung khác.');
          }
        } else if (cloudRev > next) {
          ready = false;
          throw Error(`Xung đột phiên bản: Supabase đã có revision mới hơn (${cloudRev} > ${next}).`);
        } else if (cloudRev === revision) {
          throw Error('Lưu lên Supabase không thành công (timeout hoặc mất kết nối).');
        }
      }
    } catch (checkErr) {
      if (checkErr.message?.includes('Xung đột phiên bản')) {
        throw checkErr;
      }
      ready = false;
      throw Error('Chưa thể xác định trạng thái lưu bền vững trên Supabase do mất kết nối. Tạm khóa ghi để tránh xung đột.');
    }
    throw Error(sanitizeError(err.message));
  }

  if (!patchSuccess) {
    // PATCH không cập nhật được dòng nào (0 rows), kiểm tra chi tiết trạng thái cloud
    try {
      const checkRows = await remote('GET', '?id=eq.main&select=revision,write_id,payload_hash');
      if (checkRows && checkRows.length > 0) {
        const cloudRev = Number(checkRows[0].revision);
        const cloudWriteId = checkRows[0].write_id;
        const cloudHash = checkRows[0].payload_hash;

        if (cloudRev === next && (cloudWriteId === writeId || (cloudHash && cloudHash === payloadHash))) {
          revision = next;
          return;
        }
      }
    } catch (_) {}
    ready = false;
    throw Error('Xung đột phiên bản: Dữ liệu trên cloud đã bị thay đổi bởi phiên khác hoặc không khớp revision.');
  }
}

export function durabilityStatus() {
  return { configured: configured(), ready, revision };
}

export function durableWrites(req, res, next) {
  if (req.method === 'POST' && req.path === '/ai/chat') {
    if (!req.user) return authenticateToken(req, res, () => durableWrites(req, res, next));
    if (req.user.role === 'DIRECTOR') return next();
  }
  if (!configured() || ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || ['/auth/login', '/auth/logout', '/excel/preview'].includes(req.path)) {
    return next();
  }
  const run = async () => {
    if (!ready) {
      if (configured()) {
        try {
          await initializeDurableState();
        } catch (_) {}
      }
    }
    if (!ready) {
      res.status(503).json({
        success: false,
        error: 'Tạm chưa thể lưu: Database bền vững chưa sẵn sàng. Thay đổi chưa được ghi nhận.'
      });
      return;
    }
    const before = captureState();
    const end = res.end.bind(res);
    let finished = false;
    await new Promise(resolve => {
      res.end = function (...args) {
        if (finished) return res;
        finished = true;
        (async () => {
          try {
            if (res.statusCode < 400) {
              if (res.getHeader('X-Idempotent-Replay') !== 'true') {
                await flushState();
                try {
                  broadcastPLUpdate('DATA_MUTATED', {
                    trigger: 'DURABLE_WRITE',
                    revision,
                    reason: 'Dữ liệu đã được lưu bền vững trên Supabase'
                  });
                } catch (bErr) {
                  console.warn('[SSE] Không thể broadcast sau khi lưu:', bErr.message);
                }
              }
            } else {
              restoreState(before);
            }
            end(...args);
          } catch (e) {
            restoreState(before);
            res.statusCode = 503;
            res.removeHeader('Content-Length');
            res.setHeader('Content-Type', 'application/json');
            end(JSON.stringify({
              success: false,
              error: sanitizeError(e.message) + ' Thay đổi chưa được lưu; nội dung cũ được giữ lại.'
            }));
          } finally {
            resolve();
          }
        })();
        return res;
      };
      res.once('close', () => {
        if (!finished) {
          finished = true;
          restoreState(before);
          resolve();
        }
      });
      next();
    });
  };
  const task = queue.then(run);
  queue = task.catch(() => {});
  task.catch(next);
}
