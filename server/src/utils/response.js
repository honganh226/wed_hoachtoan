/**
 * Tiện ích chuẩn hóa định dạng phản hồi API
 * Theo Hợp Đồng Kỹ Thuật: { success, data, message/error }
 */

/**
 * Phản hồi thành công
 * @param {import('express').Response} res
 * @param {any} data - Dữ liệu trả về
 * @param {string} message - Thông báo
 * @param {number} statusCode - HTTP status code (mặc định 200)
 */
export function successResponse(res, data = null, message = 'Thao tác thành công', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
  });
}

/**
 * Phản hồi lỗi
 * @param {import('express').Response} res
 * @param {string} error - Mô tả lỗi
 * @param {number} statusCode - HTTP status code (mặc định 400)
 */
export function errorResponse(res, error = 'Đã xảy ra lỗi', statusCode = 400) {
  return res.status(statusCode).json({
    success: false,
    data: null,
    error,
  });
}

/**
 * Phản hồi lỗi nội bộ server (500)
 * @param {import('express').Response} res
 * @param {Error} err
 */
export function serverErrorResponse(res, err) {
  console.error('[SERVER ERROR]', err);
  return res.status(500).json({
    success: false,
    data: null,
    error: 'Lỗi máy chủ nội bộ. Vui lòng thử lại.',
  });
}

// Aliases cho tương thích ngược
export const sendSuccess = (res, data, message, statusCode) => successResponse(res, data, message, statusCode);
export const sendError = (res, error, statusCode) => errorResponse(res, error, statusCode);
