import JSZip from 'jszip';
import { readSafeImageDimensions } from './image';

const FORMAT_VERSION = 2;
const LEGACY_FORMAT_VERSION = 1;
const MAX_ARCHIVE_BYTES = 45 * 1024 * 1024;
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_TOTAL_EXPANDED_BYTES = 41 * 1024 * 1024;
const LEVELS = [24, 48, 96, 192];
const ROTATIONS = ['fixed', 'random', 'manual'];
const ALLOWED_ORIGINAL_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CRC_TABLE = new Uint32Array(256);

for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  CRC_TABLE[index] = value >>> 0;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function sourceFileExtension(type) {
  return type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : null;
}

function validatePath(path, cellWidth, cellHeight) {
  if (typeof path !== 'string' || path.length > 12000) return false;
  const tokenPattern = /([MLCZ])|(-?(?:\d+(?:\.\d*)?|\.\d+))/g;
  const tokens = [];
  let lastIndex = 0;
  let match;
  while ((match = tokenPattern.exec(path))) {
    if (!/^[\s,]*$/.test(path.slice(lastIndex, match.index))) return false;
    tokens.push(match[1] ?? Number(match[2]));
    lastIndex = tokenPattern.lastIndex;
  }
  if (!tokens.length || !/^[\s,]*$/.test(path.slice(lastIndex))) return false;
  const arity = { M: 2, L: 2, C: 6, Z: 0 };
  let index = 0;
  let commandCount = 0;
  while (index < tokens.length) {
    const command = tokens[index++];
    if (typeof command !== 'string' || !(command in arity)) return false;
    if ((commandCount === 0 && command !== 'M') || (command === 'M' && commandCount !== 0)) return false;
    const count = arity[command];
    if (index + count > tokens.length) return false;
    for (let coordinateIndex = 0; coordinateIndex < count; coordinateIndex += 1) {
      const coordinate = tokens[index++];
      if (typeof coordinate !== 'number' || !Number.isFinite(coordinate)) return false;
      const horizontal = coordinateIndex % 2 === 0;
      const bound = (horizontal ? cellWidth : cellHeight) * 0.3;
      const maximum = horizontal ? cellWidth : cellHeight;
      if (coordinate < -bound || coordinate > maximum + bound) return false;
    }
    commandCount += 1;
    if (command === 'Z') return index === tokens.length && commandCount >= 5;
  }
  return false;
}

