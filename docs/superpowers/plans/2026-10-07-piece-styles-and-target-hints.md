# Estilos de piezas y pistas de ubicación

## Diseño

- Mantener la paleta, tipografía y controles actuales de Puzlea.
- Añadir un selector compacto con tres estilos: clásico, orgánico y geométrico.
- Mantener la pista de imagen independiente de las siluetas del tablero.
- Mostrar siluetas por defecto en 24 y 48 piezas; ocultarlas en 96 y 192, con un interruptor editable durante el juego.

## Alcance técnico

1. Extender `src/game/geometry.js` para producir bordes compatibles en los tres estilos.
2. Conectar el selector en la creación local y en la galería; persistir el estilo y la preferencia de siluetas en la partida.
3. Actualizar `src/game/PuzzleStage.jsx` para ocultar o mostrar siluetas sin alterar el encaje ni la pista de imagen.
4. Versionar los archivos `.puzlea`; seguir importando las versiones 1 y 2 y aplicarles valores predeterminados seguros.
5. Confirmar que el PDF usa los mismos contornos almacenados en la geometría.

## Archivos previstos

- `src/game/geometry.js`: estilos y generación de bordes.
- `src/game/PuzzleStage.jsx`: visibilidad de las siluetas.
- `src/App.jsx` y `src/styles/base.css`: selectores, ajustes y estado de juego.
- `src/lib/puzzleArchive.js`: persistencia, validación y compatibilidad de importación.
- `docs/superpowers/plans/2026-10-07-piece-styles-and-target-hints.md`: este plan.

## Verificación

- Ejecutar `npm run build` y revisar el diff.
- No agregar ni ejecutar pruebas automatizadas en este cambio.
