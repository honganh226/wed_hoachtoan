import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAuthToken } from '../services/api.js';
import { calculateTripFinancials } from '../utils/tripFinancials.js';

const paymentLabels = {
  CHUA_TT: 'Chưa thanh toán',
  TUOI: 'Thanh toán ngay (Tươi)',
  X: 'Đã trả sau một thời gian',
  DA_TT: 'Đã thanh toán',
  DOI_TRU: 'Đối trừ',
  CN_30_NGAY: 'Công nợ 30 ngày'
};

async function request(path, method = 'GET', body, requestId = null) {
  const headers = {
    Authorization: 'Bearer ' + getAuthToken(),
    'Content-Type': 'application/json'
  };
  if (requestId) headers['Idempotency-Key'] = requestId;
  const response = await fetch('/api/v1/manage' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw Error(result.error || 'Không thể lưu dữ liệu');
  return result.data;
}

export default function DataManagementView({ assistantFocus, onAssistantFocusConsumed, onAssistantContext }) {
  const opKeyRef = useRef({ sig: null, key: null });
  const [assistantPeriod, setAssistantPeriod] = useState(null), [assistantEntity, setAssistantEntity] = useState(null);
  const [meta, setMeta] = useState(null), [entity, setEntity] = useState('trips'), [rows, setRows] = useState([]), [query, setQuery] = useState(''), [editing, setEditing] = useState(null), [draft, setDraft] = useState({}), [reason, setReason] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [history, setHistory] = useState(null);
  const [deleting, setDeleting] = useState(null), [deleteReason, setDeleteReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([request('/metadata'), request('/' + entity)]);
      setMeta(m);
      setRows(r);
    } catch (e) {
      setError(e.message);
    }
  }, [entity]);

  useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('business-data-changed', refresh);
    const timer = setInterval(refresh, 30000);
    return () => {
      window.removeEventListener('business-data-changed', refresh);
      clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!assistantFocus) return;
    setEntity('trips');
    setQuery(assistantFocus.query || assistantFocus.id || '');
    setAssistantPeriod(assistantFocus.period || null);
    setAssistantEntity(assistantFocus.entity || null);
    onAssistantFocusConsumed?.();
  }, [assistantFocus?.nonce]);

  useEffect(() => {
    const q = query.trim().toLocaleLowerCase('vi');
    let selected = entity === 'trips' ? assistantEntity : null;
    if (q && !selected && entity === 'trips') {
      for (const [key, kind] of [['id', 'trip'], ['vehicle_plate', 'vehicle'], ['customer_name', 'customer'], ['driver_name', 'driver']]) {
        const match = rows.find(r => String(r[key] || '').toLocaleLowerCase('vi') === q);
        if (match) { selected = { kind, value: match[key] }; break; }
      }
    }
    onAssistantContext?.({ period: entity === 'trips' ? (assistantPeriod || { all: true }) : null, entity: selected });
  }, [entity, assistantPeriod, assistantEntity, query, rows, onAssistantContext]);

  const config = meta?.entities.find(e => e.key === entity);
  const shown = rows.filter(r => entity !== 'trips' || !assistantPeriod || assistantPeriod.all || (r.trip_date >= assistantPeriod.startDate && r.trip_date <= assistantPeriod.endDate)).filter(r => JSON.stringify(r).toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));

  function open(row) {
    if (!config) return;
    setEditing(row || {});
    setDraft(row ? { ...row, phoi_customer_sync_mode: 'KEEP_OLD' } : Object.fromEntries(config.fields.map(f => [f.key, f.type === 'boolean' ? 0 : f.type === 'select' ? f.options[0] : ''])));
    setReason('');
    setError('');
    opKeyRef.current = { sig: null, key: null };
  }

  function moneyText(value) {
    return value == null ? '' : new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
  }

  function input(f) {
    const v = draft[f.key] ?? '';
    const change = value => setDraft(d => {
      const next = { ...d, [f.key]: value };
      if (f.key === 'cuoc_goc') next.cuoc_vao = value;
      if (f.key === 'cuoc_vao') next.cuoc_goc = value;
      return next;
    });
    if (f.type === 'boolean') return <label className="flex gap-2 items-center h-10"><input type="checkbox" checked={Boolean(v)} onChange={e => change(e.target.checked ? 1 : 0)} />Có</label>;
    if (f.type === 'select' || f.type === 'ref') {
      const options = f.type === 'ref' ? meta.references[f.options] || [] : f.options.map(o => ({ id: o, label: paymentLabels[o] || o }));
      return (
        <select aria-label={f.label} className="w-full rounded-lg border p-2 bg-white min-w-0" value={v} onChange={e => change(e.target.value)}>
          <option value="">Chọn…</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      );
    }
    return (
      <input
        aria-label={f.label}
        required={f.required}
        className="w-full rounded-lg border p-2 min-w-0"
        type={['date', 'month'].includes(f.type) ? f.type : 'text'}
        inputMode={['money', 'number'].includes(f.type) ? 'decimal' : undefined}
        value={f.type === 'money' ? moneyText(v) : v}
        onChange={e => change(f.type === 'money' ? e.target.value.replace(/[^0-9]/g, '') : e.target.value)}
      />
    );
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const values = {};
      for (const f of config.fields) {
        let v = draft[f.key];
        if (['money', 'number'].includes(f.type)) v = v === '' ? (f.key === 'base_salary_override' ? null : 0) : Number(v);
        values[f.key] = v;
      }
      if (entity === 'trips' && editing?.id) {
        values.phoi_customer_sync_mode = draft.phoi_customer_sync_mode || 'KEEP_OLD';
        values.sync_open_advances_customer = draft.phoi_customer_sync_mode === 'SYNC_OPEN';
      }
      const bodyPayload = { values, version: editing._version, reason };
      const sig = `${entity}:${editing.id || 'new'}:${JSON.stringify(bodyPayload)}`;
      if (opKeyRef.current.sig !== sig || !opKeyRef.current.key) {
        opKeyRef.current = { sig, key: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `manage-${Date.now()}` };
      }
      await request('/' + entity + (editing.id ? '/' + encodeURIComponent(editing.id) : ''), editing.id ? 'PUT' : 'POST', bodyPayload, opKeyRef.current.key);
      opKeyRef.current = { sig: null, key: null };
      setEditing(null);
      const d = values.trip_date;
      const outside = entity === 'trips' && assistantPeriod && !assistantPeriod.all && d && ((assistantPeriod.startDate && d < assistantPeriod.startDate) || (assistantPeriod.endDate && d > assistantPeriod.endDate));
      setNotice(outside ? `Đã lưu chuyến vào cơ sở dữ liệu. Lưu ý: Ngày chuyến (${d}) nằm ngoài khoảng lọc đang xem.` : 'Đã lưu vào cơ sở dữ liệu. Báo cáo đang được cập nhật.');
      await load();
      window.dispatchEvent(new Event('business-data-changed'));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(e) {
    if (e) e.preventDefault();
    if (!deleting) return;
    if (!deleteReason || !deleteReason.trim() || deleteReason.trim().length < 3) {
      setError('Vui lòng nhập lý do xóa / hủy tối thiểu 3 ký tự để phục vụ kiểm toán.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await request('/' + entity + '/' + encodeURIComponent(deleting.id), 'DELETE', {
        reason: deleteReason.trim(),
        version: deleting._version
      });
      setDeleting(null);
      setDeleteReason('');
      setNotice(res?.message || 'Đã xóa/hủy bản ghi thành công. Báo cáo đang được cập nhật.');
      await load();
      window.dispatchEvent(new Event('business-data-changed'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const draftFin = entity === 'trips' && editing ? calculateTripFinancials({
    base_revenue: Number(draft.cuoc_goc ?? draft.cuoc_vao ?? 0),
    subcontractor_cost: Number(draft.cuoc_ra || 0),
    toll_fee: Number(draft.tien_duong || 0),
    lift_on_fee: Number(draft.lift_on_fee || 0),
    lift_off_fee: Number(draft.lift_off_fee || 0),
    fuel_liters: Number(draft.dau_liters || 0),
    fuel_unit_price: Number(draft.fuel_unit_price || 0),
    other_costs: Number(draft.parking_fee || 0) + Number(draft.handling_fee || 0) + Number(draft.meal_allowance || 0) + Number(draft.other_costs || 0)
  }) : null;

  return (
    <div className="ha-data-management space-y-4 pb-20">
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <h1 className="font-bold text-xl">Dữ liệu & chỉnh sửa</h1>
        <p className="text-sm text-slate-500">Tra cứu, bổ sung, sửa và xóa/hủy dữ liệu nghiệp vụ. Mọi thay đổi lưu bền vững và tự cập nhật các báo cáo.</p>
        {meta?.read_only && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Bản online đang chỉ xem trong khi chờ kết nối database bền vững. Bạn có thể mở biểu mẫu để kiểm tra; lưu sẽ được mở sau khi kết nối.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="border rounded-lg px-3 py-2 text-sm hover:bg-slate-50" onClick={load}>Tải lại</button>
          <button className="border rounded-lg px-3 py-2 text-sm hover:bg-slate-50" onClick={async () => {
            try { setHistory(await request('/history')); } catch (e) { setError(e.message); }
          }}>Lịch sử thay đổi</button>
          <button className="bg-slate-900 text-white rounded-lg px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-40" disabled={!config || busy || meta?.read_only} onClick={() => open(null)}>
            Thêm dữ liệu
          </button>
        </div>
      </div>

      {error && <p role="alert" className="bg-red-50 text-red-700 p-3 rounded-lg">{error}</p>}
      {notice && <p role="status" className="bg-emerald-50 text-emerald-800 p-3 rounded-lg">{notice}</p>}

      {assistantPeriod && !assistantPeriod.all && (
        <div className="text-xs bg-blue-50 p-2 rounded-lg">
          Phạm vi từ trợ lý: {assistantPeriod.startDate} đến {assistantPeriod.endDate}.{' '}
          <button className="underline" onClick={() => { setAssistantPeriod(null); setAssistantEntity(null); setQuery(''); }}>Xem toàn bộ</button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <select aria-label="Loại dữ liệu" className="border rounded-lg p-2 min-w-0 bg-white" value={entity} onChange={e => { setEntity(e.target.value); setQuery(''); setHistory(null); setDeleting(null); }}>
          {(meta?.entities || []).map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
        </select>
        <input aria-label="Tìm dữ liệu" placeholder="Tìm tên khách, tuyến, biển số…" value={query} onChange={e => { setQuery(e.target.value); setAssistantEntity(null); }} className="border rounded-lg p-2 min-w-0" />
      </div>

      <p className="text-xs text-slate-500">
        {shown.length} bản ghi · Cước vào là chưa VAT (+8% VAT, -17% nội bộ). Chi phí nhóm ô gộp vẫn cần phân bổ trước khi chốt lãi từng cuốc.
      </p>

      <div className="space-y-2">
        {shown.slice(0, 200).map(row => (
          <div key={row.id} className="bg-white border rounded-lg p-3 flex gap-3 items-start hover:border-slate-300 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="font-semibold break-words">
                {row.customer_name || row.full_name || row.plate_number || row.route_name || row.name || row.title || meta?.references?.drivers?.find(d => d.id === row.driver_id)?.label || row.id}
              </p>
              <p className="text-xs text-slate-500 break-words mt-1">
                {row.trip_date || row.effective_month || row.period_month || row.expense_date || row.advance_date || ''}
                {row.route_name && entity === 'trips' ? ' · ' + row.route_name : ''}
                {row.vehicle_plate ? ' · ' + row.vehicle_plate : ''}
                {row.container_size ? ` · [${row.container_size}]` : ''}
                {row.container_number ? ` · Cont: ${row.container_number}` : ''}
              </p>
              {entity === 'trips' && (
                <p className="text-sm mt-1">
                  Cước gốc {moneyText(row.cuoc_goc ?? row.cuoc_vao)} ₫ · Có VAT {moneyText(row.cuoc_co_vat)} ₫ · Sau trừ 17% {moneyText(row.cuoc_sau_tru_17)} ₫ · Chi phí {moneyText(row.direct_cost)} ₫ · {row.trip_profit == null ? 'Chờ phân bổ' : `Chênh lệch sau trừ 17%: ${moneyText(row.chenh_lech_sau_tru_17 ?? row.trip_profit)} ₫`}
                </p>
              )}
              {entity === 'salaries' && <p className="text-sm mt-1">{moneyText(row.amount)} ₫ / tháng</p>}
              {entity === 'expenses' && <p className="text-sm mt-1">Số tiền: {moneyText(row.amount)} ₫ {row.note ? `· ${row.note}` : ''}</p>}
              {entity === 'advances' && <p className="text-sm mt-1">Ứng: {moneyText(row.advance_amount)} ₫ · Quyết toán: {moneyText(row.settled_amount)} ₫ · Còn lại: {moneyText(row.balance_amount)} ₫</p>}
              {entity === 'eir_advances' && <p className="text-sm mt-1">Ứng phơi: {moneyText(row.advance_amount)} ₫ · Đã hoàn: {moneyText(row.refunded_amount)} ₫ · Trạng thái: {row.refund_status}</p>}
            </div>
            <div className="shrink-0 flex flex-col sm:flex-row gap-2">
              <button className="border rounded-lg px-3 py-2 text-sm text-blue-700 hover:bg-blue-50" onClick={() => open(row)}>Sửa</button>
              <button
                className="border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                disabled={meta?.read_only || busy}
                onClick={() => { setDeleting(row); setDeleteReason(''); setError(''); }}
              >
                Xóa/Hủy
              </button>
            </div>
          </div>
        ))}
        {shown.length > 200 && <p className="text-sm">Đang hiện 200 dòng đầu. Dùng ô tìm kiếm để thu hẹp.</p>}
      </div>

      {/* MODAL SỬA / THÊM DỮ LIỆU */}
      {editing && config && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 p-2 sm:p-4 flex items-center justify-center">
          <form onSubmit={save} className="bg-white rounded-xl w-full max-w-3xl max-h-[94vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b flex justify-between items-center gap-2">
              <h2 className="font-bold">{editing.id ? 'Sửa' : 'Thêm'} {config.label}</h2>
              <button type="button" aria-label="Đóng chỉnh sửa" className="p-2 text-slate-500 hover:text-slate-800" onClick={() => setEditing(null)}>✕</button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {config.fields.map(f => (
                  <div key={f.key} className="min-w-0">
                    <label className="block text-sm font-medium mb-1">{f.label}{f.required ? ' *' : ''}</label>
                    {input(f)}
                  </div>
                ))}
              </div>
              {entity === 'trips' && editing.id && draft.customer_name && editing.customer_name && draft.customer_name !== editing.customer_name && (Number(editing.phoi_count || 0) > 0 || Number(editing.phoi_total_advance || 0) > 0) && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs space-y-2">
                  <p className="font-bold text-amber-900">Cảnh báo đổi chủ hàng chuyến có Tiền phơi trả hộ ({editing.customer_name} → {draft.customer_name}):</p>
                  <p className="text-amber-800">Khoản phơi đã hoàn (ĐÃ HOÀN / TƯƠI) và lịch sử người trả tiền luôn được giữ nguyên theo chủ hàng cũ. Với khoản phơi đang còn mở, vui lòng chọn:</p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="phoi_sync" checked={(draft.phoi_customer_sync_mode || 'KEEP_OLD') === 'KEEP_OLD'} onChange={() => setDraft(d => ({ ...d, phoi_customer_sync_mode: 'KEEP_OLD' }))} />
                    <span><b>Giữ nguyên chủ hàng cũ ({editing.customer_name})</b> cho khoản phơi cũ (Mặc định)</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="phoi_sync" checked={draft.phoi_customer_sync_mode === 'SYNC_OPEN'} onChange={() => setDraft(d => ({ ...d, phoi_customer_sync_mode: 'SYNC_OPEN' }))} />
                    <span><b>Xác nhận chuyển khoản phơi đang còn mở sang chủ hàng mới ({draft.customer_name})</b> (Khoản đã hoàn vẫn giữ nguyên)</span>
                  </label>
                </div>
              )}
              <label className="block text-sm">
                Lý do chỉnh sửa
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Nhập lý do chỉnh sửa (tùy chọn)..." className="block w-full border rounded-lg p-2 mt-1 min-w-0" />
              </label>
              {entity === 'trips' && draftFin && (
                <div className="bg-slate-50 p-3 text-xs rounded-lg space-y-1 border">
                  <div>Cước gốc chưa VAT: <b>{moneyText(draftFin.cuoc_goc)} ₫</b> · VAT 8%: <b>+{moneyText(draftFin.vat_amount)} ₫</b> · Cước có VAT: <b>{moneyText(draftFin.cuoc_co_vat)} ₫</b></div>
                  <div>Khoản trừ 17% nội bộ: <b>-{moneyText(draftFin.khoan_tru_17)} ₫</b> · Cước sau trừ 17%: <b>{moneyText(draftFin.cuoc_sau_tru_17)} ₫</b> · Chi phí công ty: <b>-{moneyText(draftFin.chi_phi_cong_ty)} ₫</b></div>
                  <div className="font-bold text-slate-900 pt-1 border-t border-slate-200">Chênh lệch tạm tính sau trừ 17% & chi phí: {moneyText(draftFin.chenh_lech_sau_tru_17)} ₫ (Chưa trừ lương; không trừ tiền phơi trả hộ)</div>
                </div>
              )}
              {error && <p role="alert" className="text-red-700">{error}</p>}
            </div>
            <div className="p-4 border-t flex flex-wrap justify-end gap-2 bg-slate-50">
              <button type="button" className="border rounded-lg px-4 py-2 bg-white hover:bg-slate-100" onClick={() => setEditing(null)}>Hủy</button>
              <button disabled={busy || meta?.read_only} className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg px-4 py-2 font-medium">
                {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL XÁC NHẬN XÓA / HỦY DỮ LIỆU */}
      {deleting && (
        <div className="fixed inset-0 z-[65] bg-slate-900/60 p-2 sm:p-4 flex items-center justify-center">
          <div className="bg-white rounded-xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b bg-red-50 flex justify-between items-center">
              <h2 className="font-bold text-red-900 flex items-center gap-2">
                <span>⚠️</span> Xác nhận Xóa / Hủy {config?.label || entity}
              </h2>
              <button type="button" aria-label="Đóng" className="p-1 text-slate-500 hover:text-slate-800" onClick={() => setDeleting(null)}>✕</button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="bg-slate-50 p-3 rounded-lg border text-xs space-y-1">
                <div><b>Mã / Định danh:</b> {deleting.id}</div>
                {deleting.customer_name && <div><b>Khách hàng:</b> {deleting.customer_name}</div>}
                {deleting.trip_date && <div><b>Ngày chạy:</b> {deleting.trip_date}</div>}
                {deleting.plate_number && <div><b>Biển số:</b> {deleting.plate_number}</div>}
                {deleting.full_name && <div><b>Tên:</b> {deleting.full_name}</div>}
                {(deleting.cuoc_goc || deleting.cuoc_vao) && <div><b>Cước gốc:</b> {moneyText(deleting.cuoc_goc ?? deleting.cuoc_vao)} ₫</div>}
              </div>
              <p className="text-slate-600 text-xs">
                {entity === 'trips' && deleting.id?.startsWith('T1-2026-')
                  ? 'Lưu ý: Cuốc xe thuộc bảng kê tháng 1 sẽ được đánh dấu hủy an toàn (loại khỏi báo cáo, tổng cước và công nợ) mà không làm mất file gốc. Bạn có thể khôi phục trong Lịch sử thay đổi.'
                  : entity === 'trips'
                  ? 'Cuốc xe sẽ được xóa an toàn khỏi hệ thống nếu chưa có quyết toán hoàn phơi hoặc tạm ứng phụ thuộc.'
                  : ['vehicles', 'drivers', 'customers', 'subcontractors', 'routes', 'ports'].includes(entity)
                  ? 'Danh mục đã được dùng trong các chuyến xe sẽ được chuyển sang trạng thái ngưng hoạt động để bảo toàn lịch sử đối soát.'
                  : 'Bản ghi sẽ được xóa khỏi hệ thống kèm lưu vết người thực hiện vào nhật ký.'}
              </p>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Lý do xóa / hủy (bắt buộc để đối soát):</span>
                <input
                  required
                  placeholder="Nhập lý do xóa hoặc hủy bản ghi này..."
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  className="block w-full border rounded-lg p-2 mt-1 min-w-0"
                />
              </label>
              {error && <p role="alert" className="text-red-700 bg-red-50 p-2 rounded">{error}</p>}
            </div>
            <div className="p-4 border-t flex justify-end gap-2 bg-slate-50">
              <button type="button" className="border rounded-lg px-4 py-2 text-sm bg-white hover:bg-slate-100" onClick={() => setDeleting(null)}>Hủy bỏ</button>
              <button
                type="button"
                disabled={busy || meta?.read_only || !deleteReason.trim()}
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-semibold"
              >
                {busy ? 'Đang xử lý…' : 'Xác nhận xóa / hủy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LỊCH SỬ THAY ĐỔI */}
      {history && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-bold">Lịch sử thay đổi</h2>
            <button className="text-sm text-slate-500 hover:text-slate-800" onClick={() => setHistory(null)}>Đóng</button>
          </div>
          {history.length === 0 && <p className="text-sm text-slate-400">Chưa có thay đổi nào được ghi nhận.</p>}
          {history.map(h => (
            <div className="border-t pt-2 text-sm flex flex-wrap justify-between items-center gap-2" key={h.id}>
              <div>
                <span className="font-medium">{h.actor}</span> · {new Date(h.created_at).toLocaleString('vi-VN')}
                <p className="text-slate-500">{entitiesLabel(meta, h.entity)} · {h.reason}</p>
              </div>
              {Boolean(h.is_undone) ? (
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-medium">Đã hoàn tác</span>
              ) : (
                <button
                  disabled={meta?.read_only || busy}
                  className="border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-lg px-3 py-1 text-xs disabled:opacity-40"
                  onClick={async () => {
                    if (!window.confirm('Hoàn tác thay đổi này? Thao tác chỉ được thực hiện một lần duy nhất.')) return;
                    try {
                      await request('/history/' + h.id + '/undo', 'POST', {});
                      await load();
                      setHistory(await request('/history'));
                      window.dispatchEvent(new Event('business-data-changed'));
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  Hoàn tác
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function entitiesLabel(meta, key) {
  return meta?.entities?.find(e => e.key === key)?.label || key;
}
