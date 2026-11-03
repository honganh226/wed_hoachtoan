import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { metadata, listEntity, saveEntity, deleteEntity, history, undoChange } from '../services/directorData.service.js';
const router = Router();
router.use(authenticateToken, requireRole('DIRECTOR'));
function handler(fn) {
  return (req, res) => {
    try {
      res.json({ success: true, data: fn(req) });
    } catch (e) {
      res.status(e.status || 400).json({ success: false, error: e.message });
    }
  };
}
router.get('/metadata', handler(() => metadata()));
router.get('/history', handler(() => history()));
router.post('/history/:id/undo', handler(req => undoChange(req.params.id, req.user)));
router.get('/:entity', handler(req => listEntity(req.params.entity)));
router.post('/:entity', handler(req => saveEntity(req.params.entity, null, req.body.values, null, req.user, req.body.reason)));
router.put('/:entity/:id', handler(req => saveEntity(req.params.entity, req.params.id, req.body.values, req.body.version, req.user, req.body.reason)));
router.delete('/:entity/:id', handler(req => deleteEntity(req.params.entity, req.params.id, req.user, req.body?.reason || req.query?.reason, req.body?.version || req.query?.version || req.headers['if-match'])));
router.post('/:entity/:id/delete', handler(req => deleteEntity(req.params.entity, req.params.id, req.user, req.body?.reason || req.query?.reason, req.body?.version || req.query?.version || req.headers['if-match'])));
export default router;
