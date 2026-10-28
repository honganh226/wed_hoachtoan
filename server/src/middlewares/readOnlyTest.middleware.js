import { authenticateToken } from './auth.middleware.js';
export function readOnlyTest(req, res, next) {
  if (process.env.RENDER_READ_ONLY !== 'true') return next();
  if(req.method==='POST'&&req.path==='/ai/chat')return authenticateToken(req,res,()=>{
    if(req.user.role==='DIRECTOR')return next();
    return res.status(403).json({success:false,error:'Bản chỉ xem chỉ mở tra cứu trợ lý giám đốc.'});
  });
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.method === 'POST' && ['/auth/login', '/auth/logout', '/excel/preview'].includes(req.path)) return next();
  return res.status(403).json({ success: false, data: null, error: 'Bản thử chỉ xem; thao tác thay đổi dữ liệu đang được khóa.' });
}
