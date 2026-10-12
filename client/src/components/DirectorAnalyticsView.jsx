import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, X, Search, CalendarDays, Scale, ClipboardList } from 'lucide-react';
import { MOCK_TRIPS_DATA, COMPANY_DRIVERS, COMPANY_VEHICLES, formatVnd } from '../data/mockBusinessData.js';
import { aggregateEntities, visibleEntities, filterScope, summarizeTrips, filterEntityTrips, periodRange, daysBetween, shiftDate, dateLabel } from '../utils/fleetAnalytics.mjs';
import TripDetailDrawer from './TripDetailDrawer.jsx';
import './fleet-analytics.css';

const ANCHOR = [...MOCK_TRIPS_DATA].map(t => t.trip_date).sort().at(-1);
const COVERED_DAYS = new Set(MOCK_TRIPS_DATA.map(t => t.trip_date));
export const INITIAL_ANALYTICS_STATE = {
  period: 'week', area: 'ALL', type: 'DRIVER', mode: 'VOLUME', sort: 'FEWEST', ownership: 'ALL',
  search: '', start: shiftDate(ANCHOR, -6), end: ANCHOR, selectedName: '', selectedDay: '',
  tripStatus: 'ALL', reconciliation: 'ALL', tripSearch: '', calendarEnd: ANCHOR, compareNames: []
};
const LABELS = { DRIVER: 'Tài xế', VEHICLE: 'Xe', ROUTE: 'Tuyến chạy', CUSTOMER: 'Khách hàng' };
const n = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
const shortDate = date => date.slice(8) + '/' + date.slice(5,7);

