export const SUPPORTED_LEVELS = [24, 48, 96, 192]
export const PIECE_STYLES = ['classic', 'organic', 'geometric']
export const STAGE_WIDTH = 1360
export const STAGE_HEIGHT = 900

const randomBetween = (min, max) => min + Math.random() * (max - min)
const rounded = (value) => Number(value.toFixed(2))
const EDGE_RANGES = {
  classic: { width: [0.285, 0.34], depth: [0.145, 0.205] },
  organic: { width: [0.34, 0.4], depth: [0.18, 0.23] },
  geometric: { width: [0.28, 0.34], depth: [0.16, 0.21] },
}

function chooseGrid(pieceCount, aspectRatio) {
  const options = []
  for (let columns = 1; columns <= pieceCount; columns += 1) {
    if (pieceCount % columns !== 0) continue
    const rows = pieceCount / columns
    const gridAspect = columns / rows
    options.push({ columns, rows, score: Math.abs(Math.log(gridAspect / aspectRatio)) })
  }
  options.sort((a, b) => a.score - b.score)
  return options[0]
}

function randomEdge(pieceStyle) {
  const ranges = EDGE_RANGES[pieceStyle]
  return {
    sign: Math.random() < 0.5 ? -1 : 1,
    depth: rounded(randomBetween(...ranges.depth)),
    width: rounded(randomBetween(...ranges.width)),
  }
}

function buildEdgeTables(rows, columns, pieceStyle) {
  const horizontal = Array.from({ length: rows + 1 }, () => Array(columns).fill(null))
  const vertical = Array.from({ length: columns + 1 }, () => Array(rows).fill(null))
  for (let boundary = 1; boundary < rows; boundary += 1) {
    for (let column = 0; column < columns; column += 1) horizontal[boundary][column] = randomEdge(pieceStyle)
  }
  for (let boundary = 1; boundary < columns; boundary += 1) {
    for (let row = 0; row < rows; row += 1) vertical[boundary][row] = randomEdge(pieceStyle)
  }
  return { horizontal, vertical }
}

function edgeCommands(startX, startY, endX, endY, edge, cellWidth, cellHeight, pieceStyle) {
  if (!edge) return `L ${rounded(endX)} ${rounded(endY)}`
  const dx = endX - startX
  const dy = endY - startY
  const length = Math.hypot(dx, dy)
  const tangentX = dx / length
  const tangentY = dy / length
  const normalX = -tangentY
  const normalY = tangentX
  const depth = Math.min(cellWidth, cellHeight) * edge.depth
  const center = 0.5
  const before = center - edge.width / 2
  const after = center + edge.width / 2
  const sign = edge.sign
  const point = (t, n = 0) => [
    rounded(startX + tangentX * length * t + normalX * n),
    rounded(startY + tangentY * length * t + normalY * n),
  ]
  const p0 = point(before)
  const a1 = point(before + edge.width * 0.12, sign * depth * 0.12)
  const a2 = point(center - edge.width * 0.21, sign * depth * 0.12)
  const a3 = point(center - edge.width * 0.15, sign * depth * 0.78)
  const a4 = point(center - edge.width * 0.06, sign * depth)
  const a5 = point(center + edge.width * 0.06, sign * depth)
  const a6 = point(center + edge.width * 0.15, sign * depth * 0.78)
  const a7 = point(center + edge.width * 0.21, sign * depth * 0.12)
  const a8 = point(after - edge.width * 0.12, sign * depth * 0.12)
  const p1 = point(after)
  const c = (p, q, r) => `C ${p[0]} ${p[1]} ${q[0]} ${q[1]} ${r[0]} ${r[1]}`
  if (pieceStyle === 'geometric') {
    const points = [
      p0,
      point(before + edge.width * 0.12, sign * depth * 0.12),
      point(center - edge.width * 0.2, sign * depth * 0.12),
      point(center - edge.width * 0.16, sign * depth * 0.76),
      point(center - edge.width * 0.08, sign * depth),
      point(center + edge.width * 0.08, sign * depth),
      point(center + edge.width * 0.16, sign * depth * 0.76),
      point(center + edge.width * 0.2, sign * depth * 0.12),
      point(after - edge.width * 0.12, sign * depth * 0.12),
      p1,
      [rounded(endX), rounded(endY)],
    ]
    return points.map(([x, y]) => `L ${x} ${y}`).join(' ')
  }
  if (pieceStyle === 'organic') {
    const leftShoulder = point(center - edge.width * 0.24, sign * depth * 0.78)
    const top = point(center, sign * depth)
    const rightShoulder = point(center + edge.width * 0.24, sign * depth * 0.78)
    return [
      `L ${p0[0]} ${p0[1]}`,
      c(point(before + edge.width * 0.09, sign * depth * 0.08), point(center - edge.width * 0.35, sign * depth * 0.1), leftShoulder),
      c(point(center - edge.width * 0.12, sign * depth * 1.04), point(center - edge.width * 0.07, sign * depth), top),
      c(point(center + edge.width * 0.07, sign * depth), point(center + edge.width * 0.12, sign * depth * 1.04), rightShoulder),
      c(point(center + edge.width * 0.35, sign * depth * 0.1), point(after - edge.width * 0.09, sign * depth * 0.08), p1),
      `L ${rounded(endX)} ${rounded(endY)}`,
    ].join(' ')
  }
  return [
    `L ${p0[0]} ${p0[1]}`,
    c(a1, a2, a3),
    c(a4, point(center - edge.width * 0.035, sign * depth * 0.99), point(center, sign * depth)),
    c(point(center + edge.width * 0.035, sign * depth * 0.99), a5, a6),
    c(a7, a8, p1),
    `L ${rounded(endX)} ${rounded(endY)}`,
  ].join(' ')
}