function validateManifest(manifest) {
  const isLegacy = manifest?.formatVersion === LEGACY_FORMAT_VERSION;
  if (!manifest || (!isLegacy && manifest.formatVersion !== FORMAT_VERSION)) throw new Error('Esta versión de Puzlea no reconoce este archivo.');
  if (!LEVELS.includes(manifest.level) || !ROTATIONS.includes(manifest.rotationMode)) throw new Error('La configuración de la partida no es válida.');
  if (manifest.imageFile !== 'image.jpg' || manifest.imageType !== 'image/jpeg' ||
      !Number.isSafeInteger(manifest.imageWidth) || !Number.isSafeInteger(manifest.imageHeight) ||
      manifest.imageWidth < 1 || manifest.imageHeight < 1 || manifest.imageWidth > 3200 || manifest.imageHeight > 3200) {
    throw new Error('El archivo no contiene una imagen de partida válida.');
  }
  if (typeof manifest.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(manifest.id) ||
      typeof manifest.imageName !== 'string' || manifest.imageName.length > 240 || typeof manifest.timerEnabled !== 'boolean') {
    throw new Error('Los datos de la partida no son válidos.');
  }
  if (!isLegacy) {
    const extension = sourceFileExtension(manifest.originalImageType);
    if (!extension || manifest.originalImageFile !== `source-image.${extension}` ||
        typeof manifest.originalImageName !== 'string' || manifest.originalImageName.length > 240) {
      throw new Error('El archivo no contiene la imagen original de referencia.');
    }
  }

  const geometry = manifest.geometry;
  if (!geometry || !Array.isArray(geometry.pieces) || geometry.pieces.length !== manifest.level) throw new Error('El tablero guardado está incompleto.');
  const dimensions = ['width', 'height', 'rows', 'cols', 'stageWidth', 'stageHeight', 'boardX', 'boardY', 'cellWidth', 'cellHeight', 'seed'];
  if (!dimensions.every((key) => isFiniteNumber(geometry[key]))) throw new Error('La geometría guardada no es válida.');
  if (!Number.isInteger(geometry.rows) || !Number.isInteger(geometry.cols) || geometry.rows < 1 || geometry.cols < 1 ||
      geometry.rows * geometry.cols !== manifest.level || geometry.stageWidth !== 1360 || geometry.stageHeight !== 900 ||
      geometry.width <= 0 || geometry.width > 790 || geometry.height <= 0 || geometry.height > 570 ||
      geometry.cellWidth <= 0 || geometry.cellHeight <= 0 || Math.abs(geometry.cellWidth * geometry.cols - geometry.width) > 1 ||
      Math.abs(geometry.cellHeight * geometry.rows - geometry.height) > 1 ||
      Math.abs(geometry.width / geometry.height - manifest.imageWidth / manifest.imageHeight) > Math.max(0.00001, (manifest.imageWidth / manifest.imageHeight) * 0.01) ||
      !Number.isInteger(geometry.seed) || geometry.seed < 0 || geometry.seed > 2147000000 ||
      geometry.boardX < 0 || geometry.boardY < 0 || geometry.boardX + geometry.width > geometry.stageWidth ||
      geometry.boardY + geometry.height > geometry.stageHeight || manifest.boardWidth !== geometry.width ||
      manifest.boardHeight !== geometry.height) {
    throw new Error('El tamaño del tablero guardado no es válido.');
  }
  if (!Number.isInteger(manifest.elapsedSeconds) || manifest.elapsedSeconds < 0 || manifest.elapsedSeconds > 31536000) {
    throw new Error('El cronómetro guardado no es válido.');
  }

  const ids = new Set();
  const occupiedCells = new Set();
  for (const piece of geometry.pieces) {
    const cellKey = `${piece.row}:${piece.col}`;
    if (!Number.isInteger(piece.id) || piece.id < 0 || piece.id >= manifest.level || ids.has(piece.id) ||
        !Number.isInteger(piece.row) || piece.row < 0 || piece.row >= geometry.rows ||
        !Number.isInteger(piece.col) || piece.col < 0 || piece.col >= geometry.cols || occupiedCells.has(cellKey) ||
        piece.id !== piece.row * geometry.cols + piece.col || !validatePath(piece.path, geometry.cellWidth, geometry.cellHeight)) {
      throw new Error('Una pieza guardada no es válida.');
    }
    if (![piece.centerX, piece.centerY, piece.offsetX, piece.offsetY, piece.rotation].every(isFiniteNumber) ||
        Math.abs(piece.centerX - (piece.col + 0.5) * geometry.cellWidth) > 0.05 ||
        Math.abs(piece.centerY - (piece.row + 0.5) * geometry.cellHeight) > 0.05 ||
        Math.abs(piece.offsetX) > 4000 || Math.abs(piece.offsetY) > 4000 || ![0, 90, 180, 270].includes(piece.rotation)) {
      throw new Error('La posición de una pieza no es válida.');
    }
    const positionX = geometry.boardX + piece.col * geometry.cellWidth + piece.offsetX;
    const positionY = geometry.boardY + piece.row * geometry.cellHeight + piece.offsetY;
    if (positionX < -geometry.cellWidth || positionX > geometry.stageWidth || positionY < -geometry.cellHeight || positionY > geometry.stageHeight) {
      throw new Error('La posición de una pieza está fuera del tablero.');
    }
    if (typeof piece.locked !== 'boolean' || (piece.locked && (piece.offsetX !== 0 || piece.offsetY !== 0 || piece.rotation !== 0)) ||
        (manifest.rotationMode === 'fixed' && piece.rotation !== 0)) {
      throw new Error('El estado de una pieza no es válido.');
    }
    ids.add(piece.id);
    occupiedCells.add(cellKey);
  }
  if (occupiedCells.size !== manifest.level) throw new Error('El tablero guardado no contiene todas sus piezas.');
}

function decodeAscii(bytes) {
  let value = '';
  for (const byte of bytes) {
    if (byte > 0x7f) throw new Error('El archivo contiene nombres de datos no válidos.');
    value += String.fromCharCode(byte);
  }
  return value;
}

