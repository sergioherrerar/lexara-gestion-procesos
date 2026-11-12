# Lexara al Día — www.lexaraabogados.com/lexara-al-dia

Página que reúne las **últimas 10 publicaciones** de MD Abogados: reels, videos, podcast (Café Laboral), noticias y publicaciones de redes sociales, con enlace directo a cada una. Cuando sale una nueva, **la más antigua se retira**.

## Estructura

```
lexara-al-dia/
├── index.html                 Página (encabezado, destacada, filtros y tarjetas)
├── actualizar.php             Actualización automática (solo la ejecuta el cron del servidor)
├── config.example.php         Plantilla de claves (copiar como config.php en el servidor)
├── assets/
│   ├── css/estilos.css · js/app.js
│   └── img/ (logos y miniaturas/)
├── data/
│   ├── sitio.json             Nombre, redes, fuentes y «maximo» de publicaciones (10)
│   └── publicaciones.json     El contenido que se muestra
├── herramientas/agregar.cjs   Agregar una publicación desde su enlace (TikTok, Facebook, LinkedIn…)
└── privado/                   Clave renovada y registro de la actualización (nunca público)
```

## Actualización automática (todos los días, 6:00 a. m.)

`actualizar.php` revisa estas fuentes y deja las **10 publicaciones más recientes de todas las redes juntas** (el número está en `data/sitio.json` → `"maximo"`):

| Fuente | Qué lee | Qué necesita |
|---|---|---|
| **YouTube** (canal Café Laboral) | Videos y shorts | Nada (RSS abierto) |
| **Spotify** (podcast Café Laboral) | Episodio más reciente | Nada. Con claves gratis de Spotify lee los últimos episodios |
| **Instagram** (@lexaraabogados) | Reels y publicaciones | Clave de Instagram (API oficial de Meta) |
| **TikTok / Facebook / LinkedIn** | No se leen solos | Se agregan con `herramientas/agregar.cjs` o pasando el enlace |

**Reglas**
- La misma pieza publicada en varias redes se muestra **una sola vez**, con «También en YouTube» (por ejemplo, un reel que está en Instagram y en YouTube).
- Lo que usted edite a mano en `data/publicaciones.json` no se pisa.
- La más reciente (video, reel o podcast) queda destacada; para fijar una a mano, agregue `"destacadaFija": true`.
- Al retirar una publicación se borra su miniatura. Las publicaciones agregadas a mano también cuentan para el máximo, según su fecha.
- Si una fuente falla (por ejemplo, Instagram), las demás se actualizan igual y se anota en `privado/actualizacion.log`.

### Instalación (una sola vez)

1. **Subir** el contenido de esta carpeta a `public_html/lexara-al-dia/`.
2. **Claves** (solo las que quiera usar): copie `config.example.php` como `config.php` y pegue:
   - **Instagram:** developers.facebook.com → su app → Instagram → *Generate token* (dura 60 días; el programa la renueva sola).
   - **Spotify (opcional):** developer.spotify.com/dashboard → *Create app* → copie *Client ID* y *Client secret*.
3. **Programar la tarea:** cPanel → *Trabajos de Cron* → Minuto `0`, Hora `6`, Día `*`, Mes `*`, Día de la semana `*` (todos los días; si no hay nada nuevo, no cambia nada):
   `/usr/local/bin/php /home/lexaraab/public_html/lexara-al-dia/actualizar.php`
4. **Probar:** programe la tarea para dentro de 2 minutos y revise `privado/actualizacion.log` (debe decir «Listo» o «Sin cambios»).

## Agregar una publicación a mano (TikTok, Facebook, LinkedIn…)

```bash
node lexara-al-dia/herramientas/agregar.cjs "<enlace>" ["<tipo>"] ["<título>"] ["<descripción>"] ["<AAAA-MM-DD>"] ["<etiquetas>"]
```

- La red social se detecta sola. El tipo se deduce en TikTok y shorts (`reel`), episodios de Spotify (`podcast`) y videos de YouTube (`video`).
- **TikTok** no entrega título ni portada: escriba el título; el video se reproduce dentro de la página. Si quiere miniatura, guarde la imagen en `assets/img/miniaturas/` y escriba su ruta en el campo `miniatura`.
- Ejemplo: `node lexara-al-dia/herramientas/agregar.cjs "https://www.tiktok.com/@usuario/video/123…" reel "Qué es una tutela" "Explicación en 30 segundos." 2026-11-12`

## Campos de cada publicación (`data/publicaciones.json`)

`tipo` (`video`, `reel`, `podcast`, `noticia`, `publicacion`) · `titulo` · `descripcion` · `fecha` (AAAA-MM-DD) · `red` (`instagram`, `facebook`, `tiktok`, `spotify`, `youtube`, `linkedin`, `x`, `web`) · `url` (https://…) · `miniatura` (ruta) · `destacada` · `etiquetas` · `tambien` (otras redes de la misma pieza).

Los videos de YouTube, los episodios de Spotify y los videos de TikTok se reproducen dentro de la página; el resto abre la publicación en su red.
