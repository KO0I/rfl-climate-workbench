const symbols = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function frameToXpm(rgba, width, height) {
  if (rgba.length !== width * height * 4) throw new Error('Invalid frame dimensions.');
  const palette = new Map();
  const pixels = new Uint32Array(width * height);
  for (let i = 0; i < pixels.length; i++) {
    const key = rgba[i * 4 + 3] === 0 ? -1 : (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
    if (!palette.has(key)) palette.set(key, palette.size);
    pixels[i] = palette.get(key);
  }
  let cpp = 1;
  while (symbols.length ** cpp < palette.size) cpp++;
  const keys = Array.from({ length: palette.size }, (_, index) => {
    let result = '';
    for (let n = 0; n < cpp; n++) { result = symbols[index % symbols.length] + result; index = Math.floor(index / symbols.length); }
    return result;
  });
  const lines = ['! XPM2', '! RFL planet tool frame', `${width} ${height} ${palette.size} ${cpp}`];
  for (const [rgb, index] of palette) lines.push(`${keys[index]} c ${rgb === -1 ? 'None' : '#' + rgb.toString(16).padStart(6, '0')}`);
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) row.push(keys[pixels[y * width + x]]);
    lines.push(row.join(''));
  }
  return lines.join('\n') + '\n';
}

export function frameToBmp(rgba, width, height) {
  const stride = (width * 3 + 3) & ~3;
  const data = new Uint8Array(54 + stride * height);
  const view = new DataView(data.buffer);
  data[0] = 66; data[1] = 77;
  view.setUint32(2, data.length, true); view.setUint32(10, 54, true);
  view.setUint32(14, 40, true); view.setInt32(18, width, true); view.setInt32(22, height, true);
  view.setUint16(26, 1, true); view.setUint16(28, 24, true);
  view.setUint32(34, stride * height, true);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = (y * width + x) * 4, dst = 54 + (height - y - 1) * stride + x * 3;
    data[dst] = rgba[src + 2]; data[dst + 1] = rgba[src + 1]; data[dst + 2] = rgba[src];
  }
  return data;
}

export function validatePaletteBmp(bytes, width, height) {
  if (bytes.byteLength < 54 || bytes.byteLength > 65536) throw new Error('Choose a small, uncompressed BMP palette.');
  const h = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const w = h.getInt32(18, true), sh = h.getInt32(22, true), bpp = h.getUint16(28, true);
  const offset = h.getUint32(10, true), stride = (w * (bpp / 8) + 3) & ~3;
  if (h.getUint16(0, true) !== 0x4d42 || h.getUint32(14, true) < 40 || h.getUint16(26, true) !== 1 ||
      w !== width || Math.abs(sh) !== height || ![24, 32].includes(bpp) || h.getUint32(30, true) !== 0 ||
      offset < 54 || offset + stride * height > bytes.length) {
    throw new Error(`Choose a ${width} × ${height}, 24-bit or 32-bit uncompressed BMP.`);
  }
}

// Stored ZIP entries: tiny native palette assets need no compression dependency.
export function filesToZip(files) {
  const parts = [], central = []; let offset = 0;
  const utf8 = new TextEncoder();
  for (const file of files) {
    const name = utf8.encode(file.name), data = file.data;
    let crc = 0xffffffff;
    for (const b of data) {
      crc ^= b;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true);
    lv.setUint16(12, 33, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const entry = new Uint8Array(46 + name.length), ev = new DataView(entry.buffer);
    ev.setUint32(0, 0x02014b50, true); ev.setUint16(4, 20, true); ev.setUint16(6, 20, true);
    ev.setUint16(8, 0x800, true); ev.setUint16(14, 33, true); ev.setUint32(16, crc, true);
    ev.setUint32(20, data.length, true); ev.setUint32(24, data.length, true);
    ev.setUint16(28, name.length, true); ev.setUint32(42, offset, true); entry.set(name, 46);
    parts.push(local, data); central.push(entry); offset += local.length + data.length;
  }
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true);
  view.setUint32(12, central.reduce((n, x) => n + x.length, 0), true); view.setUint32(16, offset, true);
  const all = [...parts, ...central, end], output = new Uint8Array(all.reduce((n, x) => n + x.length, 0));
  let pos = 0; for (const part of all) { output.set(part, pos); pos += part.length; }
  return output;
}