async function preflightZip(file) {
  if (!file.size || file.size > MAX_ARCHIVE_BYTES || file.size < 22) {
    throw new Error('El archivo de partida supera el límite de 45 MB o está incompleto.');
  }
  const tailOffset = Math.max(0, file.size - 65557);
  const tail = new Uint8Array(await file.slice(tailOffset).arrayBuffer());
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocdIndex = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (tailView.getUint32(index, true) === 0x06054b50 && index + 22 + tailView.getUint16(index + 20, true) === tail.length) {
      eocdIndex = index;
      break;
    }
  }
  if (eocdIndex < 0) throw new Error('El archivo de partida está dañado o incompleto.');
  const diskNumber = tailView.getUint16(eocdIndex + 4, true);
  const centralDisk = tailView.getUint16(eocdIndex + 6, true);
  const entriesOnDisk = tailView.getUint16(eocdIndex + 8, true);
  const entryCount = tailView.getUint16(eocdIndex + 10, true);
  const centralSize = tailView.getUint32(eocdIndex + 12, true);
  const centralOffset = tailView.getUint32(eocdIndex + 16, true);
  const eocdOffset = tailOffset + eocdIndex;
  if (diskNumber !== 0 || centralDisk !== 0 || entryCount < 2 || entryCount > 3 || entriesOnDisk !== entryCount ||
      entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff ||
      centralOffset + centralSize !== eocdOffset || centralOffset < 0 || centralOffset + centralSize > file.size) {
    throw new Error('El archivo de partida contiene una estructura ZIP no compatible.');
  }

  const central = new Uint8Array(await file.slice(centralOffset, centralOffset + centralSize).arrayBuffer());
  const view = new DataView(central.buffer, central.byteOffset, central.byteLength);
  const entries = new Map();
  let cursor = 0;
  let totalExpanded = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > central.length || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error('El archivo de partida está dañado o incompleto.');
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const crc32 = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const diskStart = view.getUint16(cursor + 34, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (recordEnd > central.length || !nameLength || (flags & 0x1) !== 0 ||
        (method !== 0 && method !== 8) || diskStart !== 0 || compressedSize === 0xffffffff ||
        uncompressedSize === 0xffffffff || localOffset === 0xffffffff || localOffset >= centralOffset) {
      throw new Error('El archivo de partida contiene una estructura ZIP no compatible.');
    }
    const name = decodeAscii(central.subarray(cursor + 46, cursor + 46 + nameLength));
    let maxSize;
    if (name === 'manifest.json') maxSize = MAX_MANIFEST_BYTES;
    else if (name === 'image.jpg' || /^source-image\.(jpg|png|webp)$/.test(name)) maxSize = MAX_ENTRY_BYTES;
    else throw new Error('El archivo de partida contiene datos inesperados.');
    if (entries.has(name) || uncompressedSize > maxSize || compressedSize > MAX_ARCHIVE_BYTES) {
      throw new Error('El archivo de partida supera los límites permitidos.');
    }
    totalExpanded += uncompressedSize;
    if (totalExpanded > MAX_TOTAL_EXPANDED_BYTES) throw new Error('El archivo de partida supera los límites de contenido.');
    entries.set(name, { name, crc32, compressedSize, uncompressedSize });
    cursor = recordEnd;
  }
  if (cursor !== central.length || !entries.has('manifest.json') || !entries.has('image.jpg') ||
      (entryCount === 3) !== [...entries.keys()].some((name) => name.startsWith('source-image.'))) {
    throw new Error('El archivo no contiene una partida completa de Puzlea.');
  }
  return entries;
}

function makeCrc32Updater() {
  let crc = 0xffffffff;
  return {
    update(chunk) {
      for (const byte of chunk) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    },
    digest() {
      return (crc ^ 0xffffffff) >>> 0;
    },
  };
}

function readZipEntryLimited(file, entry, maxBytes, mimeType, asBlob = false) {
  const helper = file.internalStream('uint8array');
  const chunks = [];
  const checksum = makeCrc32Updater();
  let byteLength = 0;
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      helper.pause();
      reject(error);
    };
    helper.on('data', (chunk) => {
      byteLength += chunk.byteLength;
      if (byteLength > maxBytes || byteLength > entry.uncompressedSize) {
        fail(new Error('El archivo se expandió más allá del tamaño permitido.'));
        return;
      }
      checksum.update(chunk);
      chunks.push(chunk);
    }).on('error', fail).on('end', () => {
      if (settled) return;
      if (byteLength !== entry.uncompressedSize || checksum.digest() !== entry.crc32) {
        fail(new Error('El archivo contiene datos dañados.'));
        return;
      }
      settled = true;
      if (asBlob) {
        resolve(new Blob(chunks, { type: mimeType }));
        return;
      }
      const result = new Uint8Array(byteLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(result);
    });
    helper.resume();
  });
}

