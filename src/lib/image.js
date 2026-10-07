export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_EDGE = 3200;

export async function prepareImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Elige una imagen JPG, PNG o WebP.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('La imagen supera el límite de 20 MB.');
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('No pudimos abrir esta imagen. Prueba con JPG, PNG o WebP.');
  }
  const ratio = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
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
  return { blob, url: URL.createObjectURL(blob), width, height, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
}

export function objectUrl(blob) {
  return URL.createObjectURL(blob);
}
