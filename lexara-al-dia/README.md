# Lexara al Día — www.lexaraabogados.com/lexara-al-dia

Página para reunir las **noticias, videos, reels y publicaciones** de MD Abogados (las que graba y publica la empresa de comunicaciones en redes sociales) en un solo lugar, con enlace directo a cada publicación en su red.

## Estructura

```
lexara-al-dia/
├── index.html                 Página (encabezado, destacada, filtros y tarjetas)
├── assets/
│   ├── css/estilos.css        Diseño (tema claro, paleta de Lexara)
│   ├── js/app.js              Lógica: filtros por tipo, red social, búsqueda y orden
│   └── img/
│       ├── logo.png · logo-blanco.png
│       └── miniaturas/        Imágenes de portada de cada publicación
├── data/
│   ├── sitio.json             Nombre de la sección, lema, enlaces a las redes de Lexara
│   └── publicaciones.json     El contenido: una entrada por publicación
└── herramientas/
    └── agregar.cjs            Agrega una publicación desde su enlace (opcional)
```

## Agregar una publicación

**Opción A — con el comando** (detecta la red social por el enlace):

```bash
node lexara-al-dia/herramientas/agregar.cjs "https://www.instagram.com/reel/XXXX/" "reel" "Qué es una tutela" "Explicación en 30 segundos." "2026-11-12" "Derecho en salud,Tutelas"
```

**Opción B — a mano**, editando `data/publicaciones.json`:

| Campo | Qué es |
|---|---|
| `tipo` | `video`, `reel`, `noticia` o `publicacion` |
| `titulo` · `descripcion` | Texto de la tarjeta (la descripción es opcional) |
| `fecha` | `AAAA-MM-DD` |
| `red` | `instagram`, `facebook`, `tiktok`, `youtube`, `linkedin`, `x` o `web` |
| `url` | Enlace a la publicación original (debe empezar por `https://`) |
| `miniatura` | Ruta de la imagen, p. ej. `assets/img/miniaturas/tutela.jpg`. En YouTube se toma sola |
| `destacada` | `true` para mostrarla grande arriba (se muestra la más reciente marcada) |
| `etiquetas` | Temas, p. ej. `["Derecho en salud"]` |
| `ejemplo` | `true` solo en los datos de muestra; quítelo en las reales |

Los **videos de YouTube** se reproducen dentro de la página; los demás abren la publicación en su red social.

## Publicar

Sube la carpeta `lexara-al-dia/` al servidor (cPanel → `public_html/lexara-al-dia/`) y enlázala desde el menú de www.lexaraabogados.com. La página es estática: no necesita base de datos ni contraseñas.

## Actualización automática (todos los lunes, 6:00 a. m.)

El archivo `actualizar.php` lee las últimas publicaciones de Instagram (@lexaraabogados) con la **API oficial de Meta**, baja su miniatura y las agrega a `data/publicaciones.json`. No toca lo que usted ya editó o agregó a mano, y deja destacada la más reciente. Solo funciona desde el servidor (cron), nunca desde el navegador.

**Instalación (una sola vez)**

1. **Clave de Instagram:** developers.facebook.com → *My Apps* → crear app (tipo *Business*) → producto **Instagram** → *API setup with Instagram login* → agregar la cuenta `@lexaraabogados` (debe ser profesional) → **Generate token**. Dura 60 días y el programa la **renueva sola**.
2. **config.php:** en el servidor, copie `config.example.php` como `config.php` y pegue la clave en `instagram_token`.
3. **Programar la tarea:** cPanel → *Trabajos de Cron* → agregar:
   - Minuto `0` · Hora `6` · Día `*` · Mes `*` · Día de la semana `1` (lunes)
   - Comando: `/usr/local/bin/php /home/lexaraab/public_html/lexara-al-dia/actualizar.php`
4. **Probar:** programe una vez la tarea para dentro de 2 minutos y revise `privado/actualizacion.log`: debe decir «Listo» o «Sin publicaciones nuevas».

**Qué hace con cada publicación:** título = primera línea de la descripción; resumen = el resto sin hashtags; etiquetas = primeros hashtags; tipo = `reel` / `video` / `publicacion`. Si quiere mejorar un título o un resumen, edítelo en `data/publicaciones.json`: la próxima actualización no lo cambia.

**Fijar una destacada a mano:** agregue `"destacadaFija": true` a esa entrada y el programa no la reemplaza.

**Facebook y LinkedIn** no se leen automáticamente; se agregan con `herramientas/agregar.cjs` o editando el JSON.
