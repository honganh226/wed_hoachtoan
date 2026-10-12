import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTrips, filterScope, aggregateEntities, visibleEntities, filterEntityTrips, daysBetween, periodRange } from './fleetAnalytics.mjs';

const trip = (id, overrides = {}) => ({ id, trip_code:id, trip_date:'2026-10-09', area_id:'TUAN', driver_name:'Vũ Văn Liêm', vehicle_plate:'15C-22405', status:'COMPLETED', reconciliation_status:'RECONCILED', revenue_pre_tax:3200000, direct_cost:2450000, trip_profit:750000, container_number:'ABCU0000001', route_name:'Tuyến A', ...overrides });
test('running trips never enter completed revenue/profit, even when reconciled', () => {
  const stats=summarizeTrips([trip('A'),trip('B',{status:'RUNNING',reconciliation_status:'RECONCILED',trip_profit:999999})]);
  assert.equal(stats.completed,1); assert.equal(stats.running,1); assert.equal(stats.revenue,3200000); assert.equal(stats.profit,750000); assert.equal(stats.confirmed,750000);
});
test('loss and provisional figures retain signs; average uses the same completed scope', () => {
  const stats=summarizeTrips([trip('A'),trip('B',{reconciliation_status:'MISSING_DATA',trip_profit:-100000})]);
  assert.equal(stats.profit,650000); assert.equal(stats.confirmed,750000); assert.equal(stats.provisional,-100000); assert.equal(stats.provisionalCount,1); assert.equal(stats.averageProfit,325000);
});
test('two containers on one trip count as two records; repeating a container across trips is retained', () => {
  assert.equal(summarizeTrips([trip('A',{container_number:'ABCU0000001 / ABCU0000002'}),trip('B')]).containers,3);
});
test('missing container codes are reported rather than guessed', () => {
  const s=summarizeTrips([trip('A',{container_number:null})]); assert.equal(s.containers,0); assert.equal(s.unknownContainers,1);
});
test('roster preserves an internal driver with zero trips, area filter excludes other rosters', () => {
  const roster=[{name:'Vũ Văn Liêm',area_id:'TUAN'}, {name:'Lê Anh Sức',area_id:'TUAN'}, {name:'Người khu khác',area_id:'TUAN_ANH'}];
  const rows=aggregateEntities([trip('A')],'DRIVER',roster,[],'TUAN');
  assert.equal(rows.length,2); assert.equal(visibleEntities(rows,'','FEWEST','ALL')[0].name,'Lê Anh Sức'); assert.equal(rows.find(r=>r.name==='Lê Anh Sức').averageProfit,null);
});
test('report scope combines area and inclusive dates', () => {
  const rows=filterScope([trip('A'),trip('B',{trip_date:'2026-10-08'}),trip('C',{area_id:'TUAN_ANH'})],{start:'2026-10-09',end:'2026-10-09'},'TUAN'); assert.deepEqual(rows.map(t=>t.id),['A']);
});
test('operational and reconciliation filters are independent; container search uses trip source', () => {
  const trips=[trip('A',{status:'RUNNING',reconciliation_status:'MISSING_DATA',container_number:'BSIU2019482 / FSCU2910481'}),trip('B')];
  assert.deepEqual(filterEntityTrips(trips,{status:'RUNNING',reconciliation:'MISSING_DATA',search:'FSCU2910481'}).map(t=>t.id),['A']);
  assert.equal(filterEntityTrips(trips,{status:'COMPLETED',reconciliation:'MISSING_DATA'}).length,0);
});
test('active days count once per completed date; running-only date is not a completed day', () => {
  const s=summarizeTrips([trip('A'),trip('B'),trip('C',{trip_date:'2026-10-08',status:'RUNNING'})]); assert.equal(s.activeDays,1); assert.equal(s.averageTrips,2);
});
test('accent-insensitive search and ownership filter preserve exact values', () => {
  const rows=[{name:'Vũ Văn Liêm',secondary:'15C-22405',outside:false,completed:2,profit:9},{name:'Xe ngoài',secondary:'',outside:true,completed:0,profit:0}];
  assert.equal(visibleEntities(rows,'vu van liem','PROFIT','ALL').length,1); assert.equal(visibleEntities(rows,'','FEWEST','INTERNAL').length,1);
});
test('custom invalid range is empty; UTC date iteration crosses month boundaries safely', () => {
  assert.deepEqual(daysBetween('2026-10-09','2026-10-08'),[]); assert.deepEqual(daysBetween('2026-09-30','2026-10-02'),['2026-09-30','2026-10-01','2026-10-02']);
  assert.deepEqual(periodRange('week','2026-10-03'),{start:'2026-09-27',end:'2026-10-03'});
});
