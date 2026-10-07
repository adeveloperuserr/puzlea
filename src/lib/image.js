export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 3200;
export const MAX_SOURCE_IMAGE_PIXELS = 40_000_000;

const MAX_SOURCE_IMAGE_EDGE = 30_000;
const MAX_HEADER_BYTES = 1024 * 1024;

function invalidImage() {
  return new Error('No pudimos validar esta imagen. Prueba con un archivo JPG, PNG o WebP válido.');
}

function validateDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width > MAX_SOURCE_IMAGE_EDGE || height > MAX_SOURCE_IMAGE_EDGE || width * height > MAX_SOURCE_IMAGE_PIXELS) {
    throw new Error('La imagen es demasiado grande para abrirla de forma segura. El límite es de 40 megapíxeles.');
  }
  return { width, height };
}

function readJpegOrientation(bytes, start, end) {
  const exifSignature = [0x45, 0x78, 0x69, 0x66, 0, 0];
  if (start + 14 > end || !exifSignature.every((value, index) => bytes[start + index] === value)) return 1;
  const tiff = start + 6;
  const littleEndian = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const bigEndian = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
  if (!littleEndian && !bigEndian) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(tiff + 2, littleEndian) !== 0x002a) return 1;
  const ifd = tiff + view.getUint32(tiff + 4, littleEndian);
  if (ifd + 2 > end) return 1;
  const count = view.getUint16(ifd, littleEndian);
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > end) return 1;
    if (view.getUint16(entry, littleEndian) === 0x0112 &&
        view.getUint16(entry + 2, littleEndian) === 3 && view.getUint32(entry + 4, littleEndian) === 1) {
      const orientation = view.getUint16(entry + 8, littleEndian);
      return orientation >= 1 && orientation <= 8 ? orientation : 1;
    }
  }
  return 1;
}

function parseJpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw invalidImage();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  let orientation = 1;
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) throw invalidImage();
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    const segmentData = offset + 2;
    const segmentEnd = offset + segmentLength;
    if (marker === 0xe1) orientation = readJpegOrientation(bytes, segmentData, segmentEnd);
    if (frameMarkers.has(marker)) {
      if (segmentData + 5 > segmentEnd) throw invalidImage();
      let width = view.getUint16(segmentData + 3, false);
      let height = view.getUint16(segmentData + 1, false);
      if (orientation >= 5 && orientation <= 8) [width, height] = [height, width];
      return validateDimensions(width, height);
    }
    offset = segmentEnd;
  }
  throw invalidImage();
}

function parsePngDimensions(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) throw invalidImage();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') throw invalidImage();
  return validateDimensions(view.getUint32(16, false), view.getUint32(20, false));
}

function parseWebpDimensions(bytes) {
  if (bytes.length < 30 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' ||
      String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP') throw invalidImage();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  let width;
  let height;
  if (chunk === 'VP8X') {
    width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
  } else if (chunk === 'VP8 ') {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) throw invalidImage();
    width = view.getUint16(26, true) & 0x3fff;
    height = view.getUint16(28, true) & 0x3fff;
  } else if (chunk === 'VP8L') {
    if (bytes[20] !== 0x2f) throw invalidImage();
    width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
    height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10);
  } else {
    throw invalidImage();
  }
  return validateDimensions(width, height);
}

export async function readSafeImageDimensions(blob) {
  const bytes = new Uint8Array(await blob.slice(0, Math.min(blob.size, MAX_HEADER_BYTES)).arrayBuffer());
  if (blob.type === 'image/png') return parsePngDimensions(bytes);
  if (blob.type === 'image/webp') return parseWebpDimensions(bytes);
  if (blob.type === 'image/jpeg' || blob.type === 'image/jpg') return parseJpegDimensions(bytes);
  throw invalidImage();
}

export async function prepareImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Elige una imagen JPG, PNG o WebP.');
  }
  if (!file.size || file.size > MAX_IMAGE_BYTES) {
    throw new Error('La imagen debe ocupar menos de 20 MB.');
  }
  const headerDimensions = await readSafeImageDimensions(file);
  const ratio = Math.min(1, MAX_IMAGE_EDGE / Math.max(headerDimensions.width, headerDimensions.height));
  const resizeWidth = Math.max(1, Math.round(headerDimensions.width * ratio));
  const resizeHeight = Math.max(1, Math.round(headerDimensions.height * ratio));
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { resizeWidth, resizeHeight, resizeQuality: 'high' });
  } catch {
    throw new Error('No pudimos abrir esta imagen. Prueba con JPG, PNG o WebP.');
  }
  const outputRatio = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * outputRatio));
  const height = Math.max(1, Math.round(bitmap.height * outputRatio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('El navegador no pudo preparar esta imagen.');
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('No pudimos preparar la imagen.')), 'image/jpeg', 0.92);
  });
  return {
    blob,
    url: URL.createObjectURL(blob),
    width,
    height,
    name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
    originalBlob: file,
    originalType: file.type,
    originalName: file.name,
  };
}

export function objectUrl(blob) {
  return URL.createObjectURL(blob);
}
