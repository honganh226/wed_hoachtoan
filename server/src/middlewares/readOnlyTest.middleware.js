export function readOnlyTest(req, res, next) {
  if (process.env.RENDER_READ_ONLY !== 'true') return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.method === 'POST' && ['/auth/login', '/auth/logout', '/excel/preview'].includes(req.path)) return next();
  return res.status(403).json({ success: false, data: null, error: 'Bản thử chỉ xem; thao tác thay đổi dữ liệu đang được khóa.' });
}
