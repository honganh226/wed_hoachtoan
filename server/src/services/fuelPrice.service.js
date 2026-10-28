/**
 * Service quản lý Giá dầu theo ngày (Daily Fuel Price Service)
 * Quy tắc (Codex Plan 28/10/2026):
 * - Mỗi ngày áp dụng (apply_date YYYY-MM-DD, múi giờ Việt Nam) có 1 đơn giá đồng/lít (VND integer > 0).
 * - Tiền dầu từng cuốc = lít dầu cấp × giá dầu của đúng ngày chạy (trip_date).
 * - Lưu lịch sử chỉnh sửa (fuel_price_history) gồm giá trước/sau, người sửa, thời điểm, số cuốc bị ảnh hưởng.
 */
import crypto from 'crypto';
import { db } from '../db/database.js';
import { toIntVnd, isValidCalendarDate } from '../utils/tripFinancials.js';
import { isPeriodLocked } from './periodLock.service.js';
import { invalidateExcelMonthCache } from './excelMonthService.js';

export function getFuelPriceMap() {
  const rows = db.prepare('SELECT apply_date, price_per_liter, note, updated_by, updated_at FROM fuel_prices ORDER BY apply_date DESC').all();
  const map = new Map();
  for (const r of rows) {
    map.set(String(r.apply_date).trim(), toIntVnd(r.price_per_liter));
  }
  return map;
}

export function getFuelPriceForDate(applyDate) {
  const d = String(applyDate || '').trim().slice(0, 10);
  if (!d) return null;
  const row = db.prepare('SELECT apply_date, price_per_liter, note, updated_by, updated_at FROM fuel_prices WHERE apply_date = ?').get(d);
  return row ? toIntVnd(row.price_per_liter) : null;
}

export function listFuelPrices({ month } = {}) {
  const m = String(month || '').trim();
  const rows = m
    ? db.prepare('SELECT * FROM fuel_prices WHERE apply_date LIKE ? ORDER BY apply_date DESC').all(`${m}%`)
    : db.prepare('SELECT * FROM fuel_prices ORDER BY apply_date DESC').all();

  const history = m
    ? db.prepare('SELECT * FROM fuel_price_history WHERE apply_date LIKE ? ORDER BY created_at DESC LIMIT 100').all(`${m}%`)
    : db.prepare('SELECT * FROM fuel_price_history ORDER BY created_at DESC LIMIT 100').all();

  return {
    prices: rows,
    history,
  };
}

export function upsertFuelPrice({ apply_date, price_per_liter, note = '', actor = 'system' }) {
  const dateStr = String(apply_date || '').trim().slice(0, 10);
  if (!isValidCalendarDate(dateStr)) {
    throw new Error('Ngày áp dụng giá dầu không hợp lệ trong lịch thực tế (định dạng chuẩn: YYYY-MM-DD).');
  }
  if (isPeriodLocked(dateStr)) {
    throw new Error(`Kỳ kế toán tháng [${dateStr.slice(0, 7)}] đã bị KHÓA SỔ. Không thể thay đổi giá dầu.`);
  }
  const price = toIntVnd(price_per_liter);
  if (price <= 0) {
    throw new Error('Đơn giá dầu phải là số nguyên lớn hơn 0 (đồng/lít).');
  }

  const nowIso = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM fuel_prices WHERE apply_date = ?').get(dateStr);
  const oldPrice = existing ? toIntVnd(existing.price_per_liter) : null;

  // Cập nhật các chuyến trong bảng trips có cùng trip_date
  const matchingTrips = db.prepare('SELECT id, fuel_liters FROM trips WHERE trip_date = ?').all(dateStr);
  const tripsWithFuel = matchingTrips.filter((t) => Number(t.fuel_liters || 0) > 0);

  const tx = db.transaction(() => {
    if (existing) {
      db.prepare(`
        UPDATE fuel_prices
        SET price_per_liter = ?, note = ?, updated_by = ?, updated_at = ?
        WHERE apply_date = ?
      `).run(price, String(note || '').trim(), actor, nowIso, dateStr);
    } else {
      db.prepare(`
        INSERT INTO fuel_prices (apply_date, price_per_liter, note, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(dateStr, price, String(note || '').trim(), actor, actor, nowIso, nowIso);
    }

    // Cập nhật fuel_unit_price & fuel_cost trên bảng trips cho ngày chạy đó
    const updateTripFuel = db.prepare(`
      UPDATE trips
      SET fuel_unit_price = ?, fuel_cost = ?, updated_at = ?
      WHERE id = ?
    `);
    for (const t of matchingTrips) {
      const liters = Math.max(0, Number(t.fuel_liters || 0));
      const cost = liters > 0 ? Math.round(liters * price) : 0;
      updateTripFuel.run(price, cost, nowIso, t.id);
    }

    const histId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO fuel_price_history (id, apply_date, old_price, new_price, affected_trips_count, note, actor, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(histId, dateStr, oldPrice, price, tripsWithFuel.length, String(note || '').trim(), actor, nowIso);
  });

  tx();
  invalidateExcelMonthCache();

  return {
    apply_date: dateStr,
    old_price: oldPrice,
    price_per_liter: price,
    affected_db_trips_count: tripsWithFuel.length,
    note: String(note || '').trim(),
    updated_by: actor,
    updated_at: nowIso,
  };
}

export function deleteFuelPrice({ apply_date, actor = 'system', reason = '' }) {
  const dateStr = String(apply_date || '').trim().slice(0, 10);
  if (!isValidCalendarDate(dateStr)) {
    throw new Error(`Ngày áp dụng giá dầu không hợp lệ trong lịch thực tế: ${dateStr}`);
  }
  if (isPeriodLocked(dateStr)) {
    throw new Error(`Kỳ kế toán tháng [${dateStr.slice(0, 7)}] đã bị KHÓA SỔ. Không thể xóa giá dầu.`);
  }
  const existing = db.prepare('SELECT * FROM fuel_prices WHERE apply_date = ?').get(dateStr);
  if (!existing) {
    throw new Error(`Không tìm thấy đơn giá dầu cho ngày ${dateStr}.`);
  }

  const nowIso = new Date().toISOString();
  const matchingTrips = db.prepare('SELECT id, fuel_liters FROM trips WHERE trip_date = ?').all(dateStr);
  const tripsWithFuel = matchingTrips.filter((t) => Number(t.fuel_liters || 0) > 0);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM fuel_prices WHERE apply_date = ?').run(dateStr);
    db.prepare('UPDATE trips SET fuel_unit_price = NULL, fuel_cost = 0, updated_at = ? WHERE trip_date = ?').run(nowIso, dateStr);
    db.prepare(`
      INSERT INTO fuel_price_history (id, apply_date, old_price, new_price, affected_trips_count, note, actor, created_at)
      VALUES (?, ?, ?, 0, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), dateStr, toIntVnd(existing.price_per_liter), tripsWithFuel.length, `Xóa giá dầu: ${reason}`, actor, nowIso);
  });

  tx();
  invalidateExcelMonthCache();
  return { deleted: true, apply_date: dateStr };
}
