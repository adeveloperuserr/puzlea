import { useId, useRef } from 'react';
import { STAGE_HEIGHT, STAGE_WIDTH } from './geometry';

function pointerPosition(event, element) {
  const rect = element.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * STAGE_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * STAGE_HEIGHT,
  };
}

export default function PuzzleStage({ puzzle, imageUrl, onChange, selectedId, onSelect, showHint, showTargetOutlines = true }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const idPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const geometry = puzzle.geometry;
  const activePieces = [...geometry.pieces].sort((a, b) => {
    if (a.id === selectedId) return 1;
    if (b.id === selectedId) return -1;
    return Number(a.locked) - Number(b.locked);
  });

  function moveToEvent(event) {
    if (!dragRef.current || !svgRef.current) return null;
    const pointer = pointerPosition(event, svgRef.current);
    const deltaX = pointer.x - dragRef.current.pointerX;
    const deltaY = pointer.y - dragRef.current.pointerY;
    return {
      x: Math.max(-geometry.width, Math.min(STAGE_WIDTH, dragRef.current.offsetX + deltaX)),
      y: Math.max(-geometry.height, Math.min(STAGE_HEIGHT, dragRef.current.offsetY + deltaY)),
    };
  }

  function handlePointerDown(event, piece) {
    if (piece.locked) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    const pointer = pointerPosition(event, svgRef.current);
    dragRef.current = { id: piece.id, pointerX: pointer.x, pointerY: pointer.y, offsetX: piece.offsetX, offsetY: piece.offsetY };
    onSelect(piece.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!dragRef.current) return;
    const position = moveToEvent(event);
    if (!position) return;
    const active = dragRef.current;
    const pieces = geometry.pieces.map((piece) => piece.id === active.id ? { ...piece, offsetX: position.x, offsetY: position.y } : piece);
    onChange({ ...puzzle, geometry: { ...geometry, pieces }, updatedAt: Date.now() });
  }

  function handlePointerUp(event) {
    if (!dragRef.current) return;
    const active = dragRef.current;
    const position = moveToEvent(event) ?? { x: active.offsetX, y: active.offsetY };
    dragRef.current = null;
    const piece = geometry.pieces.find((candidate) => candidate.id === active.id);
    if (!piece) return;
    commitPiece(active.id, position);
  }

  function commitPiece(id, position) {
    const piece = geometry.pieces.find((candidate) => candidate.id === id);
    if (!piece) return;
    const upright = piece.rotation % 360 === 0;
    const canPlace = upright && Math.abs(position.x) <= geometry.cellWidth * 0.28 && Math.abs(position.y) <= geometry.cellHeight * 0.28;
    const pieces = geometry.pieces.map((candidate) => candidate.id === id
      ? canPlace
        ? { ...candidate, offsetX: 0, offsetY: 0, rotation: 0, locked: true }
        : { ...candidate, offsetX: position.x, offsetY: position.y }
      : candidate);
    onChange({ ...puzzle, geometry: { ...geometry, pieces }, updatedAt: Date.now() });
  }

  function handlePieceKeyDown(event, piece) {
    if (piece.locked) return;
    const step = event.shiftKey ? 24 : 10;
    const deltas = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (deltas[event.key]) {
      event.preventDefault();
      const [dx, dy] = deltas[event.key];
      const position = { x: piece.offsetX + dx, y: piece.offsetY + dy };
      const pieces = geometry.pieces.map((candidate) => candidate.id === piece.id ? { ...candidate, ...{ offsetX: position.x, offsetY: position.y } } : candidate);
      onChange({ ...puzzle, geometry: { ...geometry, pieces }, updatedAt: Date.now() });
      onSelect(piece.id);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      commitPiece(piece.id, { x: piece.offsetX, y: piece.offsetY });
    }
  }

  return (
    <div className="stage-frame">
      <svg
        ref={svgRef}
        className="puzzle-stage"
        viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
        role="application"
        aria-label="Tablero de rompecabezas. Arrastra las piezas y suéltalas en su lugar."
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <pattern id={`${idPrefix}-grain`} width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="#385559" opacity="0.08" />
          </pattern>
          {geometry.pieces.map((piece) => (
            <clipPath key={piece.id} id={`${idPrefix}-piece-${piece.id}`} clipPathUnits="userSpaceOnUse">
              <path d={piece.path} transform={`translate(${piece.col * geometry.cellWidth} ${piece.row * geometry.cellHeight})`} />
            </clipPath>
          ))}
        </defs>
        <rect width={STAGE_WIDTH} height={STAGE_HEIGHT} fill="#d9e6e5" />
        <rect width={STAGE_WIDTH} height={STAGE_HEIGHT} fill={`url(#${idPrefix}-grain)`} />
        <rect x="10" y="10" width={STAGE_WIDTH - 20} height={STAGE_HEIGHT - 20} rx="26" fill="none" stroke="#fff" strokeOpacity="0.58" strokeWidth="2" />
        <rect x={geometry.boardX - 10} y={geometry.boardY - 10} width={geometry.width + 20} height={geometry.height + 20} rx="18" fill="#b8cdcb" stroke="#6a8c8e" strokeWidth="2" />
        {showHint && <image href={imageUrl} x={geometry.boardX} y={geometry.boardY} width={geometry.width} height={geometry.height} opacity="0.16" preserveAspectRatio="none" />}
        {showTargetOutlines && (
          <g transform={`translate(${geometry.boardX} ${geometry.boardY})`} aria-hidden="true">
            {geometry.pieces.map((piece) => (
              <path key={piece.id} d={piece.path} transform={`translate(${piece.col * geometry.cellWidth} ${piece.row * geometry.cellHeight})`} fill="#e7efed" fillOpacity="0.48" stroke="#789496" strokeWidth="1.25" strokeDasharray="5 5" />
            ))}
          </g>
        )}
        {activePieces.map((piece) => {
          const placed = piece.locked;
          const transform = `translate(${geometry.boardX + piece.offsetX} ${geometry.boardY + piece.offsetY}) rotate(${piece.rotation} ${piece.centerX} ${piece.centerY})`;
          return (
            <g
              key={piece.id}
              transform={transform}
              className={`puzzle-piece${placed ? ' is-locked' : ''}${piece.id === selectedId ? ' is-selected' : ''}`}
              role="button"
              tabIndex={placed ? -1 : 0}
              aria-label={`Pieza ${piece.row + 1}, ${piece.col + 1}${piece.rotation ? `, girada ${piece.rotation} grados` : ''}`}
              onPointerDown={(event) => handlePointerDown(event, piece)}
              onFocus={() => onSelect(piece.id)}
              onKeyDown={(event) => handlePieceKeyDown(event, piece)}
              style={{ cursor: placed ? 'default' : 'grab' }}
            >
              <image
                href={imageUrl}
                x="0"
                y="0"
                width={geometry.width}
                height={geometry.height}
                preserveAspectRatio="none"
                clipPath={`url(#${idPrefix}-piece-${piece.id})`}
                pointerEvents="visiblePainted"
              />
              <path d={piece.path} transform={`translate(${piece.col * geometry.cellWidth} ${piece.row * geometry.cellHeight})`} className="piece-outline" fill="none" pointerEvents="none" />
            </g>
          );
        })}
        <text x="32" y={STAGE_HEIGHT - 28} className="stage-caption">Arrastra una pieza y suéltala en el tablero</text>
      </svg>
    </div>
  );
}
