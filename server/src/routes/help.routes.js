/**
 * ============================================================
 * HELP ROUTES - CẨM NANG HƯỚNG DẪN & TỪ ĐIỂN KÝ HIỆU (TASK 7.1)
 * ============================================================
 * Tiền tố: /api/v1/help
 * ============================================================
 */
import { Router } from 'express';
import { 
  getHandbookData, 
  GLOSSARY_TERMS, 
  SOP_STEPS, 
  RBAC_MATRIX, 
  FAQ_LIST 
} from '../services/help.service.js';
import { successResponse, errorResponse } from '../utils/response.js';

const router = Router();

/**
 * GET /api/v1/help/handbook
 * Lấy toàn bộ nội dung cẩm nang hướng dẫn sử dụng
 */
router.get('/handbook', (req, res) => {
  try {
    const data = getHandbookData();
    return successResponse(res, data, 'Lấy toàn bộ cẩm nang hướng dẫn thành công');
  } catch (error) {
    console.error('[HELP_HANDBOOK_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi khi tải cẩm nang hướng dẫn', 500);
  }
});

/**
 * GET /api/v1/help/glossary
 * Lấy danh sách từ điển ký hiệu & thuật ngữ
 */
router.get('/glossary', (req, res) => {
  try {
    const category = req.query.category;
    let list = GLOSSARY_TERMS;
    if (category) {
      list = list.filter(item => item.category === category);
    }
    return successResponse(res, list, 'Lấy từ điển ký hiệu thành công');
  } catch (error) {
    console.error('[HELP_GLOSSARY_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi khi tải từ điển ký hiệu', 500);
  }
});

/**
 * GET /api/v1/help/sop
 * Lấy quy trình tác nghiệp chuẩn 7 bước
 */
router.get('/sop', (req, res) => {
  try {
    return successResponse(res, SOP_STEPS, 'Lấy quy trình SOP 7 bước thành công');
  } catch (error) {
    console.error('[HELP_SOP_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi khi tải quy trình SOP', 500);
  }
});

/**
 * GET /api/v1/help/rbac
 * Lấy bảng ma trận phân quyền 4 vai trò
 */
router.get('/rbac', (req, res) => {
  try {
    return successResponse(res, RBAC_MATRIX, 'Lấy ma trận phân quyền RBAC thành công');
  } catch (error) {
    console.error('[HELP_RBAC_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi khi tải ma trận RBAC', 500);
  }
});

/**
 * GET /api/v1/help/faq
 * Lấy danh sách câu hỏi thường gặp
 */
router.get('/faq', (req, res) => {
  try {
    return successResponse(res, FAQ_LIST, 'Lấy danh sách FAQ thành công');
  } catch (error) {
    console.error('[HELP_FAQ_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi khi tải FAQ', 500);
  }
});

export default router;
