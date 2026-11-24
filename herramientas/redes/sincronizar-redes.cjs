// Sincroniza el informe de redes con lo que de verdad hay publicado (se corre cada vez que se pide «actualiza redes», después de leer las redes y Bustral).
//   node herramientas/redes/sincronizar-redes.cjs            → solo muestra qué cambiaría
//   node herramientas/redes/sincronizar-redes.cjs --escribir → guarda los cambios en public/data y data
// Entradas: public/data/redes-publicaciones.json (cada publicación en cada red: YouTube, Instagram, TikTok) y public/data/redes-sociales.json (calendario de Bustral en «programadas»).
// Hace tres cosas (ver LEEME.md):
//  1) Fechas de Instagram/TikTok en hora de Colombia, sacadas del propio enlace (el código del reel y el id del video guardan el instante de publicación en UTC; las que salen de noche
//     en Colombia aparecían un día adelantadas).
//  2) «publicadas»: las piezas publicadas, unidas por pieza entre redes (misma pieza en Instagram + YouTube + TikTok), con vistas, me gusta, comentarios, enlaces y hora.
//  3) «publicadaComo» de cada pieza programada: la fecha en que salió. El vínculo es EXPLÍCITO: la programada lleva «piezaUrl» (enlace de su publicación en cualquier red) y de ahí salen
//     la fecha y las estadísticas; no se adivina por el título porque Bustral y las redes nombran distinto la misma pieza.
// Es repetible: correrlo dos veces seguidas no cambia nada la segunda vez.
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '..', '..') + path.sep;
const ESCRIBIR = process.argv.includes('--escribir');
const rutaFlat = raiz + 'public/data/redes-publicaciones.json';
const rutaPrincipal = raiz + 'public/data/redes-sociales.json';
const flat = JSON.parse(fs.readFileSync(rutaFlat, 'utf8'));
const principal = JSON.parse(fs.readFileSync(rutaPrincipal, 'utf8'));
const posts = flat.publicaciones;
const HOY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(new Date());

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const msIg = sc => { let id = 0n; for(const ch of sc) id = id * 64n + BigInt(A.indexOf(ch)); return Number((id >> 23n) + 1314220021721n); };
const msTt = id => Number(BigInt(id) >> 32n) * 1000;
const fmtFecha = ms => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const fmtHora = ms => { const p = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(ms)); const g = t => (p.find(x => x.type === t) || {}).value || ''; const ap = g('dayPeriod').toLowerCase().replace(/[.\s]/g, ''); return g('hour') + ':' + g('minute') + ' ' + (ap.startsWith('p') ? 'p. m.' : 'a. m.'); };
const clave = u => { u = String(u || ''); let m;
  if((m = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(u))) return 'yt:' + m[1];
  if((m = /instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p)\/([\w-]+)/.exec(u))) return 'ig:' + m[1];
  if((m = /tiktok\.com\/.*\/video\/(\d+)/.exec(u))) return 'tt:' + m[1];
  if((m = /open\.spotify\.com\/(?:intl-[a-z]+\/)?episode\/(\w+)/.exec(u))) return 'sp:' + m[1];
  return u; };
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ');
const palabras = s => new Set(norm(s).split(/\s+/).filter(w => w.length >= 4));
const jac = (a, b) => { const X = palabras(a), Y = palabras(b); let i = 0; X.forEach(w => { if(Y.has(w)) i++; }); const u = X.size + Y.size - i; return u ? i / u : 0; };
const dias = (a, b) => Math.abs(Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000));
const firmado = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

// 1) Fechas locales (y hora) de Instagram y TikTok
posts.forEach(p => {
  const k = clave(p.url); let ms = null;
  if(k.startsWith('ig:')) ms = msIg(k.slice(3)); else if(k.startsWith('tt:')) ms = msTt(k.slice(3));
  if(ms != null){ p._ms = ms; p.fecha = fmtFecha(ms); }
});

