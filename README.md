# Puzlea

Convierte tus imágenes en rompecabezas y juega a tu ritmo. Puzlea está pensada primero para computadora y guarda tus partidas en este dispositivo.

## Qué puedes hacer

- Crear rompecabezas de 24, 48, 96 o 192 piezas con una imagen JPG, PNG o WebP de hasta 20 MB.
- Elegir orientación fija, orientación inicial aleatoria o giro manual durante la partida.
- Consultar la imagen original, jugar con o sin cronómetro y continuar después desde tus partidas guardadas.
- Exportar e importar un archivo `.puzlea` que conserva imagen, geometría y avance.
- Descargar un PDF de impresión con líneas de corte y marcas de registro para unir varias hojas.
- Explorar y enviar imágenes a una galería opcional. Las publicaciones quedan privadas hasta una aprobación manual.

## Empezar

Requiere Node.js 22.12 o posterior.

```sh
npm install
npm run dev
```

Para generar una versión estática:

```sh
npm run build
npm run preview
```

## Guardados y privacidad

Las imágenes y partidas privadas se guardan en IndexedDB del navegador. Puedes exportar un archivo `.puzlea` para conservar o mover una partida. El archivo contiene la imagen que elegiste y la geometría exacta de las piezas. Borrar los datos del sitio en el navegador también borra las partidas locales.

Compartir una imagen es opcional. Requiere una cuenta de Supabase y una acción explícita; el envío va a una cola privada y no se muestra hasta aprobarlo una persona moderadora. Sin configurar Supabase, la galería y las cuentas muestran instrucciones de conexión, mientras el juego local sigue funcionando.

## Conectar Supabase (opcional)

1. Crea un proyecto Supabase y copia `.env.example` como `.env.local`.
2. Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` desde la configuración pública del proyecto.
3. Ejecuta la migración `supabase/migrations/202610070001_puzlea_gallery.sql` en SQL Editor.
4. Reinicia `npm run dev`.

La clave publishable puede usarse en el navegador porque las políticas RLS son la barrera de acceso. **Nunca** pongas la clave `service_role` en `.env`, en el código o en el navegador. El bucket `gallery-images` es privado; una imagen solo puede leerse cuando su envío propio o aprobado autoriza el acceso.

Para revisar publicaciones, asigna el rol `puzlea_moderator` en el `app_metadata` de una cuenta mediante un entorno administrativo de confianza. No uses `user_metadata`, porque el usuario puede cambiarlo. La persona moderadora revisa las filas `pending` en Supabase y cambia su estado a `approved` o `rejected`; en ambos casos debe registrar `reviewed_at` y, cuando esté disponible, `reviewed_by`. No se aprueba contenido automáticamente.

Los remitentes ven el estado de sus propios envíos. La galería solo muestra filas `approved`. Las imágenes rechazadas se conservan privadas para que una persona administradora pueda eliminarlas desde Storage después de la revisión.

Antes de aceptar envíos, configura en Supabase Auth el proveedor, los dominios de retorno y la protección antiabuso apropiada para tu instalación. El proyecto no se despliega desde este repositorio.

## Privacidad y límites

Las imágenes privadas y los guardados permanecen en IndexedDB del navegador hasta que la persona los borra o envía una copia a la galería. Los archivos `.puzlea` incluyen la imagen para que puedan trasladarse a otro dispositivo; guárdalos como cualquier archivo personal. La revisión de contenido de la galería es manual y depende del proceso de moderación que configure el proyecto.
