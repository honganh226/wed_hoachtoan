import { authenticateToken } from './auth.middleware.js';
import { requireRole } from './rbac.middleware.js';
import { db } from '../db/database.js';

const financialStaff = requireRole('DIRECTOR', 'ACCOUNTANT', 'AREA_MANAGER');

// Authenticate before entering the durable write queue, including legacy routes.
export function protectApi(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  const route = req.path.replace(/\/+$/, '') || '/';
  if ((['GET','HEAD'].includes(req.method) && ['/health','/health/live'].includes(route)) || (req.method === 'POST' && route === '/auth/login')) return next();
  authenticateToken(req, res, () => {
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.NODE_ENV === 'production' && (route === '/data/seed' || route.startsWith('/pl/test-'))) {
      return res.status(404).json({success:false,error:'Chức năng không khả dụng.'});
    }
    if (req.user.role === 'AREA_MANAGER') {
      if (!req.user.areaId) return res.status(403).json({success:false,error:'Tài khoản chưa được gán khu vực.'});
      const tripMatch = route.match(/^\/(?:trips|(?:expenses|advances)\/trip|business\/trip)\/([^/]+)(?:\/|$)/);
      if (tripMatch && !['routes','default-price','pending-eir','unpaid-summary','validate-container','batch','batch-pay'].includes(tripMatch[1])) {
        const trip = db.prepare('SELECT area_id FROM trips WHERE id=?').get(tripMatch[1]);
        if (!trip || trip.area_id !== req.user.areaId) return res.status(403).json({success:false,error:'Chuyến xe ngoài khu vực được phép.'});
      }
      const driverMatch = route.match(/^\/kpi\/driver\/([^/]+)$/);
      if (driverMatch) {
        const driver = db.prepare('SELECT area_id FROM drivers WHERE id=?').get(driverMatch[1]);
        if (!driver || driver.area_id !== req.user.areaId) return res.status(403).json({success:false,error:'Tài xế ngoài khu vực được phép.'});
      }
      if (req.method !== 'GET' && (route === '/trips' || (tripMatch && ['PUT','PATCH'].includes(req.method)))) req.body.area_id = req.user.areaId;
      if (req.method === 'POST' && route === '/trips/batch' && Array.isArray(req.body?.trips)) {
        for (const trip of req.body.trips) { if (trip && typeof trip === 'object') trip.area_id = req.user.areaId; }
      }
      const expenseMatch = route.match(/^\/expenses\/([^/]+)$/);
      if (expenseMatch && req.method !== 'GET' && !['evaluate','analytics','types'].includes(expenseMatch[1])) {
        const expense = db.prepare('SELECT t.area_id FROM expenses e JOIN trips t ON t.id=e.trip_id WHERE e.id=?').get(expenseMatch[1]);
        if (!expense || expense.area_id !== req.user.areaId) return res.status(403).json({success:false,error:'Chi phí ngoài khu vực được phép.'});
      }
      if (req.method !== 'GET' && (route === '/expenses' || route === '/advances')) {
        const tripId = req.body?.trip_id || req.body?.tripId;
        const driverId = req.body?.driver_id || req.body?.driverId;
        const trip = tripId ? db.prepare('SELECT area_id FROM trips WHERE id=?').get(tripId) : null;
        const driver = driverId ? db.prepare('SELECT area_id FROM drivers WHERE id=?').get(driverId) : null;
        if ((!trip && !driver) || (trip && trip.area_id !== req.user.areaId) || (driver && driver.area_id !== req.user.areaId)) {
          return res.status(403).json({success:false,error:'Phát sinh ngoài khu vực được phép.'});
        }
      }
    }
    if (/^\/excel(\/|$)/.test(route) || route === '/expenses/analytics') return requireRole('DIRECTOR','ACCOUNTANT')(req,res,next);
    if (/^\/(payroll|kpi|expenses|advances|trips)(\/|$)/.test(route) || ['/data/summary','/data/trips'].includes(route)) return financialStaff(req, res, next);
    if (route === '/data/eport' || route === '/auth/demo-accounts') return requireRole('DIRECTOR')(req, res, next);
    next();
  });
}

export function corsOptions(req, callback) {
  const origin = req.headers.origin;
  const configured = [process.env.CLIENT_ORIGIN, process.env.RENDER_EXTERNAL_URL]
    .filter(Boolean).flatMap(value => value.split(',')).map(value => value.trim().replace(/\/$/, ''));
  const allowed = new Set(configured);
  allowed.add(`https://${req.get('host')}`);
  if (process.env.NODE_ENV !== 'production') {
    allowed.add(`http://${req.get('host')}`);
    for (const host of ['localhost', '127.0.0.1']) {
      for (const port of [5173, 5174, 5000]) allowed.add(`http://${host}:${port}`);
    }
  }
  if (origin && !allowed.has(origin)) {
    const error = new Error('Website nguồn không được phép truy cập API.');
    error.status = 403;
    return callback(error);
  }
  callback(null, {
    origin: origin || false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'If-Match'],
  });
}