// 2) Agrupar por pieza. YouTube trae la fecha en UTC: una pieza publicada de noche en Colombia aparece allí con 1 día MÁS que en Instagram/TikTok, nunca con 1 menos.
const parOk = (base, c) => {
  if(base.red === 'youtube') { const d = firmado(c.fecha, base.fecha); return d === 0 || d === 1; }
  if(c.red === 'youtube') { const d = firmado(base.fecha, c.fecha); return d === 0 || d === 1; }
  return dias(base.fecha, c.fecha) <= 1;
};
const usadas = new Set(); const grupos = [];
['instagram', 'youtube', 'tiktok'].forEach(redBase => {
  posts.filter(p => p.red === redBase && !usadas.has(p.url)).forEach(base => {
    usadas.add(base.url); const g = [base];
    ['instagram', 'youtube', 'tiktok'].filter(r => r !== redBase).forEach(r => {
      const libres = posts.filter(p => p.red === r && !usadas.has(p.url));
      const cerca = libres.filter(p => parOk(base, p)).map(p => ({ p, s: jac(p.titulo, base.titulo) + (dias(p.fecha, base.fecha) === 0 ? 0.1 : 0) })).sort((a, b) => b.s - a.s);
      const lejos = libres.filter(p => !parOk(base, p) && jac(p.titulo, base.titulo) >= 0.7 && dias(p.fecha, base.fecha) <= 14).map(p => ({ p, s: jac(p.titulo, base.titulo) })).sort((a, b) => b.s - a.s);
      if(cerca.length && (cerca[0].s >= 0.3 || cerca.length === 1)) { usadas.add(cerca[0].p.url); g.push(cerca[0].p); }
      else if(lejos.length) { usadas.add(lejos[0].p.url); g.push(lejos[0].p); }
    });
    grupos.push(g);
  });
});
grupos.forEach(g => {
  const locales = g.filter(p => p._ms != null);
  const fecha = locales.length ? locales.map(p => p.fecha).sort()[0] : g.map(p => p.fecha).sort()[0];
  g._fecha = fecha;
  // (la fecha de cada publicación de YouTube NO se toca: queda como la entrega YouTube, en UTC; solo la pieza lleva la fecha local)
  const primera = locales.slice().sort((a, b) => a._ms - b._ms)[0];
  g._hora = primera ? fmtHora(primera._ms) : null;
});

// 3) «publicadas»: se reutiliza la entrada vieja de la misma pieza (conserva título, texto y hora) y se agregan las nuevas
const existentes = principal.publicadas;
const usadasEx = new Set();
const piezas = grupos.map(g => {
  const claves = new Set(g.map(p => clave(p.url)));
  let e = existentes.find((x, i) => !usadasEx.has(i) && Object.values(x.urls || {}).some(u => claves.has(clave(u))));
  if(!e) e = existentes.find((x, i) => !usadasEx.has(i) && dias(x.fecha, g._fecha) <= 3 && jac(x.titulo, g[0].titulo) >= 0.2);
  if(e) usadasEx.add(existentes.indexOf(e));
  const vistas = {}, urls = {}, reacciones = {};
  g.forEach(p => {
    urls[p.red] = p.url;
    if(p.vistas != null) vistas[p.red] = p.vistas;
    const r = {}; if(p.meGusta != null) r.meGusta = p.meGusta; if(p.comentarios != null) r.comentarios = p.comentarios;
    if(Object.keys(r).length) reacciones[p.red] = r;
  });
  // Facebook, Spotify y LinkedIn no se leen solos: se conservan de la entrada vieja si ya estaban anotados
  const redes = [...new Set([...g.map(p => p.red), ...((e && e.redes) || []).filter(r => ['facebook', 'spotify', 'linkedin'].includes(r))])];
  const urlsExtra = e && e.urls ? Object.fromEntries(Object.entries(e.urls).filter(([r]) => ['spotify', 'linkedin', 'facebook'].includes(r))) : {};
  const pieza = { fecha: g._fecha, redes, titulo: (e && e.titulo) || g[0].titulo, copy: (e && e.copy) || '', vistas, urls: { ...urlsExtra, ...urls } };
  if(Object.keys(reacciones).length) pieza.reacciones = reacciones;
  const hora = (e && e.hora) || g._hora; if(hora) pieza.hora = hora;
  pieza._grupo = g; pieza._previo = e || null;
  return pieza;
});
// Entradas viejas sin pieza real que repiten una pieza ya cubierta con otra fecha (fechas puestas a mano que no eran las reales) se reemplazan; las demás se conservan.
const sobrantes = existentes.filter((x, i) => !usadasEx.has(i));
const eliminar = [], conservar = [];
sobrantes.forEach(x => { const cubierta = piezas.find(p => jac(x.titulo, p.titulo) >= 0.25 && dias(x.fecha, p.fecha) <= 14); (cubierta ? eliminar : conservar).push({ x, cubierta }); });
eliminar.forEach(({ x, cubierta }) => { if(!cubierta._previo){ cubierta.titulo = x.titulo; if(x.copy) cubierta.copy = x.copy; if(x.hora && !cubierta.hora) cubierta.hora = x.hora; } });

