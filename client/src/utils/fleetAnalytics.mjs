// Pure reporting helpers. Operational counts and financial totals have separate scopes.
export const ENTITY_FIELDS = { DRIVER: 'driver_name', VEHICLE: 'vehicle_plate', ROUTE: 'route_name', CUSTOMER: 'customer_name' };
export const dateLabel = date => date ? date.slice(8, 10) + '/' + date.slice(5, 7) + '/' + date.slice(0, 4) : '';
export const shiftDate = (date, days) => {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
export function daysBetween(start, end) {
  if (!start || !end || start > end) return [];
  const days = [];
  for (let date = start; date <= end; date = shiftDate(date, 1)) {
    days.push(date);
    if (days.length >= 366) break;
  }
  return days;
}
export function periodRange(period, anchor, customStart, customEnd) {
  if (period === 'day') return { start: anchor, end: anchor };
  if (period === 'month') return { start: anchor.slice(0, 7) + '-01', end: anchor };
  if (period === 'custom') return { start: customStart, end: customEnd };
  return { start: shiftDate(anchor, -6), end: anchor };
}
export function filterScope(trips, range, area) {
  if (!range.start || !range.end || range.start > range.end) return [];
  return trips.filter(t => t.trip_date >= range.start && t.trip_date <= range.end && (area === 'ALL' || t.area_id === area));
}
export function summarizeTrips(trips) {
  const completed = trips.filter(t => t.status === 'COMPLETED');
  const completedDays = new Set(completed.map(t => t.trip_date));
  const sum = (items, field) => items.reduce((a, t) => a + (Number(t[field]) || 0), 0);
  const reconciled = completed.filter(t => t.reconciliation_status === 'RECONCILED');
  const provisional = completed.filter(t => t.reconciliation_status !== 'RECONCILED');
  const codes = completed.flatMap(t => String(t.container_number || '').split(/\s*\/\s*|\s*,\s*/).filter(Boolean));
  const profit = sum(completed, 'trip_profit');
  const revenue = sum(completed, 'revenue_pre_tax');
  return {
    completed: completed.length, running: trips.filter(t => t.status === 'RUNNING').length,
    revenue, cost: sum(completed, 'direct_cost'), profit,
    confirmed: sum(reconciled, 'trip_profit'), provisional: sum(provisional, 'trip_profit'),
    provisionalCount: provisional.length, confirmedCount: reconciled.length,
    activeDays: completedDays.size, containers: codes.length,
    unknownContainers: completed.filter(t => !t.container_number).length,
    averageProfit: completed.length ? profit / completed.length : null,
    averageTrips: completedDays.size ? completed.length / completedDays.size : null,
    margin: revenue ? profit / revenue * 100 : null,
    lossCount: completed.filter(t => t.trip_profit < 0).length
  };
}
export function aggregateEntities(trips, type, drivers, vehicles, area) {
  const field = ENTITY_FIELDS[type];
  const names = new Map();
  if (type === 'DRIVER') drivers.filter(d => area === 'ALL' || d.area_id === area).forEach(d => names.set(d.name, { name: d.name, secondary: d.default_plate, outside: d.is_subcontractor }));
  if (type === 'VEHICLE') vehicles.filter(v => area === 'ALL' || v.area_id === area).forEach(v => names.set(v.plate, { name: v.plate, secondary: v.default_driver, outside: v.is_subcontractor }));
  trips.forEach(t => {
    const name = t[field] || 'Chưa xác định';
    if (!names.has(name)) names.set(name, { name, secondary: '', outside: Boolean(t.is_subcontractor) });
  });
  return [...names.values()].map(item => {
    const matching = trips.filter(t => (t[field] || 'Chưa xác định') === item.name);
    return { ...item, trips: matching, ...summarizeTrips(matching) };
  });
}
export function visibleEntities(rows, search, sort, outside) {
  const normalized = String(search).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim();
  const results = rows.filter(row => {
    const text = (row.name + ' ' + row.secondary).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
    return text.includes(normalized) && (outside !== 'INTERNAL' || !row.outside);
  });
  return results.sort((a,b) => {
    const difference = sort === 'FEWEST' ? a.completed - b.completed : sort === 'MOST' ? b.completed - a.completed : sort === 'MARGIN' ? (b.margin ?? -Infinity) - (a.margin ?? -Infinity) : b.profit - a.profit;
    return difference || a.name.localeCompare(b.name, 'vi');
  });
}
export function filterEntityTrips(trips, { date = '', status = 'ALL', reconciliation = 'ALL', search = '' }) {
  const text = search.trim().toLowerCase();
  return trips.filter(t => (!date || t.trip_date === date)
    && (status === 'ALL' || t.status === status)
    && (reconciliation === 'ALL' || (reconciliation === 'PROVISIONAL' ? t.reconciliation_status !== 'RECONCILED' : t.reconciliation_status === reconciliation))
    && [t.trip_code, t.container_number, t.route_name, t.customer_name, t.vehicle_plate, t.driver_name].join(' ').toLowerCase().includes(text))
    .sort((a,b) => b.trip_date.localeCompare(a.trip_date) || a.trip_code.localeCompare(b.trip_code));
}
