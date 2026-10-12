/**
 * ============================================================
 * ISO 6346 CONTAINER NUMBER VALIDATION & CHECK DIGIT CALCULATION (CLIENT)
 * Hệ Thống Quản Lý Điều Vận Container - WED_HOACHTOAN
 * ============================================================
 */

export const ISO6346_CHAR_MAP = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
  K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
  U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38
};

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
  return remainder === 10 ? 0 : remainder;
}

export function validateIso6346(containerNumber) {
  if (!containerNumber || typeof containerNumber !== 'string') {
    return {
      isValid: false,
      formatted: '',
      expectedCheckDigit: null,
      actualCheckDigit: null,
      message: 'Chưa nhập số container',
      status: 'EMPTY'
    };
  }

  const clean = containerNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (clean.length < 11) {
    return {
      isValid: false,
      formatted: clean,
      expectedCheckDigit: clean.length >= 10 ? calculateIso6346CheckDigit(clean.slice(0, 10)) : null,
      actualCheckDigit: null,
      message: `Đang nhập... (${clean.length}/11 ký tự)`,
      status: 'INCOMPLETE'
    };
  }

  if (clean.length > 11) {
    return {
      isValid: false,
      formatted: clean,
      expectedCheckDigit: null,
      actualCheckDigit: null,
      message: `Quá 11 ký tự (${clean.length} ký tự)`,
      status: 'TOO_LONG'
    };
  }

  const letters = clean.slice(0, 4);
  if (!/^[A-Z]{4}$/.test(letters)) {
    return {
      isValid: false,
      formatted: clean,
      expectedCheckDigit: null,
      actualCheckDigit: null,
      message: '4 ký tự đầu phải là chữ cái (VD: MSMU)',
      status: 'INVALID_FORMAT'
    };
  }

  const digits = clean.slice(4);
  if (!/^[0-9]{7}$/.test(digits)) {
    return {
      isValid: false,
      formatted: clean,
      expectedCheckDigit: null,
      actualCheckDigit: null,
      message: '7 ký tự tiếp theo phải là chữ số',
      status: 'INVALID_FORMAT'
    };
  }

  const actualCheckDigit = parseInt(clean[10], 10);
  const expectedCheckDigit = calculateIso6346CheckDigit(clean.slice(0, 10));

  const isValid = actualCheckDigit === expectedCheckDigit;

  return {
    isValid,
    formatted: clean,
    ownerCode: clean.slice(0, 3),
    categoryCode: clean[3],
    serialNumber: clean.slice(4, 10),
    actualCheckDigit,
    expectedCheckDigit,
    status: isValid ? 'VALID' : 'INVALID_CHECK_DIGIT',
    message: isValid 
      ? `✓ ISO 6346 Hợp lệ (Check digit: ${expectedCheckDigit})` 
      : `⚠️ Sai Check Digit! Thực tế là ${actualCheckDigit}, chuẩn phải là ${expectedCheckDigit}`
  };
}
