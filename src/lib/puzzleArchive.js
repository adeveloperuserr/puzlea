import JSZip from 'jszip';

const FORMAT_VERSION = 1;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const LEVELS = [24, 48, 96, 192];
const ROTATIONS = ['fixed', 'random', 'manual'];

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateManifest(manifest) {
  if (!manifest || manifest.formatVersion !== FORMAT_VERSION) throw new Error('Esta versión de Puzlea no reconoce este archivo.');
  if (!LEVELS.includes(manifest.level) || !ROTATIONS.includes(manifest.rotationMode)) throw new Error('La configuración de la partida no es válida.');
  if (manifest.imageFile !== 'image.jpg' || manifest.imageType !== 'image/jpeg' ||
      !Number.isSafeInteger(manifest.imageWidth) || !Number.isSafeInteger(manifest.imageHeight) ||
      manifest.imageWidth < 1 || manifest.imageHeight < 1 || manifest.imageWidth > 3200 || manifest.imageHeight > 3200) {
    throw new Error('El archivo no contiene una imagen de partida válida.');
  }
  if (typeof manifest.imageName !== 'string' || manifest.imageName.length > 240 || typeof manifest.timerEnabled !== 'boolean') {
    throw new Error('Los datos de la partida no son válidos.');
  }
  const geometry = manifest.geometry;
  if (!geometry || !Array.isArray(geometry.pieces) || geometry.pieces.length !== manifest.level) throw new Error('El tablero guardado está incompleto.');
  const dimensions = ['width', 'height', 'rows', 'cols', 'stageWidth', 'stageHeight', 'boardX', 'boardY', 'cellWidth', 'cellHeight', 'seed'];
  if (!dimensions.every((key) => isFiniteNumber(geometry[key]))) throw new Error('La geometría guardada no es válida.');
  if (!Number.isInteger(geometry.rows) || !Number.isInteger(geometry.cols) || geometry.rows < 1 || geometry.cols < 1 ||
      geometry.rows * geometry.cols !== manifest.level || geometry.stageWidth > 4000 || geometry.stageHeight > 4000 ||
      geometry.width <= 0 || geometry.height <= 0 || geometry.cellWidth <= 0 || geometry.cellHeight <= 0 ||
      geometry.boardX < 0 || geometry.boardY < 0 || geometry.boardX + geometry.width > geometry.stageWidth || geometry.boardY + geometry.height > geometry.stageHeight ||
      manifest.boardWidth !== geometry.width || manifest.boardHeight !== geometry.height) {
    throw new Error('El tamaño del tablero guardado no es válido.');
  }
  const ids = new Set();
  for (const piece of geometry.pieces) {
    if (!Number.isInteger(piece.id) || piece.id < 0 || piece.id >= manifest.level || ids.has(piece.id) ||
        !Number.isInteger(piece.row) || piece.row < 0 || piece.row >= geometry.rows ||
        !Number.isInteger(piece.col) || piece.col < 0 || piece.col >= geometry.cols ||
        typeof piece.path !== 'string' || piece.path.length > 12000 || !/^[MmLlCcZz0-9.,\s-]+$/.test(piece.path)) {
      throw new Error('Una pieza guardada no es válida.');
    }
    if (![piece.centerX, piece.centerY, piece.offsetX, piece.offsetY, piece.rotation].every(isFiniteNumber) ||
        Math.abs(piece.offsetX) > 4000 || Math.abs(piece.offsetY) > 4000 || ![0, 90, 180, 270].includes(piece.rotation)) {
      throw new Error('La posición de una pieza no es válida.');
    }
    if (typeof piece.locked !== 'boolean') throw new Error('El estado de una pieza no es válido.');
    ids.add(piece.id);
  }
  if (!isFiniteNumber(manifest.elapsedSeconds) || manifest.elapsedSeconds < 0 || manifest.elapsedSeconds > 31536000) throw new Error('El cronómetro guardado no es válido.');
}

export async function downloadPuzzleArchive(puzzle) {
  const zip = new JSZip();
  const { imageBlob, ...metadata } = puzzle;
  const manifest = { ...metadata, formatVersion: FORMAT_VERSION, imageFile: 'image.jpg' };
  zip.file('manifest.json', JSON.stringify(manifest));
  zip.file('image.jpg', imageBlob);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `puzlea-${puzzle.id.slice(0, 8)}.puzlea`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readPuzzleArchive(file) {
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error('El archivo de partida supera el límite de 100 MB.');
  let zip;
  try {
    zip = await JSZip.loadAsync(file, { checkCRC32: true });
  } catch {
    throw new Error('No pudimos abrir este archivo de partida.');
  }
  const manifestFile = zip.file('manifest.json');
  const imageFile = zip.file('image.jpg');
  if (!manifestFile || !imageFile) throw new Error('El archivo no contiene una partida completa de Puzlea.');
  let manifest;
  try {
    manifest = JSON.parse(await manifestFile.async('string'));
    validateManifest(manifest);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('El ')) throw error;
    if (error instanceof Error && error.message.startsWith('Esta ')) throw error;
    throw new Error('El archivo de partida está dañado o incompleto.');
  }
  const imageBlob = await imageFile.async('blob');
  if (!imageBlob.size || imageBlob.size > 20 * 1024 * 1024) throw new Error('La imagen guardada no es válida.');
  const { imageFile: _imagePath, ...metadata } = manifest;
  return { ...metadata, imageBlob, imageType: 'image/jpeg', updatedAt: Date.now() };
}
