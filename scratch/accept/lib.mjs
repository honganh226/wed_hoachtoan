// Thư viện nghiệm thu: kiểm tra có giá trị kỳ vọng, trạng thái PASS / FAIL / NOT_TESTED, thoát mã lỗi khi sai.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

export const ROOT = 'C:/WED_HOACHTOAN';
const require = createRequire(import.meta.url);
export const XLSX = require('C:/WED_HOACHTOAN/server/node_modules/xlsx');
export const SECRETS_PATH = 'C:/Users/mrdoa/.codex/.chatgpt-projects/g-p-6a97aa17354881918cc70fdd143c4c34/render-test-credentials.json';
export const secrets = () => JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8'));

export class Suite {
  constructor(name) { this.name = name; this.results = []; this.startedAt = new Date().toISOString(); }
  _push(r) {
    this.results.push(r);
    const tag = r.status === 'PASS' ? '✅ PASS' : r.status === 'FAIL' ? '❌ FAIL' : '⏭ NOT_TESTED';
    console.log(`${tag}  ${r.step}` + (r.status === 'FAIL' ? `\n      expected: ${JSON.stringify(r.expected)}\n      actual:   ${JSON.stringify(r.actual)}` : '') + (r.note ? `\n      ${r.note}` : ''));
  }
  // So sánh sâu bằng JSON; actual === undefined luôn là FAIL (không biến thiếu trường thành đạt).
  check(step, actual, expected, note) {
    const ok = actual !== undefined && JSON.stringify(actual) === JSON.stringify(expected);
    this._push({ step, status: ok ? 'PASS' : 'FAIL', expected, actual, note });
    if (!ok) this.failFast = true;
    return ok;
  }
  truthy(step, cond, actualInfo, note) {
    const ok = cond === true;
    this._push({ step, status: ok ? 'PASS' : 'FAIL', expected: true, actual: actualInfo ?? cond, note });
    return ok;
  }
  notTested(step, reason) { this._push({ step, status: 'NOT_TESTED', note: reason }); }
  // Phản hồi API phải có HTTP status đúng và cấu trúc {success:true,data}
  api(step, res, expectedStatus = 200) {
    const ok = res.status === expectedStatus && res.json && typeof res.json === 'object' && res.json.success === true && 'data' in res.json;
    this._push({ step: step + ` [HTTP ${expectedStatus}]`, status: ok ? 'PASS' : 'FAIL', expected: { status: expectedStatus, success: true }, actual: { status: res.status, success: res.json?.success, error: res.json?.error } });
    return ok;
  }
  summary(outFile) {
    const count = (s) => this.results.filter((r) => r.status === s).length;
    const sum = { suite: this.name, startedAt: this.startedAt, finishedAt: new Date().toISOString(), pass: count('PASS'), fail: count('FAIL'), not_tested: count('NOT_TESTED') };
    console.log(`\n=== ${this.name}: PASS=${sum.pass} FAIL=${sum.fail} NOT_TESTED=${sum.not_tested} ===`);
    if (outFile) { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify({ ...sum, results: this.results }, null, 2)); }
    return sum;
  }
  finish(outFile) {
    const s = this.summary(outFile);
    process.exitCode = s.fail > 0 ? 1 : 0;
    return s;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeClient(base) {
  const state = { token: null };
  async function call(method, p, body, { headers = {}, form = null, timeout = 60000 } = {}) {
    const h = { ...headers };
    if (state.token) h.Authorization = 'Bearer ' + state.token;
    let payload;
    if (form) payload = form; else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + p, { method, headers: h, body: payload, signal: AbortSignal.timeout(timeout) });
    let json = null; try { json = await res.json(); } catch { json = null; }
    return { status: res.status, json };
  }
  return {
    state, call,
    get: (p, o) => call('GET', p, undefined, o),
    post: (p, b, o) => call('POST', p, b, o),
    put: (p, b, o) => call('PUT', p, b, o),
    del: (p, b, o) => call('DELETE', p, b, o),
    async login(username, password) {
      const r = await call('POST', '/api/v1/auth/login', { username, password });
      if (r.status !== 200 || !r.json?.data?.token) throw new Error(`Đăng nhập ${username} thất bại: HTTP ${r.status}`);
      state.token = r.json.data.token; state.user = r.json.data.user; return r.json.data;
    }
  };
}