export default function DirectorAnalyticsView({ state, onStateChange, onCreateTask }) {
  const [localState, setLocalState] = useState(INITIAL_ANALYTICS_STATE);
  const model = state || localState;
  const update = patch => (onStateChange || setLocalState)(prev => ({ ...prev, ...patch }));
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const detailRef = useRef(null);
  const calendarRef = useRef(null);
  const range = periodRange(model.period, ANCHOR, model.start, model.end);
  const invalidRange = !range.start || !range.end || range.start > range.end || daysBetween(range.start, range.end).length >= 366;
  const scoped = useMemo(() => invalidRange ? [] : filterScope(MOCK_TRIPS_DATA, range, model.area), [range.start, range.end, model.area, invalidRange]);
  const rows = useMemo(() => aggregateEntities(scoped, model.type, COMPANY_DRIVERS, COMPANY_VEHICLES, model.area), [scoped, model.type, model.area]);
  const visible = useMemo(() => invalidRange ? [] : visibleEntities(rows, model.search, model.sort, ['DRIVER','VEHICLE'].includes(model.type) ? model.ownership : 'ALL'), [rows, model.search, model.sort, model.ownership, model.type, invalidRange]);
  const total = summarizeTrips(visible.flatMap(row => row.trips));
  const selected = visible.find(row => row.name === model.selectedName);
  const selectedTrips = selected ? filterEntityTrips(selected.trips, { date: model.selectedDay, status: model.tripStatus, reconciliation: model.reconciliation, search: model.tripSearch }) : [];
  const displayedTripIndex = selectedTrips.findIndex(t => t.id === selectedTrip?.id);
  const selectedTotals = summarizeTrips(selectedTrips);
  const startDay = invalidRange ? ANCHOR : model.calendarEnd > range.end || model.calendarEnd < range.start ? range.end : model.calendarEnd;
  const calendarStart = shiftDate(startDay, -6) < range.start ? range.start : shiftDate(startDay, -6);
  const calendarDays = invalidRange ? [] : daysBetween(calendarStart, startDay);
  const compared = rows.filter(row => model.compareNames.includes(row.name));
  const viewScope = `${dateLabel(range.start)} – ${dateLabel(range.end)} · ${model.area === 'ALL' ? 'Toàn công ty' : model.area === 'TUAN' ? 'Khu Tuân' : 'Khu Tuấn Anh'}`;

  useEffect(() => {
    if (model.selectedName && !selected) update({ selectedName: '', selectedDay: '' });
  }, [model.selectedName, selected]);
  // Only a newly opened entity moves the viewport; changing report mode keeps it in place.
  const openEntity = row => {
    update({ selectedName: row.name, selectedDay: '', tripStatus: 'ALL', reconciliation: 'ALL', tripSearch: '' });
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const createTask = trip => {
    const taskScope = viewScope + (model.selectedDay ? ` · Ngày ${dateLabel(model.selectedDay)}` : '') + (model.tripStatus !== 'ALL' ? ` · ${model.tripStatus === 'COMPLETED' ? 'Đã hoàn thành' : 'Đang chạy'}` : '') + (model.reconciliation !== 'ALL' ? ' · Theo bộ lọc đối soát đang chọn' : '') + (model.tripSearch ? ` · Tìm: ${model.tripSearch}` : '');
    const name = trip ? `${trip.trip_code} · ${trip.driver_name} · ${trip.vehicle_plate}` : selected.name;
    onCreateTask?.({
      title: `Rà soát ${trip ? 'chuyến ' + trip.trip_code : LABELS[model.type].toLowerCase() + ' ' + selected.name}`,
      issue_impact: trip ? `Chuyến ${trip.trip_code}: ${trip.status === 'COMPLETED' ? 'lãi từ chuyến' : 'lãi dự kiến'} ${formatVnd(trip.trip_profit)}. Cần đối chiếu chi phí và tình trạng vận hành.` : `${selectedTotals.completed} chuyến hoàn thành, ${selectedTotals.running} đang chạy, lãi từ chuyến ${formatVnd(selectedTotals.profit)}; ${selectedTotals.provisionalCount} chuyến còn tạm tính trong danh sách đang xem.`,
      related_info: `${name} · ${taskScope}`, related_type: trip ? 'TRIP' : model.type, related_code: trip ? trip.trip_code : selected.name,
      initial_note: '', assignee_name: 'Trần Văn Tuấn (Điều vận)', due_date: ''
    });
  };

  return <div className="fleet-report">
    <header className="fa-header"><div><span className="fa-eyebrow">BÁO CÁO QUẢN LÝ</span><h1>Sản lượng & hiệu quả</h1><p>Nhìn rõ mức hoạt động và phần lãi của từng tài xế, xe.</p></div>
      <div className="fa-period-controls"><label>Kỳ báo cáo<select aria-label="Kỳ báo cáo" value={model.period} onChange={e => update({ period: e.target.value, selectedDay: '', calendarEnd: ANCHOR })}><option value="week">7 ngày đến 09/10/2026</option><option value="day">Ngày 09/10/2026</option><option value="month">Tháng 10 đến 09/10/2026</option><option value="custom">Khoảng ngày</option></select></label>
        <label>Khu vực<select aria-label="Khu vực báo cáo" value={model.area} onChange={e => update({ area: e.target.value, selectedDay: '', compareNames: [] })}><option value="ALL">Toàn công ty</option><option value="TUAN">Khu Tuân</option><option value="TUAN_ANH">Khu Tuấn Anh</option></select></label></div>
    </header>
    {model.period === 'custom' && <div className="fa-custom"><label>Từ ngày<input aria-label="Từ ngày báo cáo" type="date" value={model.start} onChange={e => update({ start: e.target.value, selectedDay: '' })} /></label><label>Đến ngày<input aria-label="Đến ngày báo cáo" type="date" value={model.end} onChange={e => update({ end: e.target.value, calendarEnd: e.target.value, selectedDay: '' })} /></label></div>}
    <div className="fa-source"><span className="fa-demo">Dữ liệu mẫu</span><span>Chỉ có dữ liệu ngày 08–09/10/2026. Ngày khác hiển thị “chưa có dữ liệu”.</span></div>
    {invalidRange && <p role="alert" className="fa-error">Chọn khoảng ngày hợp lệ, tối đa 365 ngày; ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>}
    <section className="fa-main" aria-label="Báo cáo hiệu quả hoạt động">
      <div className="fa-report-controls"><div className="fa-object-buttons" aria-label="Đối tượng báo cáo">{Object.entries(LABELS).map(([type, label]) => <button type="button" key={type} aria-pressed={model.type === type} onClick={() => update({ type, selectedName: '', selectedDay: '', compareNames: [], search: '' })}>{label}</button>)}</div>
        <div className="fa-mode-buttons" aria-label="Góc xem"><button type="button" aria-pressed={model.mode === 'VOLUME'} onClick={() => update({ mode: 'VOLUME' })}>Sản lượng</button><button type="button" aria-pressed={model.mode === 'MONEY'} onClick={() => update({ mode: 'MONEY' })}>Hiệu quả tiền</button></div></div>
      <div className="fa-toolbar"><label className="fa-search"><Search size={16} /><input aria-label="Tìm đối tượng báo cáo" placeholder={`Tìm ${LABELS[model.type].toLowerCase()}…`} value={model.search} onChange={e => update({ search: e.target.value })} /></label>
        <label>Sắp xếp<select aria-label="Sắp xếp báo cáo" value={model.sort} onChange={e => update({ sort: e.target.value })}><option value="FEWEST">Ít chuyến nhất</option><option value="MOST">Nhiều chuyến nhất</option><option value="PROFIT">Lãi cao nhất</option><option value="MARGIN">Tỷ suất lãi cao nhất</option></select></label>
        {['DRIVER','VEHICLE'].includes(model.type) && <label>Phạm vi<select aria-label="Xe công ty hoặc thuê ngoài" value={model.ownership} onChange={e => update({ ownership: e.target.value })}><option value="ALL">Gồm xe thuê ngoài</option><option value="INTERNAL">Chỉ đội xe công ty</option></select></label>}
      </div>
      <div className="fa-summary-line"><b>{visible.length} {LABELS[model.type].toLowerCase()}</b><span>{viewScope}</span></div>
      <div className="fa-desktop-table fa-scroll"><table><caption className="sr-only">{model.mode === 'VOLUME' ? 'Sản lượng' : 'Hiệu quả tiền'} theo {LABELS[model.type].toLowerCase()}, {viewScope}</caption><thead><tr><th>{LABELS[model.type]}</th>{model.mode === 'VOLUME' ? <><th>Hoàn thành</th><th>Đang chạy</th><th>Cont ghi nhận</th><th>Ngày có chuyến</th><th>Chuyến / ngày có chuyến</th></> : <><th>Doanh thu</th><th>Chi phí trực tiếp</th><th>Lãi từ chuyến</th><th>Lãi / chuyến hoàn thành</th><th>Tỷ suất</th></>}<th><span className="sr-only">Mở chi tiết</span></th></tr></thead><tbody>
        {visible.map(row => <tr key={row.name} className={selected?.name === row.name ? 'fa-selected-row' : ''}><td><button className="fa-name" onClick={() => openEntity(row)}><strong>{row.name}</strong><small>{row.secondary}{row.outside ? ' · Thuê ngoài' : ''}</small></button></td>{model.mode === 'VOLUME' ? <><td>{row.completed}</td><td>{row.running || '—'}</td><td>{row.containers}{row.unknownContainers > 0 && <small>{row.unknownContainers} chuyến chưa có mã</small>}</td><td>{row.activeDays}</td><td>{row.averageTrips === null ? '—' : n(row.averageTrips)}</td></> : <><td>{formatVnd(row.revenue)}</td><td>{formatVnd(row.cost)}</td><td className={row.profit < 0 ? 'fa-loss' : 'fa-profit'}><b>{formatVnd(row.profit)}</b>{row.provisionalCount > 0 && <small className="fa-pending">Tạm tính: {formatVnd(row.provisional)}</small>}</td><td>{row.averageProfit === null ? '—' : formatVnd(Math.round(row.averageProfit))}</td><td>{row.margin === null ? '—' : n(row.margin) + '%'}</td></>}<td><button aria-label={`Xem ${row.name}`} className="fa-open" onClick={() => openEntity(row)}><ArrowRight size={16} /></button></td></tr>)}
        {!visible.length && <tr><td colSpan="7" className="fa-empty">Không tìm thấy đối tượng phù hợp. Hãy đổi tên tìm kiếm hoặc bộ lọc.</td></tr>}
      </tbody>{visible.length > 0 && <tfoot><tr><th>Tổng đang hiển thị</th>{model.mode === 'VOLUME' ? <><td>{total.completed}</td><td>{total.running}</td><td>{total.containers}</td><td colSpan="2">Không cộng số ngày giữa các tài xế/xe</td></> : <><td>{formatVnd(total.revenue)}</td><td>{formatVnd(total.cost)}</td><td>{formatVnd(total.profit)}</td><td>{total.averageProfit === null ? '—' : formatVnd(Math.round(total.averageProfit))}</td><td>{total.margin === null ? '—' : n(total.margin) + '%'}</td></>}<td /></tr></tfoot>}</table></div>
      <div className="fa-mobile-list">{visible.map(row => <button key={row.name} onClick={() => openEntity(row)}><span><strong>{row.name}</strong><small>{row.secondary}{row.outside ? ' · Thuê ngoài' : ''}</small></span><span className="fa-mobile-value"><b className={row.profit < 0 && model.mode === 'MONEY' ? 'fa-loss' : ''}>{model.mode === 'VOLUME' ? `${row.completed} chuyến` : formatVnd(row.profit)}</b><small>{model.mode === 'VOLUME' ? `${row.activeDays} ngày có chuyến · ${row.running} đang chạy` : !row.completed ? 'Chưa có chuyến hoàn thành' : row.provisionalCount ? `Có ${row.provisionalCount} chuyến tạm tính` : 'Đã đối soát'}</small></span><ArrowRight size={15} /></button>)}{!visible.length && <p className="fa-empty">Không tìm thấy đối tượng phù hợp.</p>}</div>
      <p className="fa-footnote">{model.mode === 'VOLUME' ? 'Ngày có chuyến chỉ tính ngày có chuyến hoàn thành. Cont ghi nhận là số mã trên các chuyến hoàn thành; cùng một cont có thể xuất hiện ở nhiều chuyến.' : 'Tiền chỉ tính chuyến hoàn thành. Lãi/chuyến dùng tổng lãi (gồm tạm tính) chia số chuyến hoàn thành; chưa trừ chi phí chung công ty.'}</p>
    </section>

    {selected && <section className="fa-detail" ref={detailRef} aria-label={`Chi tiết ${selected.name}`}>
      <div className="fa-detail-heading"><div><span className="fa-eyebrow">{LABELS[model.type]} ĐANG XEM</span><h2>{selected.name}</h2><p>{selected.secondary} · {viewScope}</p></div><div className="fa-actions">{onCreateTask && <button className="fa-primary" onClick={() => createTask()}><ClipboardList size={15} /> Giao việc liên quan</button>}<button className="fa-icon" aria-label="Đóng chi tiết đối tượng" onClick={() => update({ selectedName: '', selectedDay: '' })}><X size={18} /></button></div></div>
      <div className="fa-detail-metrics"><span><small>Hoàn thành / đang chạy</small><b>{selected.completed} / {selected.running}</b></span><span><small>Doanh thu trước thuế</small><b>{formatVnd(selected.revenue)}</b></span><span><small>Chi phí trực tiếp</small><b>{formatVnd(selected.cost)}</b></span><span><small>Lãi từ chuyến</small><b className={selected.profit < 0 ? 'fa-loss' : ''}>{formatVnd(selected.profit)}</b></span></div>
      <p className="fa-footnote">Đã đối soát: {formatVnd(selected.confirmed)} · Tạm tính: {formatVnd(selected.provisional)} ({selected.provisionalCount} chuyến hoàn thành).</p>
      <div className="fa-calendar" ref={calendarRef}><div className="fa-calendar-heading"><h3><CalendarDays size={17} /> Lịch hoạt động</h3><div><button aria-label="7 ngày trước" disabled={calendarStart <= range.start} onClick={() => update({ calendarEnd: shiftDate(calendarStart, -1), selectedDay: '' })}><ChevronLeft size={17} /></button><span>{shortDate(calendarStart)} – {shortDate(startDay)}</span><button aria-label="7 ngày sau" disabled={startDay >= range.end} onClick={() => update({ calendarEnd: shiftDate(startDay, 7) > range.end ? range.end : shiftDate(startDay, 7), selectedDay: '' })}><ChevronRight size={17} /></button></div></div>
        <div className="fa-day-grid">{calendarDays.map(date => { const covered = COVERED_DAYS.has(date); const daily = summarizeTrips(selected.trips.filter(t => t.trip_date === date)); return <button key={date} disabled={!covered} aria-pressed={model.selectedDay === date} aria-label={`${shortDate(date)}: ${covered ? `${daily.completed} hoàn thành, ${daily.running} đang chạy` : 'chưa có dữ liệu'}`} onClick={() => update({ selectedDay: model.selectedDay === date ? '' : date })}><span>{shortDate(date)}</span><b>{covered ? daily.completed : '—'}</b><small>{covered ? daily.running ? `${daily.running} đang chạy` : 'chuyến hoàn thành' : 'Chưa có dữ liệu'}</small></button>; })}</div>
        <p className="fa-footnote">0 = không ghi nhận chuyến hoàn thành trong dữ liệu ngày đó. Không đồng nghĩa nghỉ, xe rảnh hoặc hiệu suất kém.</p></div>
      <div className="fa-trips-heading"><h3>Chuyến liên quan <span>{selectedTrips.length}</span></h3>{model.selectedDay && <button className="fa-text-button" onClick={() => update({ selectedDay: '' })}>Ngày {shortDate(model.selectedDay)} <X size={13} /></button>}</div>
      <div className="fa-trip-filters"><label>Vận hành<select aria-label="Trạng thái vận hành" value={model.tripStatus} onChange={e => update({ tripStatus: e.target.value })}><option value="ALL">Tất cả</option><option value="COMPLETED">Đã hoàn thành</option><option value="RUNNING">Đang chạy</option></select></label><label>Đối soát<select aria-label="Trạng thái đối soát" value={model.reconciliation} onChange={e => update({ reconciliation: e.target.value })}><option value="ALL">Tất cả</option><option value="RECONCILED">Đã đối soát</option><option value="PROVISIONAL">Chưa đối soát</option><option value="MISSING_DATA">Thiếu chi phí</option><option value="PENDING_RECONCILIATION">Chờ duyệt</option></select></label><label className="fa-search"><Search size={15} /><input aria-label="Tìm chuyến hoặc container" placeholder="Mã chuyến, container, tuyến…" value={model.tripSearch} onChange={e => update({ tripSearch: e.target.value })} /></label></div>
      <div className="fa-trip-list">{selectedTrips.map(t => <button key={t.id} onClick={() => setSelectedTrip(t)}><span className="fa-trip-main"><b>{t.trip_code}</b><small>{shortDate(t.trip_date)} · {t.vehicle_plate} · {t.driver_name}</small><span>{t.route_name}</span><small>Cont: {t.container_number || 'Chưa có mã'}</small></span><span className="fa-trip-status"><span>{t.status === 'COMPLETED' ? 'Hoàn thành' : 'Đang chạy'}</span><small className={t.reconciliation_status === 'RECONCILED' ? '' : 'fa-pending'}>{t.reconciliation_status === 'RECONCILED' ? 'Đã đối soát' : t.reconciliation_status === 'MISSING_DATA' ? 'Thiếu chi phí' : 'Chờ đối soát'}</small></span><span className="fa-trip-value"><b className={t.trip_profit < 0 ? 'fa-loss' : ''}>{formatVnd(t.trip_profit)}</b><small>{t.status !== 'COMPLETED' ? 'Lãi dự kiến' : t.reconciliation_status !== 'RECONCILED' ? 'Lãi tạm tính' : 'Lãi đã đối soát'}</small></span><ArrowRight size={15} /></button>)}{!selectedTrips.length && <div className="fa-empty">Không có chuyến phù hợp trong dữ liệu đang xem.<button className="fa-text-button" onClick={() => update({ selectedDay: '', tripStatus: 'ALL', reconciliation: 'ALL', tripSearch: '' })}>Bỏ lọc chuyến</button></div>}</div>
      <div className="fa-trip-total"><span>{selectedTotals.completed} chuyến hoàn thành đang hiển thị</span><b>Tổng lãi: {formatVnd(selectedTotals.profit)}</b><small>{selectedTotals.running} chuyến đang chạy được tính riêng</small></div>
    </section>}

    <details className="fa-compare-options"><summary><Scale size={17} /> So sánh hai {LABELS[model.type].toLowerCase()}</summary><p>Chọn hai đối tượng trong cùng kỳ báo cáo. Số chuyến và lãi phản ánh chuyến được giao, không tự đánh giá năng lực tài xế.</p><div className="fa-compare-checks">{visible.map(row => <label key={row.name}><input type="checkbox" checked={model.compareNames.includes(row.name)} disabled={model.compareNames.length === 2 && !model.compareNames.includes(row.name)} onChange={e => update({ compareNames: e.target.checked ? [...model.compareNames, row.name] : model.compareNames.filter(name => name !== row.name) })} />{row.name}</label>)}</div><button className="fa-primary" disabled={compared.length !== 2} onClick={() => setCompareOpen(true)}>Xem so sánh ({compared.length}/2)</button></details>
    {compareOpen && <Comparison rows={compared} scope={viewScope} onClose={() => setCompareOpen(false)} onOpen={row => { setCompareOpen(false); openEntity(row); }} />}
    <TripDetailDrawer selectedTrip={selectedTrip} onClose={() => setSelectedTrip(null)} onPrev={() => setSelectedTrip(selectedTrips[displayedTripIndex-1])} onNext={() => setSelectedTrip(selectedTrips[displayedTripIndex+1])} hasPrev={displayedTripIndex > 0} hasNext={displayedTripIndex >= 0 && displayedTripIndex < selectedTrips.length-1} onCreateTask={onCreateTask ? () => { createTask(selectedTrip); setSelectedTrip(null); } : undefined} />
  </div>;
}

function Comparison({ rows, scope, onClose, onOpen }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!true) return;
    const before = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('button:not(:disabled)')?.focus();
    const handler = e => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key !== 'Tab') return;
      const items = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select, textarea, a[href], [tabindex="0"]')];
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', handler); if (before?.isConnected) before.focus(); };
  }, [true]);
  return <div className="fa-modal-backdrop" onClick={onClose}><div className="fa-comparison" role="dialog" aria-modal="true" aria-label="So sánh hai đối tượng" tabIndex={-1} ref={ref} onClick={e => e.stopPropagation()}><div className="fa-detail-heading"><div><h2>So sánh cùng kỳ</h2><p>{scope}</p></div><button className="fa-icon" aria-label="Đóng so sánh" onClick={onClose}><X size={20} /></button></div><div className="fa-scroll"><table><thead><tr><th>Chỉ số</th>{rows.map(r => <th key={r.name}>{r.name}</th>)}</tr></thead><tbody>{[['Chuyến hoàn thành','completed'],['Đang chạy','running'],['Ngày có chuyến','activeDays'],['Doanh thu','revenue'],['Chi phí trực tiếp','cost'],['Lãi từ chuyến','profit'],['Phần tạm tính','provisional'],['Lãi / chuyến hoàn thành','averageProfit']].map(([label,key]) => <tr key={key}><th>{label}</th>{rows.map(r => <td key={r.name}>{r[key] === null ? '—' : ['completed','running','activeDays'].includes(key) ? r[key] : formatVnd(Math.round(r[key]))}</td>)}</tr>)}</tbody></table></div><p className="fa-footnote">Lãi gồm phần tạm tính. Tuyến, thời gian và điều kiện chạy khác nhau có thể ảnh hưởng kết quả.</p><div className="fa-actions">{rows.map(r => <button key={r.name} className="fa-text-button" onClick={() => onOpen(r)}>Xem chuyến của {r.name}<ArrowRight size={14} /></button>)}</div></div></div>;
}
