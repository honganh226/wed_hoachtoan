// Bộ nghiệm thu nhập Excel qua API: MODE=local (cô lập + Supabase giả lập) hoặc MODE=online (web chính).
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { ROOT, secrets, Suite, sleep, startMockSupabase, spawnBackend, runInit, waitHealthy, makeClient, buildWorkbook, previewFile, isoContainer } from './lib.mjs';

const MODE = process.env.MODE || 'local';
const RUN = 'R' + Date.now().toString(36).toUpperCase();
const S = new Suite(`accept_import_suite [${MODE}] ${RUN}`);
const outDir = path.join(ROOT, 'scratch/accept_runtime'); fs.mkdirSync(outDir, { recursive: true });
const dir = path.join(outDir, `${MODE}_${RUN}`); fs.mkdirSync(dir, { recursive: true });
const ONLINE_BASE = 'https://cong-ty-van-tai.onrender.com';
const LOCAL_PORT = 5120; const MOCK_PORT = 5920;
const base = MODE === 'online' ? ONLINE_BASE : `http://127.0.0.1:${LOCAL_PORT}`;
const sb = secrets();

let mock = null; let backend = null; let dbSeq = 0;
async function startLocalBackend() {
  const dbPath = path.join(dir, `t${++dbSeq}.db`);
  await runInit({ dbPath, runtimeDir: dir });
  backend = spawnBackend({ dbPath, port: LOCAL_PORT, supabasePort: MOCK_PORT, runtimeDir: dir, logFile: path.join(dir, 'backend.log') });
  if (!(await waitHealthy(base))) throw new Error('Backend local không khởi động được');
}
async function stopLocalBackend() { if (backend) { backend.kill(); await sleep(800); backend = null; } }

const c = makeClient(base);
const cust = (k) => `ACPT-${RUN}-${k}`;
const place = (k) => `ACPT-${RUN} ${k}`;
const plateA = `15C-${String(Math.floor(Math.random() * 90000) + 10000)}`;
const plateB = `15C-${String(Math.floor(Math.random() * 90000) + 10000)}`;
let seqCont = 100000;
const cont = () => isoContainer('ACP', String(++seqCont));
const batchIds = []; const fuelDatesCreated = [];
const evidence = { run: RUN, mode: MODE, base };

const trips = async () => (await c.get('/api/v1/business/trips')).json?.data?.trips || [];
const mine = async () => (await trips()).filter((t) => String(t.customer_name).startsWith(`ACPT-${RUN}`));
const overviewKpis = async () => { const r = await c.get('/api/v1/business/overview?start_date=2026-01-01&end_date=2026-01-31'); if (r.status !== 200) throw new Error('overview HTTP ' + r.status); return r.json.data.kpis; };
const debtsNow = async () => (await c.get('/api/v1/business/debts?start_date=2026-01-01&end_date=2026-01-31')).json.data;
const batchesNow = async () => (await c.get('/api/v1/excel/batches')).json?.data || [];
const dayOf = (i) => `${String(i).padStart(2, '0')}/01/2026`;

async function doPreview(rows, filename = `acpt_${RUN}.xlsx`) {
  const r = await previewFile(c, buildWorkbook(rows), filename);
  return r;
}
async function doCommit(pv, key) {
  return c.call('POST', '/api/v1/excel/commit', { preview_id: pv.json.data.preview_id, rows: pv.json.data.rows, filename: pv.json.data.filename, sheetName: pv.json.data.sheet_name }, { headers: key ? { 'Idempotency-Key': key } : {} });
}
const row = (o) => ({ route: place('TUYEN'), plate: plateA, ...o });

