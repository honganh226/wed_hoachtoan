/**
 * ============================================================
 * ISO 6346 CONTAINER NUMBER VALIDATION & CHECK DIGIT CALCULATION
 * Hệ Thống Quản Lý Điều Vận Container - WED_HOACHTOAN
 * ============================================================
 * Quy chuẩn quốc tế ISO 6346:
 * Cấu trúc mã container: 11 ký tự
 * - 3 chữ cái: Mã chủ sở hữu (Owner code, ví dụ: 'MSM', 'TCN', 'EMC')
 * - 1 chữ cái: Mã loại thiết bị (Equipment category: 'U' = cont chở hàng, 'J' = thiết bị kèm, 'Z' = rơ-moóc)
 * - 6 chữ số: Số sê-ri (Serial number)
 * - 1 chữ số: Số kiểm tra (Check digit)
 *
 * Bảng quy đổi ký tự sang số (ISO 6346):
 * Bỏ qua các bội số của 11 (11, 22, 33)
 * A=10, B=12, C=13, D=14, E=15, F=16, G=17, H=18, I=19, J=20,
 * K=21, L=23, M=24, N=25, O=26, P=27, Q=28, R=29, S=30, T=31,
 * U=32, V=34, W=35, X=36, Y=37, Z=38
 *
 * Trọng số cho ký tự thứ i (0 <= i <= 9): 2^i
 * Tổng = sum(val[i] * 2^i)
 * Số kiểm tra = (Tổng % 11) % 10  (Nếu modulo 11 ra 10 thì check digit quy ước là 0)
 * ============================================================
 */

export const ISO6346_CHAR_MAP = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
  K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
  U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38
};

/**
 * Tính Check Digit theo chuẩn ISO 6346 cho 10 ký tự đầu tiên
 * @param {string} first10Chars - 10 ký tự đầu của số cont (4 chữ cái + 6 số)
 * @returns {number|null} - Check digit (0-9) hoặc null nếu không hợp lệ
 */
export function calculateIso6346CheckDigit(first10Chars) {
  if (!first10Chars || typeof first10Chars !== 'string') return null;
  const clean = first10Chars.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length < 10) return null;

  const target = clean.slice(0, 10);
  let total = 0;

  for (let i = 0; i < 10; i++) {
    const char = target[i];
    let val;
    if (char >= '0' && char <= '9') {
      val = parseInt(char, 10);
    } else if (ISO6346_CHAR_MAP[char] !== undefined) {
      val = ISO6346_CHAR_MAP[char];
    } else {
      return null;
    }

    const weight = Math.pow(2, i);
    total += val * weight;
  }

  const remainder = total % 11;
  // Theo chuẩn ISO 6346, nếu remainder = 10 thì check digit là 0
  return remainder === 10 ? 0 : remainder;
}

/**
 * Kiểm tra mã Container chuẩn ISO 6346
 * @param {string} containerNumber - Số container (ví dụ: 'MSMU5022544' hoặc 'TCNU9183777')
 * @returns {object} { isValid, formatted, expectedCheckDigit, actualCheckDigit, message }
 */
export function validateIso6346(containerNumber) {
  if (!containerNumber || typeof containerNumber !== 'string') {
    return {
      isValid: false,
      formatted: '',
      expectedCheckDigit: null,
      actualCheckDigit: null,
      message: 'Số container không được để trống'
    };
  }

  const clean = containerNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (clean.length !== 11) {
    return {
      isValid: false,
      formatted: clean,
      expectedCheckDigit: null,
      actualCheckDigit: null,
      message: `Độ dài không đúng: cần 11 ký tự (hiện có ${clean.length} ký tự)`
    };
  }

  // 4 ký tự đầu phải là chữ cái
  const letters = clean.slice(0, 4);
  if (!/^[A-Z]{4}$/.test(letters)) {
    return {
      isValid: false,
      formatted: clean,
      expectedCheckDigit: null,
      actualCheckDigit: null,
      message: '4 ký tự đầu phải là chữ cái (Mã chủ sở hữu & loại cont)'
    };
  }

  // 7 ký tự sau phải là số
  const digits = clean.slice(4);
  if (!/^[0-9]{7}$/.test(digits)) {
    return {
      isValid: false,
      formatted: clean,
      expectedCheckDigit: null,
      actualCheckDigit: null,
      message: '7 ký tự tiếp theo phải là chữ số (6 số serial + 1 check digit)'
    };
  }

  const actualCheckDigit = parseInt(clean[10], 10);
  const expectedCheckDigit = calculateIso6346CheckDigit(clean.slice(0, 10));

  if (expectedCheckDigit === null) {
    return {
      isValid: false,
      formatted: clean,
      expectedCheckDigit: null,
      actualCheckDigit,
      message: 'Không tính toán được Check Digit'
    };
  }

  const isValid = actualCheckDigit === expectedCheckDigit;

  return {
    isValid,
    formatted: clean,
    ownerCode: clean.slice(0, 3),
    categoryCode: clean[3],
    serialNumber: clean.slice(4, 10),
    actualCheckDigit,
    expectedCheckDigit,
    message: isValid 
      ? `Số container chuẩn ISO 6346 (Check digit: ${expectedCheckDigit})` 
      : `Check digit không khớp! Thực tế: ${actualCheckDigit}, chuẩn ISO: ${expectedCheckDigit}`
  };
}
