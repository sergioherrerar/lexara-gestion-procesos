# Actualizar el informe de redes («actualiza redes»)

El informe de **Informes → Redes sociales** y **Lexara al Día** se alimentan de archivos de datos, no de una conexión en vivo: Bustral, Instagram, TikTok y Facebook piden iniciar sesión y no tienen API que el portal pueda usar. Por eso, cuando se pide «actualiza redes», Claude lee las redes con el navegador del usuario (solo lectura, con la sesión que el usuario ya tiene abierta) y deja los archivos al día.

## Qué se lee y dónde queda

| Archivo | Contenido | Fuente |
|---|---|---|
| `public/data/redes-publicaciones.json` | Cada publicación en cada red: título, fecha, enlace, vistas, me gusta, comentarios | YouTube (lista abierta del canal: vistas y me gusta), Instagram (página pública del reel: me gusta y comentarios), TikTok (perfil: vistas) |
| `public/data/redes-sociales.json` → `programadas` | El calendario de Bustral (pieza, fecha programada, estado, motivo de objeción) | Bustral → Redes Sociales (hay que leer también el mes siguiente) |
| `public/data/redes-sociales.json` → `seguidores`, `metricas30d` | Seguidores y métricas de 30 días | Bustral → Analytics y las páginas públicas de cada red |
| `lexara-al-dia/data/publicaciones.json` | Tarjetas de Lexara al Día (las lee solo el cron de las 6 a. m. y lo que se agregue a mano) | YouTube, Instagram (con clave), Spotify |

`data/` (en la raíz) es una copia de `public/data/`: la app se publica desde ahí. La herramienta escribe las dos.

## Pasos

1. Leer las redes y Bustral y actualizar `redes-publicaciones.json` y `programadas`.
2. **Vincular cada pieza programada que ya salió**: en su entrada de `programadas` poner `"piezaUrl"` con el enlace de su publicación en cualquier red (por ejemplo, el reel de Instagram). El vínculo es explícito porque Bustral y las redes nombran distinto la misma pieza («4 empleados directos y 168 temporales» en Bustral, «4 trabajadores directos y 168 en misión» en las redes).
3. Correr la herramienta:
   - `node herramientas/redes/sincronizar-redes.cjs` → muestra qué cambiaría.
   - `node herramientas/redes/sincronizar-redes.cjs --escribir` → guarda los cambios.
4. Revisar el aviso final de la herramienta: lista las programadas ya vencidas que no tienen enlace (¿salieron o no?).
5. Compilar y publicar como siempre («git»).

## Qué hace la herramienta

- **Fechas en hora de Colombia:** el código del reel de Instagram y el id del video de TikTok guardan el instante de publicación en UTC; las publicadas de noche en Colombia aparecían con un día de más. Se recalculan desde el enlace. YouTube entrega la fecha en UTC y no se modifica (una pieza de noche aparece en YouTube con un día más que en Instagram/TikTok, nunca con uno menos; así se unen).
- **Piezas publicadas** (`publicadas`): une la misma pieza entre YouTube, Instagram y TikTok y junta sus vistas, me gusta, comentarios, enlaces y hora. Conserva lo anotado a mano de entradas anteriores (título de Bustral, texto, Facebook, Spotify).
- **`publicadaComo` de cada programada:** sale del `piezaUrl`.
- Es **repetible**: correrla dos veces seguidas no cambia nada la segunda.

## Límites conocidos

- **Facebook y LinkedIn** no se pueden leer sin sesión: sus publicaciones solo están si se anotaron a mano.
- **Instagram** no muestra vistas por reel y los reels más nuevos no muestran el conteo de me gusta; **TikTok** no muestra me gusta ni comentarios sin sesión.
- Las **fechas de YouTube** salen en UTC (ver arriba).
