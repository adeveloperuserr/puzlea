import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const LETTER = { width: 612, height: 792 };
const MARGIN = 36;
const TILE_LONG_SIDE = 1550;
const OVERLAP = 55;

async function loadBitmap(blob) {
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new Error('No pudimos preparar la imagen para imprimir.');
  }
}

function drawRegistrationMark(context, x, y) {
  context.beginPath();
  context.moveTo(x - 12, y);
  context.lineTo(x + 12, y);
  context.moveTo(x, y - 12);
  context.lineTo(x, y + 12);
  context.stroke();
}

export async function createPuzzlePdf(puzzle) {
  const bitmap = await loadBitmap(puzzle.imageBlob);
  const aspect = bitmap.width / bitmap.height;
  const landscape = aspect > 1.08;
  const pageSize = landscape ? { width: LETTER.height, height: LETTER.width } : LETTER;
  const contentWidth = pageSize.width - MARGIN * 2;
  const contentHeight = pageSize.height - MARGIN * 2;
  let tileWidth = aspect >= 1 ? TILE_LONG_SIDE : TILE_LONG_SIDE * aspect;
  let tileHeight = tileWidth / aspect;
  if (tileWidth > bitmap.width) {
    tileWidth = bitmap.width;
    tileHeight = tileWidth / aspect;
  }
  if (tileHeight > bitmap.height) {
    tileHeight = bitmap.height;
    tileWidth = tileHeight * aspect;
  }
  const columns = Math.max(1, Math.ceil(bitmap.width / tileWidth));
  const rows = Math.max(1, Math.ceil(bitmap.height / tileHeight));
  const scalePoints = Math.min(contentWidth / tileWidth, contentHeight / tileHeight);
  const pixelsPerPoint = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(pageSize.width * pixelsPerPoint);
  canvas.height = Math.round(pageSize.height * pixelsPerPoint);
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('El navegador no pudo preparar las páginas del PDF.');
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const scalePx = scalePoints * pixelsPerPoint;
  const coreWidthPx = tileWidth * scalePx;
  const coreHeightPx = tileHeight * scalePx;
  const originX = MARGIN * pixelsPerPoint;
  const originY = MARGIN * pixelsPerPoint;
  const imageScale = bitmap.width / puzzle.geometry.width;
  const pathScale = scalePx * imageScale;
  const pageCount = rows * columns;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const coreX = col * tileWidth;
      const coreY = row * tileHeight;
      const cropX = Math.max(0, coreX - (col > 0 ? OVERLAP : 0));
      const cropY = Math.max(0, coreY - (row > 0 ? OVERLAP : 0));
      const pageNumber = row * columns + col + 1;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.beginPath();
      context.rect(originX, originY, coreWidthPx + OVERLAP * scalePx, coreHeightPx + OVERLAP * scalePx);
      context.clip();
      context.drawImage(bitmap, originX - cropX * scalePx, originY - cropY * scalePx, bitmap.width * scalePx, bitmap.height * scalePx);
      context.restore();

      context.save();
      context.beginPath();
      context.rect(originX, originY, coreWidthPx + OVERLAP * scalePx, coreHeightPx + OVERLAP * scalePx);
      context.clip();
      context.translate(originX - cropX * scalePx, originY - cropY * scalePx);
      context.scale(pathScale, pathScale);
      context.strokeStyle = '#173a3d';
      context.lineWidth = 1.5 / pathScale;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      for (const piece of puzzle.geometry.pieces) {
        context.save();
        context.translate(piece.col * puzzle.geometry.cellWidth, piece.row * puzzle.geometry.cellHeight);
        context.stroke(new Path2D(piece.path));
        context.restore();
      }
      context.restore();

      context.save();
      context.strokeStyle = '#173a3d';
      context.lineWidth = 1.5;
      const incomingX = originX + (coreX - cropX) * scalePx;
      const incomingY = originY + (coreY - cropY) * scalePx;
      const outgoingX = originX + ((col + 1) * tileWidth - cropX) * scalePx;
      const outgoingY = originY + ((row + 1) * tileHeight - cropY) * scalePx;
      const coreCenterX = originX + (coreX + tileWidth * 0.5 - cropX) * scalePx;
      const coreCenterY = originY + (coreY + tileHeight * 0.5 - cropY) * scalePx;
      if (col > 0) drawRegistrationMark(context, incomingX, coreCenterY);
      if (row > 0) drawRegistrationMark(context, coreCenterX, incomingY);
      if (col < columns - 1) drawRegistrationMark(context, outgoingX, coreCenterY);
      if (row < rows - 1) drawRegistrationMark(context, coreCenterX, outgoingY);
      context.restore();

      const page = pdf.addPage([pageSize.width, pageSize.height]);
      const jpg = await pdf.embedJpg(canvas.toDataURL('image/jpeg', 0.94));
      page.drawImage(jpg, { x: 0, y: 0, width: pageSize.width, height: pageSize.height });
      page.drawText(`Puzlea · ${puzzle.level} piezas`, { x: MARGIN, y: pageSize.height - 21, size: 9, font, color: rgb(0.09, 0.23, 0.24) });
      page.drawText(`Hoja ${pageNumber} de ${pageCount} · Columna ${col + 1}, fila ${row + 1}`, { x: MARGIN, y: 18, size: 8, font, color: rgb(0.29, 0.38, 0.38) });
    }
  }
  bitmap.close();
  const bytes = await pdf.save();
  return new Blob([bytes], { type: 'application/pdf' });
}