export function createPuzzleGeometry(imageWidth, imageHeight, pieceCount, pieceStyle = 'classic') {
  if (!SUPPORTED_LEVELS.includes(pieceCount)) throw new Error('Elige un nivel disponible: 24, 48, 96 o 192 piezas.')
  if (!(imageWidth > 0 && imageHeight > 0)) throw new Error('La imagen no tiene dimensiones válidas.')
  if (!PIECE_STYLES.includes(pieceStyle)) throw new Error('Elige un estilo de piezas válido.')
  const aspectRatio = imageWidth / imageHeight
  const grid = chooseGrid(pieceCount, aspectRatio)
  const maxBoardWidth = 790
  const maxBoardHeight = 570
  const width = Math.min(maxBoardWidth, maxBoardHeight * aspectRatio)
  const height = width / aspectRatio
  const cellWidth = width / grid.columns
  const cellHeight = height / grid.rows
  const edges = buildEdgeTables(grid.rows, grid.columns, pieceStyle)
  const pieces = []
  const occupied = []

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const id = `${row}-${column}`
      const top = column < 0 ? null : row > 0 ? { ...edges.horizontal[row][column], sign: -edges.horizontal[row][column].sign } : null
      const right = column < grid.columns - 1 ? edges.vertical[column + 1][row] : null
      const bottom = row < grid.rows - 1 ? edges.horizontal[row + 1][column] : null
      const left = column > 0 ? { ...edges.vertical[column][row], sign: -edges.vertical[column][row].sign } : null
      const topCommands = edgeCommands(0, 0, cellWidth, 0, top, cellWidth, cellHeight, pieceStyle)
      const rightCommands = edgeCommands(cellWidth, 0, cellWidth, cellHeight, right, cellWidth, cellHeight, pieceStyle)
      const bottomCommands = edgeCommands(cellWidth, cellHeight, 0, cellHeight, bottom, cellWidth, cellHeight, pieceStyle)
      const leftCommands = edgeCommands(0, cellHeight, 0, 0, left, cellWidth, cellHeight, pieceStyle)
      const path = `M 0 0 ${topCommands} ${rightCommands} ${bottomCommands} ${leftCommands} Z`
      const scatter = chooseScatterPoint({ width, height, cellWidth, cellHeight, row, column, canvasWidth: STAGE_WIDTH, canvasHeight: STAGE_HEIGHT, occupied })
      occupied.push({
        left: scatter.x - cellWidth * 0.22,
        top: scatter.y - cellHeight * 0.22,
        right: scatter.x + cellWidth * 1.22,
        bottom: scatter.y + cellHeight * 1.22,
      })
      pieces.push({
        id,
        row,
        column,
        path,
        x: scatter.x,
        y: scatter.y,
        rotation: 0,
        locked: false,
        z: row * grid.columns + column,
      })
    }
  }

  return {
    version: 2,
    pieceStyle,
    board: {
      x: rounded((1360 - width) / 2),
      y: rounded((900 - height) / 2),
      width: rounded(width),
      height: rounded(height),
      columns: grid.columns,
      rows: grid.rows,
      cellWidth: rounded(cellWidth),
      cellHeight: rounded(cellHeight),
    },
    edges,
    pieces,
  }
}