// 4) Vínculo explícito programada ↔ pieza: «piezaUrl» (enlace de su publicación en cualquier red) → «publicadaComo» (fecha en que salió)
const cambiosProg = [], sinVinculo = [];
principal.programadas.forEach(pg => {
  if(pg.piezaUrl){
    const k = clave(pg.piezaUrl);
    const pieza = piezas.find(p => p._grupo.some(x => clave(x.url) === k));
    if(!pieza){ sinVinculo.push(pg.titulo.slice(0, 40) + ' (el enlace ' + pg.piezaUrl + ' no está en las publicaciones leídas)'); return; }
    if(pg.publicadaComo !== pieza.fecha){ cambiosProg.push(pg.titulo.slice(0, 10) + ' publicadaComo ' + (pg.publicadaComo || '—') + ' → ' + pieza.fecha); pg.publicadaComo = pieza.fecha; }
  } else if(pg.publicadaEn && pg.publicadaEn.youtube && pg.publicadaComo){
    // Podcast: salió en Spotify el día programado y en YouTube un día después; es la misma pieza.
    const pieza = piezas.find(p => p._grupo.some(x => clave(x.url) === clave(pg.publicadaEn.youtube)));
    if(pieza){ pieza.fecha = pg.publicadaComo; if(pg.publicadaEn.spotify){ if(!pieza.redes.includes('spotify')) pieza.redes.push('spotify'); pieza.urls.spotify = pg.publicadaEn.spotify; } }
  }
});
const programadasSinEnlace = principal.programadas.filter(pg => !pg.piezaUrl && !pg.publicadaEn && pg.fecha <= HOY && !pg.publicadaComo).map(pg => pg.fecha + ' ' + pg.titulo.slice(0, 40));

// ---- informe ----
console.log('Piezas publicadas: antes', existentes.length, '→ ahora', piezas.length + conservar.length);
piezas.forEach(p => {
  const e = p._previo; const marca = !e ? 'NUEVA' : (e.fecha !== p.fecha ? 'FECHA ' + e.fecha + '→' : 'igual');
  console.log(' ', p.fecha, marca.padEnd(17), p.redes.join('+').padEnd(36), (p.hora || '').padEnd(11), p.titulo.slice(0, 44));
});
if(eliminar.length){ console.log('Se reemplazan (repetían una pieza con otra fecha):'); eliminar.forEach(({ x, cubierta }) => console.log('  -', x.fecha, x.titulo.slice(0, 40), '→ ahora', cubierta.fecha)); }
if(conservar.length){ console.log('Se conservan (sin pieza real equivalente):'); conservar.forEach(({ x }) => console.log('  =', x.fecha, x.titulo.slice(0, 40))); }
console.log('Programadas:', cambiosProg.length ? cambiosProg.join(' | ') : 'sin cambios');
if(sinVinculo.length) console.log('AVISO enlaces de «piezaUrl» que no se encuentran:', sinVinculo.join(' | '));
if(programadasSinEnlace.length) console.log('Programadas ya vencidas sin enlace de publicación (¿salieron? agregue su «piezaUrl»):', programadasSinEnlace.join(' | '));

if(ESCRIBIR){
  principal.publicadas = [...piezas.map(p => { const { _grupo, _previo, ...resto } = p; return resto; }), ...conservar.map(c => c.x)].sort((a, b) => a.fecha.localeCompare(b.fecha));
  principal.sincronizado = { fecha: HOY, nota: 'Piezas publicadas recalculadas desde las publicaciones reales de YouTube, Instagram y TikTok (fechas de Instagram y TikTok en hora de Colombia). Herramienta: herramientas/redes/sincronizar-redes.cjs' };
  posts.forEach(p => delete p._ms);
  posts.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.red.localeCompare(b.red));
  for(const r of ['public/data', 'data']){
    fs.writeFileSync(raiz + r + '/redes-sociales.json', JSON.stringify(principal, null, 2) + '\n');
    fs.writeFileSync(raiz + r + '/redes-publicaciones.json', JSON.stringify(flat, null, 2) + '\n');
  }
  console.log('\nESCRITO en public/data y data.');
}