try {
  // ---------------- 0. Môi trường ----------------
  if (MODE === 'local') {
    mock = await startMockSupabase(MOCK_PORT);
    await startLocalBackend();
  }
  await c.login('giamdoc', sb.DIRECTOR_INIT_PASSWORD);
  const meta = await c.get('/api/v1/manage/metadata');
  S.api('metadata', meta); S.check('read_only=false', meta.json?.data?.read_only, false);
  const preTrips = await trips();
  const preNonTest = preTrips.filter((t) => !String(t.customer_name).startsWith('ACPT-')).map((t) => t.id).sort();
  evidence.pre_user_trip_ids = preNonTest.length;
  const baseK = await overviewKpis(); const baseD = await debtsNow();
  const baseBatches = (await batchesNow()).length;

  // chọn ngày giá dầu chưa có (không đụng dữ liệu người dùng)
  const fp = await c.get('/api/v1/business/fuel-prices?month=2026-01'); S.api('danh sách giá dầu', fp);
  const used = new Set((fp.json?.data?.prices || fp.json?.data || []).map((p) => p.apply_date));
  const free = []; for (let d = 31; d >= 20 && free.length < 2; d--) { const k = `2026-01-${String(d).padStart(2, '0')}`; if (!used.has(k)) free.push(d); }
  S.check('có 2 ngày chưa có giá dầu để thử', free.length, 2);
  const [dFuel, dNo] = free; // ngày có giá dầu, ngày không có
  const up = await c.post('/api/v1/business/fuel-prices', { apply_date: `2026-01-${String(dFuel).padStart(2, '0')}`, price_per_liter: 21000, note: `ACPT ${RUN}` });
  S.api('nhập giá dầu 21.000 đ/lít', up); fuelDatesCreated.push(`2026-01-${String(dFuel).padStart(2, '0')}`);

  // ---------------- 1. Ca đối chiếu bắt buộc (13.000.000 / 750.000) ----------------
  const f0 = await doPreview([row({ date: dayOf(dNo), customer: cust('F0'), cont: cont(), toll: 750000, fare: 13000000 })], `acpt_${RUN}_f0.xlsx`);
  if (S.api('xem trước ca bắt buộc', f0)) {
    const s = f0.json.data.summary;
    S.check('F0 cước gốc', s.total_cuoc_goc, 13000000); S.check('F0 VAT 8%', s.total_vat_8, 1040000);
    S.check('F0 cước có VAT', s.total_cuoc_co_vat, 14040000); S.check('F0 khoản trừ 17%', s.total_khoan_tru_17, 2386800);
    S.check('F0 cước sau trừ 17%', s.total_cuoc_sau_tru_17, 11653200); S.check('F0 chi phí công ty', s.total_company_cost, 750000);
    S.check('F0 chênh lệch sau trừ (margin_after_deduction_17)', s.margin_after_deduction_17, 10903200);
    S.check('F0 temp_profit trùng chênh lệch sau trừ', s.temp_profit, 10903200);
    S.check('F0 chênh lệch trước khoản trừ (đối chiếu riêng)', s.profit_before_deduction, 13000000 - 750000);
    S.check('F0 không tạm tính', s.is_provisional, false);
  }

  // ---------------- 2. File F1: số tiền khác nhau từng khoản + dầu + thiếu giá dầu ----------------
  const r1 = row({ date: dayOf(dFuel), customer: cust('A'), cont: cont(), plate: plateA, liftOnPlace: place('Cảng X'), liftOnFee: 150000, liftOffPlace: place('Bãi Y'), liftOffFee: 120000, phoi: 300000, fuelL: 100, toll: 70000, extra: 40000, fare: 10000000 });
  const r2 = row({ date: dayOf(dNo), customer: cust('B'), cont: cont(), plate: plateB, liftOnPlace: place('Cảng X'), liftOnFee: 10000, fuelL: 50, toll: 30000, fare: 5000000 });
  const F1 = [r1, r2];
  const pv1 = await doPreview(F1, `acpt_${RUN}_f1.xlsx`);
  const exp1 = { total_cuoc_goc: 15000000, total_vat_8: 1200000, total_cuoc_co_vat: 16200000, total_khoan_tru_17: 2754000, total_cuoc_sau_tru_17: 13446000, total_lift_on_fee: 160000, total_lift_off_fee: 120000, total_phoi_advance: 300000, total_dau_lit: 150, total_fuel_cost: 2100000, total_tien_duong: 100000, total_phat_sinh: 40000, total_company_cost: 2520000, margin_after_deduction_17: 10926000, fuel_missing_rows: 1, fuel_missing_liters: 50, is_provisional: true };
  if (S.api('xem trước F1', pv1)) {
    const d = pv1.json.data;
    S.check('F1 số dòng', d.total_rows, 2); S.check('F1 dòng mới', d.new_count, 2); S.check('F1 dòng trùng', d.duplicate_count, 0);
    const s = d.summary; for (const [k, v] of Object.entries(exp1)) S.check(`F1 preview.${k}`, s[k], v);
    S.truthy('F1 có ghi chú tạm tính (thiếu giá dầu)', typeof s.provisional_note === 'string' && s.provisional_note.includes('50 lít'), s.provisional_note);
    S.check('F1 dòng 1 nơi nâng/hạ', [d.rows[0].lift_on_location, d.rows[0].lift_on_fee, d.rows[0].lift_off_location, d.rows[0].lift_off_fee], [place('Cảng X'), 150000, place('Bãi Y'), 120000]);
    S.check('F1 dòng 1 tiền dầu = 100L × 21.000 (một lần)', [d.rows[0].fuel_unit_price, d.rows[0].fuel_cost], [21000, 2100000]);
    S.check('F1 dòng 2 thiếu giá dầu', [d.rows[1].is_fuel_price_missing, d.rows[1].fuel_cost], [true, 0]);
    S.truthy('F1 danh mục mới nhận diện', d.master_data.customers.new.includes(cust('A')) && d.master_data.vehicles.new.includes(plateA), d.master_data.customers.new);
    S.check('F1 chọn sheet', d.available_sheets, ['BangKe']);
  }
  // nhiều sheet: chọn đúng sheet
  const multi = await previewFile(c, buildWorkbook([row({ date: dayOf(dNo), customer: cust('M'), cont: cont(), fare: 1000000 })], { extraSheets: ['Phu1', 'Phu2'] }), `acpt_${RUN}_multi.xlsx`, 'BangKe');
  if (S.api('xem trước file nhiều sheet', multi)) { S.check('nhiều sheet: danh sách', multi.json.data.available_sheets, ['BangKe', 'Phu1', 'Phu2']); S.check('nhiều sheet: sheet đang đọc', multi.json.data.sheet_name, 'BangKe'); }

  // ---------------- 3. Commit F1 + đối chiếu Excel → xem trước → lưu → chi tiết → báo cáo ----------------
  const cm1 = await doCommit(pv1, `acpt-${RUN}-1`);
  S.api('commit F1', cm1, 201);
  const b1 = cm1.json?.data?.batch_id; if (b1) batchIds.push(b1); evidence.batch_f1 = b1;
  S.check('commit F1 số cuốc', cm1.json?.data?.inserted_count, 2);
  const m1 = await mine(); const A = m1.find((t) => t.customer_name === cust('A')); const B = m1.find((t) => t.customer_name === cust('B'));
  S.truthy('F1 lưu đủ 2 chuyến', !!A && !!B, m1.length);
  evidence.trip_codes = m1.map((t) => t.trip_code);
  if (A) {
    const exA = { lift_on_location: place('Cảng X'), lift_on_fee: 150000, lift_off_location: place('Bãi Y'), lift_off_fee: 120000, phi_nang: 150000, phi_ha: 120000, tien_duong: 70000, phat_sinh: 40000, dau_liters: 100, fuel_unit_price: 21000, tien_dau: 2100000, chi_phi_cong_ty: 2480000, cuoc_goc: 10000000, vat_amount: 800000, cuoc_co_vat: 10800000, khoan_tru_17: 1836000, cuoc_sau_tru_17: 8964000, chenh_lech_sau_tru_17: 6484000, is_fuel_price_missing: false };
    for (const [k, v] of Object.entries(exA)) S.check(`lưu A.${k}`, A[k], v);
    const det = await c.get('/api/v1/business/trip/' + A.id);
    if (S.api('chi tiết chuyến A', det)) {
      const d = det.json.data?.trip || det.json.data;
      S.check('chi tiết A chênh lệch sau trừ', d.chenh_lech_sau_tru_17, 6484000);
      S.check('chi tiết A chi phí công ty', d.chi_phi_cong_ty, 2480000);
      S.check('chi tiết A phơi trả hộ', [d.phoi_advances?.length, d.phoi_advances?.[0]?.advance_amount, d.phoi_advances?.[0]?.refund_status], [1, 300000, 'CHUA_HOAN']);
    }
  }
  if (B) {
    const exB = { lift_on_location: place('Cảng X'), lift_on_fee: 10000, lift_off_fee: 0, phi_ha: 0, tien_duong: 30000, dau_liters: 50, tien_dau: 0, is_fuel_price_missing: true, chi_phi_cong_ty: 40000, cuoc_goc: 5000000, cuoc_sau_tru_17: 4482000, chenh_lech_sau_tru_17: 4442000, is_result_incomplete: true };
    for (const [k, v] of Object.entries(exB)) S.check(`lưu B.${k}`, B[k], v);
  }
  const k1 = await overviewKpis();
  const dk = (name) => k1[name] - baseK[name];
  const mapOv = { total_revenue_pre_vat: 15000000, total_vat_8: 1200000, total_revenue_with_vat: 16200000, total_deduction_17: 2754000, total_revenue_after_deduction: 13446000, total_company_cost: 2520000, margin_after_deduction_17: 10926000, total_lift_on_fee: 160000, total_lift_off_fee: 120000, total_toll_fee: 100000, total_other_cost: 40000, fuel_liters: 150, total_fuel_cost: 2100000, total_phoi_advance: 300000, total_phoi_refunded: 0, total_phoi_due: 300000 };
  for (const [k, v] of Object.entries(mapOv)) S.check(`tổng quan Δ ${k}`, dk(k), v);
  S.check('tổng quan Δ số cuốc', k1.trips_count - baseK.trips_count, 2);
  S.check('tổng quan Δ cuốc thiếu giá dầu', k1.missing_fuel_price_trips_count - baseK.missing_fuel_price_trips_count, 1);
  const d1 = await debtsNow();
  S.check('công nợ Δ phải thu có VAT', d1.receivables.total_receivable_with_vat - baseD.receivables.total_receivable_with_vat, 16200000);
  S.check('công nợ Δ tiền phơi chưa hoàn (theo dõi riêng)', d1.receivables.total_phoi_due - baseD.receivables.total_phoi_due, 300000);
  const custRow = d1.receivables.customers.find((x) => x.customer_name === cust('A'));
  S.check('công nợ theo khách A: phải thu có VAT & phơi', [custRow?.balance_due, custRow?.phoi_balance_due], [10800000, 300000]);
  const rem = await c.get('/api/v1/business/eir-reminders'); S.api('nhắc việc phơi', rem);
  const inRem = [...(rem.json?.data?.no_due_date || []), ...(rem.json?.data?.overdue || []), ...(rem.json?.data?.upcoming || []), ...(rem.json?.data?.due_today || [])].find((a) => a.customer_name === cust('A'));
  S.check('phơi vào theo dõi hoàn tiền riêng', [inRem?.advance_amount, inRem?.balance_due], [300000, 300000]);
  evidence.snapshot_after_f1 = { kpis_delta: Object.fromEntries(Object.keys(mapOv).map((k) => [k, dk(k)])), rev: mock ? mock.revision() : null };

  // ---------------- 4. Chống trùng ----------------
  const tripsCount = async () => (await mine()).length;
  // 4.1 nhập lại cùng file
  const pvDup = await doPreview(F1, `acpt_${RUN}_f1.xlsx`);
  S.check('4.1 nhập lại cùng file: trùng', pvDup.json?.data?.duplicate_count, 2);
  const cmDup = await doCommit(pvDup); S.api('4.1 commit lại', cmDup, 200); S.check('4.1 không thêm cuốc', cmDup.json?.data?.inserted_count, 0); S.check('4.1 tổng cuốc', await tripsCount(), 2);
  // 4.2 đổi tên file, giữ nội dung
  const pvRen = await doPreview(F1, `doi_ten_${RUN}.xlsx`);
  S.check('4.2 đổi tên file: trùng', pvRen.json?.data?.duplicate_count, 2);
  const cmRen = await doCommit(pvRen); S.check('4.2 không thêm cuốc', cmRen.json?.data?.inserted_count, 0);
  // 4.3 giám đốc sửa chuyến A (đổi tuyến + cước) rồi nhập lại
  const listA = (await c.get('/api/v1/manage/trips')).json.data.find((t) => t.id === A?.id);
  const edit = await c.put(`/api/v1/manage/trips/${A.id}`, { values: { route_name: place('TUYEN-DA-SUA'), cuoc_goc: 10500000 }, version: listA?._version, reason: `ACPT ${RUN} sửa thử` });
  S.api('4.3 giám đốc sửa chuyến A', edit);
  const Aedit = (await mine()).find((t) => t.id === A.id);
  S.check('4.3 chuyến A sau sửa', [Aedit?.route_name, Aedit?.cuoc_goc], [place('TUYEN-DA-SUA'), 10500000]);
  const pvAfterEdit = await doPreview(F1, `acpt_${RUN}_f1.xlsx`);
  S.check('4.3 nhập lại sau khi sửa: cả 2 dòng vẫn bị nhận là trùng', pvAfterEdit.json?.data?.duplicate_count, 2);
  const cmAE = await doCommit(pvAfterEdit); S.check('4.3 không thêm cuốc', cmAE.json?.data?.inserted_count, 0);
  const AeditAfter = (await mine()).find((t) => t.id === A.id);
  S.check('4.3 chuyến đã sửa được bảo toàn', [AeditAfter?.route_name, AeditAfter?.cuoc_goc], [place('TUYEN-DA-SUA'), 10500000]);
  // 4.4 file có dòng cũ + dòng mới
  const n3 = row({ date: dayOf(dNo), customer: cust('C'), cont: cont(), toll: 11000, fare: 3000000 });
  const n4 = row({ date: dayOf(dNo), customer: cust('D'), cont: cont(), toll: 12000, fare: 4000000 });
  const pvMix = await doPreview([...F1, n3, n4], `acpt_${RUN}_mix.xlsx`);
  S.check('4.4 file trộn: [tổng, mới, trùng]', [pvMix.json?.data?.total_rows, pvMix.json?.data?.new_count, pvMix.json?.data?.duplicate_count], [4, 2, 2]);
  const cmMix = await doCommit(pvMix); S.api('4.4 commit file trộn', cmMix, 201); if (cmMix.json?.data?.batch_id) batchIds.push(cmMix.json.data.batch_id);
  S.check('4.4 chỉ thêm dòng mới', cmMix.json?.data?.inserted_count, 2); S.check('4.4 tổng cuốc', await tripsCount(), 4);
  // 4.5 hai xác nhận đồng thời — cùng file
  const n5 = row({ date: dayOf(dNo), customer: cust('E'), cont: cont(), toll: 13000, fare: 2000000 });
  const [p5a, p5b] = [await doPreview([n5], `acpt_${RUN}_c1.xlsx`), await doPreview([n5], `acpt_${RUN}_c1b.xlsx`)];
  const [c5a, c5b] = await Promise.all([doCommit(p5a, `acpt-${RUN}-5a`), doCommit(p5b, `acpt-${RUN}-5b`)]);
  for (const r of [c5a, c5b]) if (r.json?.data?.batch_id) batchIds.push(r.json.data.batch_id);
  S.check('4.5 hai commit đồng thời cùng file: tổng cuốc thêm', (c5a.json?.data?.inserted_count || 0) + (c5b.json?.data?.inserted_count || 0), 1);
  S.check('4.5 tổng cuốc', await tripsCount(), 5);
  // 4.6 hai xác nhận đồng thời — hai file khác nhau trùng một dòng
  const n6 = row({ date: dayOf(dNo), customer: cust('F'), cont: cont(), toll: 14000, fare: 2100000 });
  const n7 = row({ date: dayOf(dNo), customer: cust('G'), cont: cont(), toll: 15000, fare: 2200000 });
  const n8 = row({ date: dayOf(dNo), customer: cust('H'), cont: cont(), toll: 16000, fare: 2300000 });
  const [p6a, p6b] = [await doPreview([n6, n7], `acpt_${RUN}_x1.xlsx`), await doPreview([n7, n8], `acpt_${RUN}_x2.xlsx`)];
  const [c6a, c6b] = await Promise.all([doCommit(p6a), doCommit(p6b)]);
  for (const r of [c6a, c6b]) if (r.json?.data?.batch_id) batchIds.push(r.json.data.batch_id);
  S.check('4.6 hai file chồng nhau đồng thời: tổng cuốc thêm = 3 (không nhân đôi dòng chung)', (c6a.json?.data?.inserted_count || 0) + (c6b.json?.data?.inserted_count || 0), 3);
  S.check('4.6 tổng cuốc', await tripsCount(), 8);
  S.check('4.6 không có hai cuốc cùng khách G', (await mine()).filter((t) => t.customer_name === cust('G')).length, 1);

  // ---------------- 5. Khôi phục sau khởi động lại (local: tắt backend, DB mới, nạp từ Supabase giả) ----------------
  const snap = async () => { const ts = (await mine()).map((t) => ({ code: t.trip_code, cust: t.customer_name, goc: t.cuoc_goc, cost: t.chi_phi_cong_ty, nang: t.lift_on_fee, ha: t.lift_off_fee, dau: t.tien_dau })).sort((a, b) => a.cust.localeCompare(b.cust)); const k = await overviewKpis(); const d = await debtsNow(); const b = (await batchesNow()).filter((x) => batchIds.includes(x.id)).map((x) => [x.id, x.total_rows, x.status]).sort(); return { ts, kpis: { r: k.total_revenue_pre_vat, cost: k.total_company_cost, m: k.margin_after_deduction_17, n: k.trips_count, phoi: k.total_phoi_due }, debt: { due: d.receivables.total_due, phoi: d.receivables.total_phoi_due }, b }; };
  const before = await snap();
  evidence.before_restart = { trips: before.ts.length, batches: before.b.length, revenue: before.kpis.r, cost: before.kpis.cost, revision: mock?.revision() ?? null };
  if (MODE === 'local') {
    const revBefore = mock.revision(); const t0 = new Date().toISOString();
    await stopLocalBackend(); await startLocalBackend(); await c.login('giamdoc', sb.DIRECTOR_INIT_PASSWORD);
    const after = await snap();
    S.check('5 khởi động lại: dữ liệu khôi phục từ Supabase giống hệt trước đó', after, before, `restart lúc ${t0}; DB cục bộ mới hoàn toàn`);
    S.check('5 revision Supabase không đổi khi khởi động lại', mock.revision(), revBefore);
    evidence.restart = { at: t0, revision: revBefore, trips: after.ts.length };
  } else {
    S.notTested('5 khởi động lại dịch vụ online', 'Không có quyền Render API trong phiên này; kiểm tra bằng lần redeploy do GitHub kích hoạt (xem báo cáo).');
  }

  // ---------------- 6. Lỗi lưu / mất kết nối (chỉ local, bơm lỗi vào Supabase giả) ----------------
  if (MODE === 'local') {
    const batchesBefore = (await batchesNow()).length; const tcBefore = await tripsCount();
    // 6.1 Supabase từ chối lưu: không nhập dở
    const n9 = row({ date: dayOf(dNo), customer: cust('I'), cont: cont(), toll: 17000, fare: 1900000 });
    const p9 = await doPreview([n9], `acpt_${RUN}_fail.xlsx`);
    mock.opts.failNextPatch = { count: 1 };
    const c9 = await doCommit(p9, `acpt-${RUN}-9`);
    S.check('6.1 Supabase lỗi: HTTP 503 và success=false', [c9.status, c9.json?.success], [503, false]);
    S.check('6.1 không nhập dở: số cuốc & số đợt không đổi', [await tripsCount(), (await batchesNow()).length], [tcBefore, batchesBefore]);
    const c9r = await doCommit(p9, `acpt-${RUN}-9`); S.api('6.1 thử lại sau khi lỗi', c9r, 201); if (c9r.json?.data?.batch_id) batchIds.push(c9r.json.data.batch_id);
    S.check('6.1 thử lại: đúng 1 cuốc', [c9r.json?.data?.inserted_count, await tripsCount()], [1, tcBefore + 1]);
    // 6.2 mất phản hồi sau khi Supabase đã ghi: hệ thống kiểm tra lại trước khi báo kết quả
    const n10 = row({ date: dayOf(dNo), customer: cust('J'), cont: cont(), toll: 18000, fare: 1800000 });
    const p10 = await doPreview([n10], `acpt_${RUN}_drop.xlsx`);
    const revB = mock.revision(); mock.opts.dropResponseNext = { count: 1 };
    const c10 = await doCommit(p10, `acpt-${RUN}-10`);
    S.api('6.2 mất phản hồi nhưng đã lưu: hệ thống xác minh và báo thành công', c10, 201); if (c10.json?.data?.batch_id) batchIds.push(c10.json.data.batch_id);
    S.check('6.2 revision tăng đúng 1', mock.revision(), revB + 1);
    const c10r = await doCommit(p10, `acpt-${RUN}-10b`);
    S.check('6.2 thử lại: không nhân đôi', [c10r.json?.data?.inserted_count, (await mine()).filter((t) => t.customer_name === cust('J')).length], [0, 1]);
    // 6.3 client ngắt kết nối ngay sau khi gửi
    const n11 = row({ date: dayOf(dNo), customer: cust('K'), cont: cont(), toll: 19000, fare: 1700000 });
    const p11 = await doPreview([n11], `acpt_${RUN}_abort.xlsx`);
    const payload = JSON.stringify({ preview_id: p11.json.data.preview_id, rows: p11.json.data.rows, filename: p11.json.data.filename, sheetName: p11.json.data.sheet_name });
    await new Promise((resolve) => { const req = http.request({ host: '127.0.0.1', port: LOCAL_PORT, path: '/api/v1/excel/commit', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.state.token, 'Content-Length': Buffer.byteLength(payload), 'Idempotency-Key': `acpt-${RUN}-11` } }); req.on('error', () => {}); req.write(payload); setTimeout(() => { req.destroy(); resolve(); }, 30); });
    await sleep(2500);
    const kNow = (await mine()).filter((t) => t.customer_name === cust('K')).length; const batchK = (await batchesNow()).filter((x) => x.file_name === `acpt_${RUN}_abort.xlsx` && x.status === 'ACTIVE').length;
    S.check('6.3 ngắt kết nối: trạng thái nhất quán (cuốc và đợt nhập cùng có hoặc cùng không)', kNow, batchK, `kết quả sau ngắt: ${kNow} cuốc / ${batchK} đợt`);
    const c11 = await doCommit(p11, `acpt-${RUN}-11b`); if (c11.json?.data?.batch_id) batchIds.push(c11.json.data.batch_id);
    S.check('6.3 kiểm tra rồi thử lại: cuối cùng đúng 1 cuốc', (await mine()).filter((t) => t.customer_name === cust('K')).length, 1);
    const dupBatches = (await batchesNow()).filter((x) => x.file_name === `acpt_${RUN}_abort.xlsx` && x.status === 'ACTIVE').length;
    S.check('6.3 chỉ có 1 đợt nhập đang hiệu lực cho file đó', dupBatches, 1);
  } else {
    S.notTested('6 bơm lỗi lưu/mất kết nối trên web chính', 'Không bơm lỗi vào hệ thống thật; đã kiểm tra đầy đủ trong môi trường cô lập.');
  }

  // ---------------- 7. Dọn đúng dữ liệu theo mã đợt ----------------
  const allBatches = [...new Set(batchIds)];
  const results = [];
  for (const id of allBatches) {
    const rb = await c.post(`/api/v1/excel/batches/${id}/rollback`, {});
    results.push({ id, status: rb.status, error: rb.json?.error || null, master: rb.json?.data?.master_cleanup || null });
  }
  evidence.cleanup = results;
  const blocked = results.filter((r) => r.status !== 200);
  S.check('7 đợt bị chặn hoàn tác chỉ là đợt có chuyến đã bị chỉnh sửa (F1)', blocked.map((r) => r.id), blocked.length ? [b1] : []);
  if (blocked.length) {
    S.truthy('7 lý do chặn rõ ràng', String(blocked[0].error).includes('chỉnh sửa'), blocked[0].error);
    // Hoàn tác cưỡng bức có kiểm soát đợt thử đã bị sửa để dọn sạch dữ liệu test
    const rb2 = await c.post(`/api/v1/excel/batches/${b1}/rollback`, { force: true });
    S.api(`7 hoàn tác có force đợt F1 (${b1})`, rb2);
    evidence.cleanup_f1_after_delete = { status: rb2.status, error: rb2.json?.error || null, master: rb2.json?.data?.master_cleanup || null };
  }
  const leftovers = (await mine()).length; S.check('7 không còn chuyến thử', leftovers, 0);
  const clearFuel = [];
  for (const d of fuelDatesCreated) { const r = await c.del(`/api/v1/business/fuel-prices/${d}`); clearFuel.push([d, r.status]); }
  S.check('7 xóa giá dầu thử', clearFuel.map((x) => x[1]), fuelDatesCreated.map(() => 200));
  const names = async (entity, key) => (await c.get(`/api/v1/manage/${entity}`)).json.data.map((x) => x[key]);
  const left = { customers: (await names('customers', 'name')).filter((n) => n.includes(`ACPT-${RUN}`)), routes: (await names('routes', 'route_name')).filter((n) => n.includes(`ACPT-${RUN}`)), ports: (await names('ports', 'name')).filter((n) => n.includes(`ACPT-${RUN}`)), vehicles: (await names('vehicles', 'plate_number')).filter((n) => [plateA, plateB].includes(n)) };
  S.check('7 danh mục do đợt thử tạo đã được dọn (không còn bản ghi tham chiếu)', left, { customers: [], routes: [], ports: [], vehicles: [] });
  const postTrips = (await trips()).filter((t) => !String(t.customer_name).startsWith('ACPT-')).map((t) => t.id).sort();
  S.check('7 dữ liệu người dùng được bảo toàn (danh sách chuyến không thuộc đợt thử)', postTrips, preNonTest);
  const kEnd = await overviewKpis(); const dEnd = await debtsNow();
  S.check('7 tổng quan trở về như trước khi thử', [kEnd.trips_count, kEnd.total_revenue_pre_vat, kEnd.total_company_cost, kEnd.total_phoi_due], [baseK.trips_count, baseK.total_revenue_pre_vat, baseK.total_company_cost, baseK.total_phoi_due]);
  S.check('7 công nợ trở về như trước khi thử', [dEnd.receivables.total_due, dEnd.receivables.total_phoi_due], [baseD.receivables.total_due, baseD.receivables.total_phoi_due]);
} catch (e) {
  S._push({ step: 'LỖI KỊCH BẢN: ' + e.message, status: 'FAIL', expected: 'không lỗi', actual: String(e.stack).split('\n').slice(0, 3).join(' | ') });
} finally {
  await stopLocalBackend(); if (mock) await mock.close();
  fs.writeFileSync(path.join(dir, 'evidence.json'), JSON.stringify(evidence, null, 2));
  S.finish(path.join(dir, 'results.json'));
}
