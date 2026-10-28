import { createHash } from 'node:crypto';
import { db } from '../db/database.js';
import { authenticateToken } from './auth.middleware.js';
import { USER_ROLES } from '../db/schema.js';
import { errorResponse } from '../utils/response.js';
import { invalidateExcelMonthCache } from '../services/excelMonthService.js';

export function ensureWriteRequestsSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS write_requests (
      id TEXT PRIMARY KEY,
      body_hash TEXT NOT NULL,
      status INTEGER NOT NULL,
      response TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT ''
    )
  `);
  const cols = db.prepare('PRAGMA table_info(write_requests)').all().map((c) => c.name);
  if (!cols.includes('created_at')) {
    db.exec("ALTER TABLE write_requests ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
  }
}

try {
  ensureWriteRequestsSchema();
} catch (_) {}

function getRequiredRolesForMutation(pathStr) {
  if (/\/business\/group\/[^/]+\/allocate(\/|$)/.test(pathStr)) return [USER_ROLES.DIRECTOR];
  if (/\/excel\/batches\/[^/]+\/rollback(\/|$)/.test(pathStr)) return [USER_ROLES.DIRECTOR];
  if (/\/period-lock\/unlock(\/|$)/.test(pathStr)) return [USER_ROLES.DIRECTOR];
  if (/\/manage(\/|$)/.test(pathStr)) return [USER_ROLES.DIRECTOR];
  if (/\/business(\/|$)/.test(pathStr)) return [USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT];
  if (/\/period-lock(\/|$)/.test(pathStr)) return [USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT];
  if (/\/excel(\/|$)/.test(pathStr)) return [USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER];
  if (/\/trips(\/|$)/.test(pathStr)) return [USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER];
  return null;
}

export function idempotentWrites(req, res, next) {
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }

  const fullPath = (req.originalUrl || req.path || '').split('?')[0];
  // Không áp dụng cache phản hồi cho các endpoint xác thực công khai hoặc xem trước file
  if (
    /\/auth(\/|$)/.test(fullPath) ||
    /\/health(\/|$)/.test(fullPath) ||
    /\/info(\/|$)/.test(fullPath) ||
    /\/excel\/preview(\/|$)/.test(fullPath)
  ) {
    return next();
  }

  const requestId = req.get('Idempotency-Key');
  if (!requestId) {
    return next();
  }

  if (requestId.length > 128) {
    return res.status(400).json({ success: false, error: 'Mã yêu cầu quá dài (tối đa 128 ký tự).' });
  }

  const handleWithVerifiedUser = () => {
    if (!req.user) {
      return errorResponse(res, 'Chưa đăng nhập. Vui lòng cung cấp mã xác thực Token.', 401);
    }

    const requiredRoles = getRequiredRolesForMutation(fullPath);
    if (requiredRoles) {
      const userRole = req.user.role;
      const tokenRole = req.user.tokenRole || userRole;
      const dbRole = req.user.dbRole || null;
      if (
        !requiredRoles.includes(userRole) ||
        !requiredRoles.includes(tokenRole) ||
        (dbRole && !requiredRoles.includes(dbRole))
      ) {
        return errorResponse(
          res,
          `Quyền truy cập bị từ chối. Vai trò [${userRole}] không được phép thực hiện hành động này. Yêu cầu: [${requiredRoles.join(', ')}]`,
          403
        );
      }
    }

    const verifiedIdentity = String(req.user.userId ?? req.user.id ?? req.user.username ?? '');
    if (!verifiedIdentity) {
      return errorResponse(res, 'Danh tính người dùng không hợp lệ.', 401);
    }

    const normalizedPath = fullPath.replace(/\/eir-advances\/([^/]+)\/refunds$/, '/eir-advances/$1/refund');
    const requestIdKey = createHash('sha256')
      .update(`${verifiedIdentity}|${req.method}|${normalizedPath}|${requestId}`)
      .digest('hex');

    const bodyHash = createHash('sha256')
      .update(JSON.stringify(req.body || {}))
      .digest('hex');

    try {
      ensureWriteRequestsSchema();
    } catch (schemaErr) {
      return res.status(500).json({
        success: false,
        error: `Lỗi cấu trúc bảng chống ghi trùng: ${schemaErr.message}`
      });
    }

    const old = db.prepare('SELECT * FROM write_requests WHERE id = ?').get(requestIdKey);
    if (old) {
      if (old.body_hash !== bodyHash) {
        return res.status(409).json({
          success: false,
          message: 'Mã yêu cầu (Idempotency-Key) đã được sử dụng với nội dung khác.',
          error: 'Mã yêu cầu (Idempotency-Key) đã được sử dụng với nội dung khác.'
        });
      }
      const cachedData = JSON.parse(old.response);
      return res.status(old.status).json(cachedData);
    }

    let txOpen = false;
    try {
      db.exec('BEGIN IMMEDIATE');
      txOpen = true;
    } catch (txErr) {
      return res.status(500).json({
        success: false,
        error: `Không thể khởi tạo giao dịch nguyên tử: ${txErr.message}`
      });
    }

    const origJson = res.json.bind(res);
    res.json = function (body) {
      if (txOpen) {
        txOpen = false;
        if (res.statusCode < 400 && body && body.success !== false && !body.data?.failed) {
          try {
            ensureWriteRequestsSchema();
            db.prepare(`
              INSERT OR REPLACE INTO write_requests (id, body_hash, status, response, created_at)
              VALUES (?, ?, ?, ?, ?)
            `).run(requestIdKey, bodyHash, res.statusCode, JSON.stringify(body), new Date().toISOString());
            db.exec('COMMIT');
          } catch (err) {
            try { db.exec('ROLLBACK'); } catch (_) {}
            try { invalidateExcelMonthCache(); } catch (_) {}
            res.statusCode = 500;
            return origJson({
              success: false,
              message: `Không thể lưu khóa chống ghi trùng (Idempotency): ${err.message}. Giao dịch đã được hoàn tác.`,
              error: `Không thể lưu khóa chống ghi trùng (Idempotency): ${err.message}. Giao dịch đã được hoàn tác.`
            });
          }
        } else {
          try { db.exec('ROLLBACK'); } catch (_) {}
          try { invalidateExcelMonthCache(); } catch (_) {}
        }
      }
      return origJson(body);
    };

    res.once('close', () => {
      if (txOpen) {
        txOpen = false;
        try { db.exec('ROLLBACK'); } catch (_) {}
        try { invalidateExcelMonthCache(); } catch (_) {}
      }
    });

    return next();
  };

  if (!req.user) {
    return authenticateToken(req, res, handleWithVerifiedUser);
  }
  return handleWithVerifiedUser();
}
