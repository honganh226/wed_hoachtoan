/**
 * Sửa loại cont trống bị gán 40DC (26/11/2026): POST /manage/trips/batch-clear-container-type.
 * Chạy trên DB tạm riêng.
 *   node src/tests/containerBlankFix.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hoachtoan-cont-'));
process.env.NODE_ENV = 'test';
process.env.IS_TEST = 'true';
process.env.DB_PATH = path.join(tmp, 'cont.db');
process.env.GROUP_ALLOCATIONS_PATH = path.join(tmp, 'groups.json');
fs.writeFileSync(process.env.DB_PATH, '');

const { db } = await import('../db/database.js');
const { createTrip } = await import('../services/trip.service.js');
const { lockPeriod, unlockPeriod } = await import('../services/periodLock.service.js');
const { saveEntity, listEntity, clearContainerTypeBatch, undoChange, CONTAINER_BLANK_FIX } = await import('../services/directorData.service.js');

const nowIso = new Date().toISOString();
db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, area_id, phone, is_active, created_at, updated_at)
  VALUES ('cont-dir', 'cont-giamdoc', 'khong-dang-nhap', 'GĐ kiểm thử', 'DIRECTOR', NULL, NULL, 1, ?, ?)`).run(nowIso, nowIso);
const director = { id: 'cont-dir', userId: 'cont-dir', username: 'cont-giamdoc', role: 'DIRECTOR' };

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`  ✅ ${name}`); };

// Giả lập dữ liệu nhập trước 25/11/2026: ô loại cont trống nhưng bị lưu thành 40DC
const mk = (date, size, extra = {}) => {
  const t = createTrip({ tripData: { trip_date: date, customer_name: 'KH THU CONT', vehicle_plate: 'XE NGOÀI', base_revenue: 2000000, trip_revenue: 2000000, container_number: `TEST${Math.random().toString().slice(2, 9)}`, container_size: size, container_type_raw: size, ...extra }, user: director });
  db.prepare('UPDATE trips SET raw_data = ? WHERE id = ?').run(JSON.stringify({ G: '' }), t.id);
  return t.id;
};
const withOverlay = mk('2099-03-02', '40DC');
const plain = mk('2099-03-03', '40DC');
const realHC = mk('2099-03-04', '40HC');
const locked = mk('2099-04-05', '40DC');
const stale = mk('2099-03-06', '40DC');
// Cuốc đã được giám đốc sửa (thu tiền) -> lớp phủ director_records chứa các trường loại cont 40DC
const ov = listEntity('trips').find(r => r.id === withOverlay);
saveEntity('trips', withOverlay, { customer_payment_status: 'TUOI' }, ov._version, director, 'kiểm thử');
const overlayValue = () => JSON.parse(db.prepare("SELECT value FROM director_records WHERE entity='trips' AND record_id=?").get(withOverlay).value);
assert.ok(['container_type_raw', 'container_code', 'container_size'].some(k => String(overlayValue()[k] || '').toUpperCase().includes('40')), 'lớp phủ phải có loại cont 40 trước khi sửa');

const row = id => listEntity('trips').find(r => r.id === id);
const before = Object.fromEntries([withOverlay, plain].map(id => [id, row(id)]));

lockPeriod({ periodMonth: '2099-04', user: director, notes: 'kiểm thử' });
let result;
try {
  const items = [withOverlay, plain, realHC, locked].map(id => ({ id, version: row(id)._version }));
  items.push({ id: stale, version: 'sai-phien-ban' });
  result = clearContainerTypeBatch(items, director, 'Excel nguồn để trống loại cont');
} finally {
  unlockPeriod({ periodMonth: '2099-04', user: director, notes: 'kiểm thử' });
}
const byId = Object.fromEntries(result.results.map(r => [r.id, r]));

await check('Chỉ sửa cuốc 40DC hợp lệ; bỏ qua 40HC, tháng khóa sổ, sai phiên bản', () => {
  assert.equal(result.ok, 2);
  assert.equal(byId[withOverlay].ok, true);
  assert.equal(byId[plain].ok, true);
  assert.equal(byId[realHC].skipped, true);
  assert.equal(byId[locked].ok, false);
  assert.match(byId[locked].error, /khóa sổ/);
  assert.equal(byId[stale].ok, false);
});

await check('Loại cont về trống ở bảng trips, containers và lớp phủ; hiển thị không còn 40/40DC', () => {
  for (const id of [withOverlay, plain]) {
    assert.equal(db.prepare('SELECT container_type_raw FROM trips WHERE id=?').get(id).container_type_raw, '');
    for (const c of db.prepare('SELECT container_size, container_type FROM containers WHERE trip_id=?').all(id)) {
      assert.equal(c.container_size, '');
      assert.equal(c.container_type, '');
    }
    const r = row(id);
    assert.equal(r.container_type_raw || '', '');
    assert.equal(r.container_size || '', '');
    assert.equal(r.container_code || '', '');
  }
  const o = overlayValue();
  for (const k of ['container_type_raw', 'container_code', 'container_size']) assert.equal(o[k] ?? '', '');
});

await check('Không đổi tiền, trạng thái thu, số cont và raw_data', () => {
  for (const id of [withOverlay, plain]) {
    const a = row(id); const b = before[id];
    for (const k of ['cuoc_goc', 'received_amount', 'offset_amount', 'customer_payment_status', 'container_number', 'chenh_lech_sau_tru_17', 'trip_date', 'customer_name']) assert.deepEqual(a[k], b[k], k);
    assert.equal(db.prepare('SELECT raw_data FROM trips WHERE id=?').get(id).raw_data, JSON.stringify({ G: '' }));
  }
  assert.equal(row(withOverlay).customer_payment_status, 'TUOI');
});

await check('Cuốc 40HC thật và cuốc tháng khóa sổ giữ nguyên', () => {
  assert.equal(db.prepare('SELECT container_type_raw FROM trips WHERE id=?').get(realHC).container_type_raw, '40HC');
  assert.equal(db.prepare('SELECT container_type_raw FROM trips WHERE id=?').get(locked).container_type_raw, '40DC');
});

await check('Ghi lịch sử rút gọn có giá trị cũ; nút hoàn tác từ chối', () => {
  const h = db.prepare("SELECT * FROM director_history WHERE record_id=? AND after_value LIKE ?").get(plain, `%${CONTAINER_BLANK_FIX}%`);
  assert.ok(h);
  assert.equal(h.reason, 'Excel nguồn để trống loại cont');
  const b = JSON.parse(h.before_value);
  assert.equal(b.trip_column, '40DC');
  assert.ok(b.containers.length >= 1);
  assert.ok(h.before_value.length < 2000, `lịch sử quá lớn: ${h.before_value.length}`);
  assert.throws(() => undoChange(h.id, director), /không hoàn tác/);
});

await check('Chạy lại lần hai: cuốc đã sửa bị bỏ qua, không ghi lịch sử thêm', () => {
  const n0 = db.prepare('SELECT COUNT(*) n FROM director_history').get().n;
  const again = clearContainerTypeBatch([{ id: plain, version: row(plain)._version }], director, 'lần hai');
  assert.equal(again.ok, 0);
  assert.equal(again.results[0].skipped, true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM director_history').get().n, n0);
});

await check('Từ chối danh sách rỗng, quá 50 dòng hoặc thiếu lý do', () => {
  assert.throws(() => clearContainerTypeBatch([], director, 'x'));
  assert.throws(() => clearContainerTypeBatch(Array.from({ length: 51 }, (_, i) => ({ id: String(i) })), director, 'x'));
  assert.throws(() => clearContainerTypeBatch([{ id: plain }], director, ' '));
});

// 27/11/2026: 20' -> 20, 40' -> 40 (cách ghi feet); KẸP giữ nguyên
const legacyNotation = (date, v) => {
  const id = mk(date, '40HC');
  db.prepare('UPDATE trips SET container_type_raw = ? WHERE id = ?').run(v, id);
  db.prepare("UPDATE containers SET container_size = ?, container_type = '' WHERE trip_id = ?").run(v, id);
  return id;
};
const feet20 = legacyNotation('2099-05-02', "20'");
const feet40 = legacyNotation('2099-05-03', "40'");
const kep = legacyNotation('2099-05-04', 'KẸP');
const r20 = clearContainerTypeBatch([feet20, kep].map(id => ({ id, version: row(id)._version })), director, 'chuẩn hóa cách ghi feet', "20'");
const r40 = clearContainerTypeBatch([{ id: feet40, version: row(feet40)._version }], director, 'chuẩn hóa cách ghi feet', "40'");

await check("20' thành 20, 40' thành 40 ở trips, containers, hiển thị; KẸP bỏ qua", () => {
  assert.equal(r20.ok, 1);
  assert.equal(r20.results.find(x => x.id === kep).skipped, true);
  assert.equal(r40.ok, 1);
  for (const [id, v] of [[feet20, '20'], [feet40, '40']]) {
    assert.equal(db.prepare('SELECT container_type_raw FROM trips WHERE id=?').get(id).container_type_raw, v);
    for (const c of db.prepare('SELECT container_size, container_type FROM containers WHERE trip_id=?').all(id)) {
      assert.equal(c.container_size, v);
      assert.equal(c.container_type, 'DC');
    }
    const r = row(id);
    assert.equal(r.container_type_raw, v);
    assert.equal(r.container_code, v);
  }
  assert.equal(db.prepare('SELECT container_type_raw FROM trips WHERE id=?').get(kep).container_type_raw, 'KẸP');
  const h = db.prepare("SELECT * FROM director_history WHERE record_id=? AND after_value LIKE '%CONTAINER_TYPE_NOTATION%'").get(feet20);
  assert.equal(JSON.parse(h.before_value).trip_column, "20'");
  assert.throws(() => undoChange(h.id, director), /không hoàn tác/);
});

await check('Từ chối loại cont chưa có quy tắc (KẸP, X)', () => {
  assert.throws(() => clearContainerTypeBatch([{ id: kep, version: row(kep)._version }], director, 'x', 'KẸP'), /Chưa có quy tắc/);
  assert.throws(() => clearContainerTypeBatch([{ id: kep, version: row(kep)._version }], director, 'x', 'X'), /Chưa có quy tắc/);
});

await check("Nhập mới: 20' được lưu thành 20", () => {
  const id = mk('2099-05-05', "20'");
  assert.equal(db.prepare('SELECT container_type_raw FROM trips WHERE id=?').get(id).container_type_raw, '20');
});

console.log(`PASS container type fix: ${passed}/10`);
