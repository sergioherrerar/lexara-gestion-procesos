#!/usr/bin/env node
// Agrega una publicación a data/publicaciones.json a partir de su enlace (sirve sobre todo para TikTok, Facebook y LinkedIn, que no se leen solos).
//
//   node lexara-al-dia/herramientas/agregar.cjs "<enlace>" ["<tipo>"] ["<título>"] ["<descripción>"] ["<AAAA-MM-DD>"] ["<etiqueta1,etiqueta2>"]
//
//   tipo: video | reel | podcast | noticia | publicacion  (si no lo escribe, se deduce: TikTok y Shorts = reel, episodio de Spotify = podcast)
//   La red social se detecta sola por el enlace. En TikTok, Spotify y YouTube, si no escribe el título, se toma solo (con su miniatura).
//   La lista muestra solo las N publicaciones más recientes ("maximo" en data/sitio.json): cada lunes la actualización retira la más antigua por fecha.
const fs = require('fs');
const path = require('path');

const [, , enlace, tipoArg = '', tituloArg = '', descripcion = '', fechaArg = '', etiquetas = ''] = process.argv;
const TIPOS = ['video', 'reel', 'podcast', 'noticia', 'publicacion'];
if(!enlace || !/^https?:\/\//i.test(enlace) || (tipoArg && !TIPOS.includes(tipoArg))){
  console.error('Uso: node lexara-al-dia/herramientas/agregar.cjs "<enlace https://…>" ["<video|reel|podcast|noticia|publicacion>"] ["<título>"] ["<descripción>"] ["<AAAA-MM-DD>"] ["<etiquetas>"]');
  process.exit(1);
}
if(fechaArg && !/^\d{4}-\d{2}-\d{2}$/.test(fechaArg)){ console.error('La fecha debe ser AAAA-MM-DD'); process.exit(1); }

function redDe(url){
  const h = new URL(url).hostname.replace(/^www\./, '');
  if(/instagram\.com$/.test(h)) return 'instagram';
  if(/(facebook\.com|fb\.watch)$/.test(h)) return 'facebook';
  if(/tiktok\.com$/.test(h)) return 'tiktok';
  if(/spotify\.com$/.test(h)) return 'spotify';
  if(/(youtube\.com|youtu\.be)$/.test(h)) return 'youtube';
  if(/linkedin\.com$/.test(h)) return 'linkedin';
  if(/(^|\.)(x|twitter)\.com$/.test(h)) return 'x';
  return 'web';
}
const red = redDe(enlace);
const OEMBED = {
  tiktok: 'https://www.tiktok.com/oembed?url=',
  spotify: 'https://open.spotify.com/oembed?url=',
  youtube: 'https://www.youtube.com/oembed?format=json&url=',
};
function deducirTipo(){
  if(tipoArg) return tipoArg;
  if(red === 'tiktok') return 'reel';
  if(red === 'spotify') return /\/episode\//.test(enlace) ? 'podcast' : 'publicacion';
  if(red === 'youtube') return /\/shorts\//.test(enlace) ? 'reel' : 'video';
  return '';
}

(async () => {
  const tipo = deducirTipo();
  // Las salidas dentro de esta función usan process.exitCode y return (process.exit cierra mal las conexiones abiertas en Windows).
  if(!tipo){ console.error('Indique el tipo (video, reel, podcast, noticia o publicacion): no se puede deducir de este enlace.'); process.exitCode = 1; return; }
  const archivo = path.join(__dirname, '..', 'data', 'publicaciones.json');
  const lista = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  if(lista.some(p => p.url === enlace)){ console.error('Ese enlace ya está en la lista.'); process.exitCode = 1; return; }

  let titulo = tituloArg, miniatura = '';
  if(OEMBED[red]){
    try {
      const r = await fetch(OEMBED[red] + encodeURIComponent(enlace), { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if(r.ok){
        const j = await r.json();
        if(!titulo) titulo = String(j.title || '').replace(/\s+/g, ' ').trim().slice(0, 110) || (j.author_name ? 'Video de ' + j.author_name : '');
        if(j.thumbnail_url){
          const id = (enlace.match(/(?:video\/|episode\/|shorts\/|v=|youtu\.be\/)([\w-]+)/) || [, String(Date.now())])[1];
          const img = await fetch(j.thumbnail_url);
          if(img.ok){
            const carpeta = path.join(__dirname, '..', 'assets', 'img', 'miniaturas'); fs.mkdirSync(carpeta, { recursive: true });
            const nombre = red + '-' + id + '.jpg'; fs.writeFileSync(path.join(carpeta, nombre), Buffer.from(await img.arrayBuffer()));
            miniatura = 'assets/img/miniaturas/' + nombre;
          }
        }
      } else console.error('Aviso: ' + red + ' no entregó los datos de la publicación (' + r.status + ').');
    } catch(e){ console.error('Aviso: no se pudieron leer los datos automáticamente: ' + e.message); }
  }
  if(!titulo){ console.error(red === 'tiktok' ? 'TikTok no entrega el título: escríbalo como tercer dato. Ej.: node lexara-al-dia/herramientas/agregar.cjs "<enlace>" reel "Título del video" "Resumen" 2026-11-11' : 'Escriba el título (no se pudo tomar solo de este enlace).'); process.exitCode = 1; return; }

  const hoy = new Date(); const iso = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
  const fecha = fechaArg || iso;
  const slug = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  lista.unshift({
    id: fecha + '-' + slug, tipo, titulo, descripcion, fecha, red, url: enlace, miniatura, destacada: false,
    etiquetas: etiquetas ? etiquetas.split(',').map(s => s.trim()).filter(Boolean) : [], origen: 'manual',
  });
  fs.writeFileSync(archivo, JSON.stringify(lista, null, 2) + '\n');
  console.log('Agregada: [' + tipo + ' · ' + red + '] ' + titulo + ' (' + fecha + ')' + (miniatura ? ' con miniatura' : ' sin miniatura'));
})();