export function createPuzzle(pieceCount, imageWidth, imageHeight, rotationMode = 'fixed', pieceStyle = 'classic') {
  const base = createPuzzleGeometry(imageWidth, imageHeight, pieceCount, pieceStyle)
  const board = base.board
  return {
    width: board.width,
    height: board.height,
    rows: board.rows,
    cols: board.columns,
    seed: Math.floor(Math.random() * 2_147_000_000),
    pieceStyle,
    stageWidth: STAGE_WIDTH,
    stageHeight: STAGE_HEIGHT,
    boardX: board.x,
    boardY: board.y,
    cellWidth: board.cellWidth,
    cellHeight: board.cellHeight,
    pieces: base.pieces.map((piece, index) => ({
      id: index,
      row: piece.row,
      col: piece.column,
      path: piece.path,
      centerX: (piece.column + 0.5) * board.cellWidth,
      centerY: (piece.row + 0.5) * board.cellHeight,
      offsetX: piece.x - board.x - piece.column * board.cellWidth,
      offsetY: piece.y - board.y - piece.row * board.cellHeight,
      rotation: rotationMode === 'random' ? Math.floor(Math.random() * 4) * 90 : 0,
      locked: false,
    })),
  }
}

function chooseScatterPoint({ width, height, cellWidth, cellHeight, row, column, canvasWidth, canvasHeight, occupied }) {
  const boardX = (canvasWidth - width) / 2
  const boardY = (canvasHeight - height) / 2
  const marginX = Math.max(cellWidth, 30)
  const marginY = Math.max(cellHeight, 26)
  const expanded = { left: boardX - marginX * 0.42, right: boardX + width + marginX * 0.42, top: boardY - marginY * 0.42, bottom: boardY + height + marginY * 0.42 }
  let x = 0
  let y = 0
  for (let attempt = 0; attempt < 80; attempt += 1) {
    x = randomBetween(20, canvasWidth - cellWidth - 20)
    y = randomBetween(18, canvasHeight - cellHeight - 18)
    const inside = x > expanded.left && x < expanded.right && y > expanded.top && y < expanded.bottom
    const candidate = {
      left: x - cellWidth * 0.22,
      top: y - cellHeight * 0.22,
      right: x + cellWidth * 1.22,
      bottom: y + cellHeight * 1.22,
    }
    const collides = occupied.some((other) => candidate.left < other.right && candidate.right > other.left && candidate.top < other.bottom && candidate.bottom > other.top)
    if (!inside && !collides) break
    if (attempt === 79) {
      x = (row + column) % 2 ? randomBetween(20, Math.max(21, boardX - cellWidth)) : randomBetween(boardX + width + 20, canvasWidth - cellWidth - 20)
      y = randomBetween(18, canvasHeight - cellHeight - 18)
    }
  }
  return { x: rounded(x), y: rounded(y) }
}