// ---------- Supabase giả lập (cùng giao thức PostgREST mà durableState.service dùng) ----------
export async function startMockSupabase(port, opts = {}) {
  const db = new Map();
  const stats = { patches: 0, drops: 0 };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== '/rest/v1/hoachtoan_state') { res.writeHead(404); return res.end(); }
    let body = ''; for await (const ch of req) body += ch;
    if (req.method === 'GET') { const r = db.get('main'); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(r ? [r] : [])); }
    if (req.method === 'POST') { const p = JSON.parse(body); db.set(p.id, p); res.writeHead(201, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify([p])); }
    if (req.method === 'PATCH') {
      const p = JSON.parse(body); const rev = (url.searchParams.get('revision') || '').replace('eq.', ''); const ex = db.get('main');
      if (opts.failNextPatch && opts.failNextPatch.count > 0) { opts.failNextPatch.count--; stats.drops++; res.writeHead(500); return res.end('{}'); }
      if (ex && String(ex.revision) === rev) {
        const u = { ...ex, revision: p.revision, payload: p.payload, write_id: p.write_id, payload_hash: p.payload_hash, updated_at: p.updated_at };
        db.set('main', u); stats.patches++;
        if (opts.dropResponseNext && opts.dropResponseNext.count > 0) { opts.dropResponseNext.count--; stats.drops++; return req.socket.destroy(); }
        res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify([u]));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('[]');
    }
    res.writeHead(405); res.end();
  });
  await new Promise((r) => server.listen(port, r));
  return { db, stats, opts, close: () => new Promise((r) => server.close(r)), revision: () => Number(db.get('main')?.revision ?? 0) };
}

export function spawnBackend({ dbPath, port, supabasePort, runtimeDir, logFile }) {
  const s = secrets();
  const env = {
    ...process.env, ...s, NODE_ENV: 'test', SERVE_TEST: 'true', ONLINE_EDITING: 'true', RENDER_READ_ONLY: 'true',
    PORT: String(port), DB_PATH: dbPath, GROUP_ALLOCATIONS_PATH: path.join(runtimeDir, 'groups.json'),
    EXCEL_PATH: path.join(ROOT, 'server/../tháng 1.xlsx'),
    SUPABASE_URL: `http://127.0.0.1:${supabasePort}`, SUPABASE_SERVICE_ROLE_KEY: 'mock-key', ENCRYPTION_KEY: s.ENCRYPTION_KEY || 'd'.repeat(64),
  };
  const out = fs.openSync(logFile, 'a');
  const p = spawn(process.execPath, ['src/index.js'], { cwd: path.join(ROOT, 'server'), env, stdio: ['ignore', out, out] });
  return p;
}

export async function runInit({ dbPath, runtimeDir }) {
  const s = secrets();
  const env = { ...process.env, ...s, NODE_ENV: 'test', DB_PATH: dbPath, ONLINE_EDITING: 'true', RENDER_READ_ONLY: 'true', EXCEL_PATH: path.join(ROOT, 'tháng 1.xlsx') };
  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['src/scripts/initRenderTest.js'], { cwd: path.join(ROOT, 'server'), env, stdio: 'ignore' });
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('initRenderTest lỗi ' + c))));
  });
}

export async function waitHealthy(base, tries = 80) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(base + '/api/v1/health'); if (r.ok) return true; } catch {} await sleep(400); }
  return false;
}

// ---------- Sinh Excel thử với số tiền khác nhau cho từng khoản ----------
export function isoContainer(owner3, serial6) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; const vals = {}; let v = 10;
  for (const ch of letters) { if (v % 11 === 0) v++; vals[ch] = v++; }
  const s = owner3 + 'U' + serial6; let sum = 0;
  for (let i = 0; i < 10; i++) { const c = s[i]; const n = /[A-Z]/.test(c) ? vals[c] : Number(c); sum += n * 2 ** i; }
  return s + (sum % 11) % 10;
}

export const HEADERS = ['STT', 'NGÀY', 'CHỦ HÀNG', 'TUYẾN', 'SỐ CONT', 'BKS', 'LOẠI CONT', 'NƠI NÂNG', 'PHÍ NÂNG', 'NƠI HẠ', 'PHÍ HẠ', 'PHƠI NÂNG HẠ', 'DẦU', 'TIỀN ĐƯỜNG', 'PHÁT SINH', 'CƯỚC VÀO', 'ĐÃ TT', 'CÔNG NỢ', 'GHI CHÚ'];
export function buildWorkbook(rows, { sheetName = 'BangKe', extraSheets = [] } = {}) {
  const wb = XLSX.utils.book_new();
  const aoa = [['BẢNG KÊ THỬ NGHIỆM'], HEADERS, ...rows.map((r, i) => [i + 1, r.date, r.customer, r.route, r.cont, r.plate, r.type || '40DC', r.liftOnPlace || '', r.liftOnFee ?? '', r.liftOffPlace || '', r.liftOffFee ?? '', r.phoi ?? '', r.fuelL ?? '', r.toll ?? '', r.extra ?? '', r.fare, '', r.debt || '', r.note || ''])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  for (const s of extraSheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Sheet phụ'], ['A', 'B']]), s);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
export async function previewFile(client, buffer, filename, sheetName) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
  if (sheetName) form.append('sheet_name', sheetName);
  return client.call('POST', '/api/v1/excel/preview', undefined, { form });
}
