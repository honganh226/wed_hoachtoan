/**
 * Tiện ích mã hóa / giải mã AES-256-GCM cho dữ liệu nhạy cảm
 * (Mật khẩu ePort các cảng, thông tin ngân hàng bảo mật, v.v.)
 * Khóa bí mật được lấy từ biến môi trường ENCRYPTION_KEY ngoài cơ sở dữ liệu.
 */
import 'dotenv/config';
import crypto from 'crypto';

// Đảm bảo secret key luôn là Buffer 32 bytes (256 bits)
function getSecretKey() {
  const envKey = process.env.ENCRYPTION_KEY || 'hoachtoan_transport_container_aes_256_secret_key_2026';
  // Dùng SHA-256 băm key để luôn đảm bảo đúng 32 bytes bất kể độ dài chuỗi cấu hình
  return crypto.createHash('sha256').update(envKey).digest();
}

/**
 * Mã hóa chuỗi văn bản bằng AES-256-GCM
 * @param {string} plainText Chuỗi cần mã hóa
 * @returns {{ encrypted: string, iv: string, tag: string }} Dữ liệu đã mã hóa dạng hex
 */
export function encryptAESGCM(plainText) {
  if (!plainText && plainText !== '') return { encrypted: '', iv: '', tag: '' };
  
  const key = getSecretKey();
  const iv = crypto.randomBytes(12); // Chuẩn 96-bit IV cho AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(String(plainText), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag
  };
}

/**
 * Giải mã chuỗi AES-256-GCM
 * @param {string} encryptedText Chuỗi hex đã mã hóa
 * @param {string} ivHex Chuỗi hex của IV
 * @param {string} tagHex Chuỗi hex của Auth Tag
 * @returns {string} Chuỗi văn bản gốc
 */
export function decryptAESGCM(encryptedText, ivHex, tagHex) {
  if (!encryptedText) return '';
  
  try {
    const key = getSecretKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('[CRYPTO] Lỗi giải mã AES-GCM:', error.message);
    return '';
  }
}

export default {
  encryptAESGCM,
  decryptAESGCM
};