export async function downloadPuzzleArchive(puzzle) {
  const originalImageBlob = puzzle.originalImageBlob instanceof Blob ? puzzle.originalImageBlob : puzzle.imageBlob;
  const originalImageType = puzzle.originalImageType || originalImageBlob.type || 'image/jpeg';
  const extension = sourceFileExtension(originalImageType);
  if (!extension || !originalImageBlob.size || !puzzle.imageBlob?.size ||
      originalImageBlob.size > MAX_ENTRY_BYTES || puzzle.imageBlob.size > MAX_ENTRY_BYTES) {
    throw new Error('Las imágenes de esta partida superan el límite de exportación.');
  }
  const originalImageFile = `source-image.${extension}`;
  const { imageBlob, originalImageBlob: _sourceBlob, ...metadata } = puzzle;
  const manifest = {
    ...metadata,
    formatVersion: FORMAT_VERSION,
    imageFile: 'image.jpg',
    imageType: 'image/jpeg',
    originalImageFile,
    originalImageType,
    originalImageName: puzzle.originalImageName || puzzle.imageName,
  };
  validateManifest(manifest);
  const gameDimensions = await readSafeImageDimensions(puzzle.imageBlob);
  if (gameDimensions.width !== manifest.imageWidth || gameDimensions.height !== manifest.imageHeight) {
    throw new Error('La imagen y el tablero de esta partida no coinciden.');
  }
  await readSafeImageDimensions(new Blob([originalImageBlob], { type: originalImageType }));
  const manifestText = JSON.stringify(manifest);
  if (new TextEncoder().encode(manifestText).byteLength > MAX_MANIFEST_BYTES) {
    throw new Error('Los datos de esta partida superan el límite de exportación.');
  }
  const zip = new JSZip();
  zip.file('manifest.json', manifestText);
  zip.file('image.jpg', imageBlob);
  zip.file(originalImageFile, originalImageBlob);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } });
  if (blob.size > MAX_ARCHIVE_BYTES) throw new Error('El archivo de partida supera el límite de 45 MB.');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `puzlea-${puzzle.id.slice(0, 8)}.puzlea`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readPuzzleArchive(file) {
  const entries = await preflightZip(file);
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('No pudimos abrir este archivo de partida.');
  }
  const archiveNames = Object.keys(zip.files);
  if (archiveNames.length !== entries.size || archiveNames.some((name) => !entries.has(name) || zip.files[name].dir)) {
    throw new Error('El archivo de partida contiene datos inesperados.');
  }
  for (const [name, entry] of entries) {
    const loadedSize = zip.files[name]?._data?.uncompressedSize;
    const compressedSize = zip.files[name]?._data?.compressedSize;
    if (loadedSize !== entry.uncompressedSize || compressedSize !== entry.compressedSize) {
      throw new Error('El archivo de partida está dañado o incompleto.');
    }
  }

  let manifest;
  try {
    const manifestBytes = await readZipEntryLimited(zip.file('manifest.json'), entries.get('manifest.json'), MAX_MANIFEST_BYTES);
    manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes));
    validateManifest(manifest);
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('El ') || error.message.startsWith('Esta '))) throw error;
    throw new Error('El archivo de partida está dañado o incompleto.');
  }
  const isLegacy = manifest.formatVersion === LEGACY_FORMAT_VERSION;
  if ((isLegacy && entries.size !== 2) || (!isLegacy && entries.size !== 3)) {
    throw new Error('El archivo de partida contiene una estructura de versión no válida.');
  }

  const imageEntry = entries.get('image.jpg');
  const imageBytes = await readZipEntryLimited(zip.file('image.jpg'), imageEntry, MAX_ENTRY_BYTES);
  const imageBlob = new Blob([imageBytes], { type: 'image/jpeg' });
  const gameImageDimensions = await readSafeImageDimensions(imageBlob);
  if (gameImageDimensions.width !== manifest.imageWidth || gameImageDimensions.height !== manifest.imageHeight) {
    throw new Error('La imagen y el tablero del archivo no coinciden.');
  }

  let originalImageBlob = imageBlob;
  let originalImageType = 'image/jpeg';
  let originalImageName = manifest.imageName;
  if (manifest.formatVersion === FORMAT_VERSION) {
    const originalEntry = entries.get(manifest.originalImageFile);
    if (!originalEntry || !/^source-image\.(jpg|png|webp)$/.test(manifest.originalImageFile)) {
      throw new Error('El archivo no contiene la imagen original de referencia.');
    }
    const originalBytes = await readZipEntryLimited(zip.file(manifest.originalImageFile), originalEntry, MAX_ENTRY_BYTES);
    originalImageType = manifest.originalImageType;
    originalImageName = manifest.originalImageName;
    originalImageBlob = new Blob([originalBytes], { type: originalImageType });
    await readSafeImageDimensions(originalImageBlob);
  }
  const { imageFile: _imagePath, originalImageFile: _originalPath, ...metadata } = manifest;
  return {
    ...metadata,
    imageBlob,
    imageType: 'image/jpeg',
    originalImageBlob,
    originalImageType,
    originalImageName,
    updatedAt: Date.now(),
  };
}
