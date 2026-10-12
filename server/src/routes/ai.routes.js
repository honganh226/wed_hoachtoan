/**
 * ============================================================
 * AI ROUTES - TRỢ LÝ ẢO NỘI BỘ VẬN TẢI CONTAINER
 * ============================================================
 * Tiền tố: /api/v1/ai
 * ============================================================
 */
import { Router } from 'express';
import { chatWithAiAssistant } from '../services/aiAssistant.service.js';
import { getRoleSuggestions } from '../services/aiGuard.service.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { successResponse, errorResponse } from '../utils/response.js';

const router = Router();

// Yêu cầu xác thực JWT để định danh vai trò người dùng
router.use(authenticateToken);

/**
 * POST /api/v1/ai/chat
 * Gửi tin nhắn đến Trợ lý ảo AI, tự động lọc qua AI Guardrails
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;
    const result = await chatWithAiAssistant({ message, conversationHistory }, req.user);
    return successResponse(res, result, 'Phản hồi từ Trợ lý ảo AI');
  } catch (error) {
    console.error('[AI_CHAT_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi khi xử lý câu hỏi với Trợ lý AI', 500);
  }
});

/**
 * GET /api/v1/ai/suggestions
 * Lấy danh sách câu hỏi gợi ý nhanh theo vai trò người dùng
 */
router.get('/suggestions', async (req, res) => {
  try {
    const suggestions = getRoleSuggestions(req.user.role);
    return successResponse(res, suggestions, 'Lấy danh sách gợi ý thành công');
  } catch (error) {
    console.error('[AI_SUGGESTIONS_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi lấy gợi ý câu hỏi', 500);
  }
});

import { getAiDispatchRecommendations } from '../services/aiDispatch.service.js';

/**
 * POST /api/v1/ai/dispatch-suggestion
 * Đề xuất phân bổ xe & tài xế thông minh theo 4 tiêu chí vàng (Task 6.4)
 */
router.post('/dispatch-suggestion', async (req, res) => {
  try {
    const params = req.body || {};
    const result = await getAiDispatchRecommendations(params, req.user);
    return successResponse(res, result, 'Đề xuất phân bổ xe & tài xế thành công');
  } catch (error) {
    console.error('[AI_DISPATCH_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi khi tính toán đề xuất phân bổ', 500);
  }
});

/**
 * GET /api/v1/ai/dispatch-suggestion
 * Đề xuất phân bổ xe & tài xế thông qua query parameters
 */
router.get('/dispatch-suggestion', async (req, res) => {
  try {
    const params = req.query || {};
    const result = await getAiDispatchRecommendations(params, req.user);
    return successResponse(res, result, 'Đề xuất phân bổ xe & tài xế thành công');
  } catch (error) {
    console.error('[AI_DISPATCH_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi khi tính toán đề xuất phân bổ', 500);
  }
});

export default router;
