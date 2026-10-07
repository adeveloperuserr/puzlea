# Puzlea — diseño de la primera versión

## Objetivo

Puzlea convierte una imagen elegida por la persona en un rompecabezas para computadora. La primera versión ofrece un juego solitario que conserva el estado en el dispositivo, puede exportarse e importarse como archivo autocontenido, imprime una plantilla de corte y permite enviar imágenes a una galería pública únicamente después de una revisión manual.

## Alcance y orden

1. Juego solitario y creación a partir de una imagen.
2. Guardado y reanudación locales, importación/exportación y PDF imprimible.
3. Cuentas y galería moderada opcional.

La app debe funcionar sin Supabase configurado. No se despliega ni publica el sitio como parte de este trabajo. Las partidas privadas y sus imágenes se conservan en el dispositivo; compartir es siempre una acción explícita.

## Experiencia de juego

- La interfaz prioriza escritorio y presenta una bienvenida clara, carga de imagen, controles y tablero dentro de una composición visual cálida y legible.
- Niveles disponibles: 24, 48, 96 y 192 piezas. La cuadrícula mantiene proporciones razonables para la imagen y cada nivel conserva el total solicitado.
- Antes de crear la partida, la persona elige entre tres estilos de pieza: clásico, orgánico y geométrico. Cada par de bordes adyacentes comparte una misma geometría con orientación complementaria. La geometría guardada es la fuente común para el SVG de juego y la plantilla PDF.
- Las siluetas de las posiciones se muestran por defecto en 24 y 48 piezas, y se ocultan en 96 y 192. La persona puede cambiar esta pista durante la partida; la pista de imagen original es independiente.
- Las piezas comienzan mezcladas alrededor del tablero. La imagen original puede consultarse como referencia.
- La rotación puede quedar fija, asignarse aleatoriamente al inicio o permitirse manualmente durante la partida.
- El cronómetro es opcional y su estado forma parte de la partida guardada.
- Arrastrar mantiene la pieza bajo el puntero. Al soltar, solo se fija si ocupa el espacio correcto y su orientación coincide; si no, permanece exactamente donde se soltó.
- Completar una pieza produce una animación breve. No hay puntos ni leaderboard.

## Guardado, exportación e impresión

- IndexedDB guarda imagen, geometría, estilo, nivel, preferencia de siluetas, rotaciones, posiciones, piezas fijadas y cronómetro localmente.
- Un archivo ZIP versionado contiene la imagen original y el estado completo necesario para reconstruir la misma partida. Importar valida estructura, versión, tamaño y referencias antes de sustituir una partida activa.
- El PDF usa las mismas curvas de las piezas, incluye líneas de corte y permite dividir el tablero en páginas alineables para imprimir, unir y recortar.

## Cuentas y galería

- Supabase es una integración opcional para Auth, Storage y Postgres con RLS. El navegador solo recibe URL de proyecto y clave publicable; claves service-role nunca se entregan al cliente.
- El flujo de compartir requiere iniciar sesión y confirmación explícita. Sube una copia a un bucket privado y registra la entrada con estado `pending`.
- Visitantes y usuarios solo pueden leer filas `approved`; sus archivos solo se pueden recuperar cuando la fila correspondiente está aprobada. El propietario puede ver el estado de sus propios envíos.
- No hay vista de moderación pública ni aprobación automática. Una persona administradora revisa y cambia el estado desde Supabase Dashboard con acceso confiable. La cola pendiente no aparece en la galería.
- La galería pública permite abrir un rompecabezas aprobado y escoger nivel y estilo propios; no requiere cuenta.

## Estructura técnica

- React y Vite proporcionan la aplicación web de una sola página.
- Un módulo de geometría genera una sola definición serializable de bordes y rutas SVG según el estilo elegido. La vista del juego representa recortes con SVG; el generador PDF reutiliza esas rutas en las coordenadas del documento.
- El estado de juego se mantiene en un modelo separado de la interfaz para facilitar guardado, exportación e impresión.
- Adaptadores independientes encapsulan IndexedDB, ZIP, PDF y Supabase.
- La interfaz sigue usable sin red para la creación, el juego, el guardado local y la impresión.

## Supuestos de implementación

- El primer PDF se orienta a papel carta, en pulgadas convertidas a puntos, con una cuadrícula de páginas solapadas y marcas de registro.
- La rotación manual usa incrementos de 90 grados con atajos de teclado y un control contextual.
- La validación y carga inicial admiten imágenes PNG, JPEG y WebP, con límite de 20 MB y 40 megapíxeles antes de decodificar para contener uso de memoria.
- El modo aleatorio rota piezas en incrementos de 90 grados; las partidas importadas conservan su estado aunque el modo de rotación no coincida con una nueva partida.
- Sin credenciales Supabase, la galería indica cómo configurar el servicio y el resto de la aplicación funciona normalmente.

## Criterios de aceptación

1. Se puede cargar una imagen propia, elegir un nivel y jugar arrastrando piezas en tablero SVG.
2. Las piezas se fijan únicamente al soltarlas en su posición y rotación correctas; una colocación errónea no se mueve automáticamente.
3. Cada nivel contiene exactamente el número indicado de piezas y comparte bordes complementarios en los tres estilos disponibles.
4. Una partida se puede guardar, reanudar, exportar e importar con su estilo, preferencia de siluetas, posiciones y cronómetro; los archivos de versiones 1 y 2 siguen siendo compatibles.
5. El PDF imprime la misma geometría de corte elegida en el juego e incluye registro para unir páginas.
6. La galería queda deshabilitada con mensajes de configuración claros sin Supabase; con configuración, el envío autenticado queda privado y pendiente hasta aprobación.
7. Solo las imágenes aprobadas son consultables por el público, con políticas RLS y de Storage restrictivas.
8. No se despliega el sitio y no se agregan ni ejecutan pruebas automatizadas.
