/**
 * SCRIPT QUẢN TRỊ BẢO MẬT: SINH KHÓA JWT_SECRET VÀ ĐỔI MẬT KHẨU TÀI KHOẢN AN TOÀN
 * Cách dùng:
 *   node src/scripts/rotateSecretsAndPasswords.js --generate-key
 *   node src/scripts/rotateSecretsAndPasswords.js --set-password <username> <new_password>
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/database.js';

const args = process.argv.slice(2);

if (args.includes('--generate-key')) {
  const secretKey = crypto.randomBytes(32).toString('hex');
  console.log('\n[KHÓA BẢO MẬT JWT NGẪU NHIÊN 64 KÝ TỰ]:');
  console.log(secretKey);
  console.log('\n-> Hãy sao chép chuỗi trên và gắn vào JWT_SECRET trong file .env trên máy chủ Production.\n');
  process.exit(0);
}

const userIdx = args.indexOf('--set-password');
if (userIdx !== -1 && args[userIdx + 1] && args[userIdx + 2]) {
  const username = args[userIdx + 1].trim().toLowerCase();
  const rawPassword = args[userIdx + 2];

  if (rawPassword.length < 8) {
    console.error('LỖI: Mật khẩu mới phải có ít nhất 8 ký tự!');
    process.exit(1);
  }

  const saltRounds = 10;
  const hash = bcrypt.hashSync(rawPassword, saltRounds);

  const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE LOWER(username) = ?');
  const res = stmt.run(hash, username);

  if (res.changes > 0) {
    console.log(`\n✓ ĐÃ ĐỔI MẬT KHẨU THÀNH CÔNG CHO TÀI KHOẢN [${username}].`);
    console.log(`-> Mật khẩu đã được mã hóa Bcrypt 10 vòng và lưu vào cơ sở dữ liệu.`);
    console.log(`-> Tuyệt đối không ghi mật khẩu này vào báo cáo công khai!\n`);
  } else {
    console.error(`LỖI: Không tìm thấy tài khoản có username: [${username}] trong database.`);
  }
  process.exit(0);
}

console.log(`
HƯỚNG DẪN SỬ DỤNG:
1. Sinh khóa JWT_SECRET ngẫu nhiên 64 ký tự:
   node src/scripts/rotateSecretsAndPasswords.js --generate-key

2. Đổi mật khẩu tài khoản quản trị (Director / Accountant):
   node src/scripts/rotateSecretsAndPasswords.js --set-password <username> <new_password>
`);
