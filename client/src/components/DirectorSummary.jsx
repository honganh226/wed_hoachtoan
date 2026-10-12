import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';

const money = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value / 1000000) + ' triệu';

export default function DirectorSummary({ trips, drivers, metrics, tasks, onDriver, onPerformance, onTasks }) {
  const days = useMemo(() => {
    const grouped = new Map();
    trips.filter(t => t.status === 'COMPLETED').forEach(t => {
      const item = grouped.get(t.trip_date) || { date: t.trip_date, count: 0, profit: 0, confirmed: 0 };
      item.count += 1;
      item.profit += t.trip_profit;
      if (t.reconciliation_status === 'RECONCILED') item.confirmed += t.trip_profit;
      grouped.set(t.trip_date, item);
    });
    return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [trips]);
  const maxProfit = Math.max(1, ...days.map(d => Math.abs(d.profit)));
  const leaders = [...drivers].filter(d => d.completed_trips > 0).sort((a,b) => b.total_profit - a.total_profit).slice(0, 3);
  const openTasks = tasks.filter(t => t.status !== 'DONE');

  return (
    <>
      <div className="director-summary-grid">
        <article className="director-summary-card">
          <div className="director-card-heading"><div><h2>Lãi theo ngày</h2><p>Tổng lãi từ chuyến hoàn thành, gồm phần tạm tính</p></div><span className="director-unit">Đơn vị: triệu đồng</span></div>
          {days.length ? <div className="director-chart" role="img" aria-label={days.map(d => `${d.date}: ${money(d.profit)}, ${d.count} chuyến`).join('; ')}>
            {days.map(day => <div className="director-chart-row" key={day.date}>
              <div className="director-chart-label"><b>{day.date.slice(8)}/{day.date.slice(5,7)}</b><span>{day.count} chuyến</span></div>
              <div className="director-chart-track"><div className={day.profit < 0 ? 'director-chart-fill is-loss' : 'director-chart-fill'} style={{width: `${Math.max(2, Math.abs(day.profit) / maxProfit * 100)}%`}} /></div>
              <strong className={day.profit < 0 ? 'director-loss' : ''}>{money(day.profit)}</strong>
            </div>)}
          </div> : <p className="director-empty">Chưa có chuyến hoàn thành trong khoảng ngày này.</p>}
          <div className="director-chart-footer"><span>Đã đối soát <b>{money(metrics.reconciledProfit)}</b></span><span>Còn tạm tính <b>{money(metrics.provisionalProfit)}</b></span></div>
          {days.length === 1 && <p className="director-subtle">Chọn “Tháng này” để so sánh các ngày có chuyến.</p>}
        </article>

        <article className="director-summary-card">
          <div className="director-card-heading"><div><h2>Tài xế mang lại lãi nhiều</h2><p>Lãi từ chuyến được giao · gồm phần tạm tính</p></div></div>
          <div className="director-leaders">
            {leaders.map((driver, i) => <button type="button" key={driver.driver_name} onClick={() => onDriver(driver.driver_name)}>
              <span className="director-rank">{i+1}</span><span className="director-driver"><b>{driver.driver_name}</b><small>{driver.completed_trips} chuyến hoàn thành{driver.provisional_profit !== 0 ? ' · Có lãi tạm tính' : ''}</small></span>
              <strong className={driver.total_profit < 0 ? 'director-loss' : ''}>{money(driver.total_profit)}</strong><ArrowRight size={14} />
            </button>)}
            {!leaders.length && <p className="director-empty">Chưa có kết quả để so sánh trong kỳ.</p>}
          </div>
          <button type="button" className="director-text-link" onClick={onPerformance}>Xem đầy đủ tài xế, xe, tuyến và khách hàng <ArrowRight size={14} /></button>
        </article>
      </div>
      <button type="button" className="director-task-strip" onClick={onTasks}>
        <span><b>{openTasks.length} công việc đang theo dõi</b><small>{tasks.filter(t => t.status === 'TODO').length} chưa xử lý · {tasks.filter(t => t.status === 'IN_PROGRESS').length} đang xử lý</small></span>
        <span>Xem công việc <ArrowRight size={16} /></span>
      </button>
    </>
  );
}
