export function imageExtension(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 12 && buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP') return 'webp';
  return null;
}

export function isExcelFile(buffer, filename) {
  if (!Buffer.isBuffer(buffer) || !/\.(xlsx|xls)$/i.test(filename || '')) return false;
  return buffer.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex')) ||
    buffer.subarray(0,4).equals(Buffer.from('504b0304','hex'));
}
