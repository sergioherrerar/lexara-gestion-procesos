// Modelo compartido del informe «Redes sociales» (2026-11-12): lo usan la pestaña de Informes, el Excel, el PDF y el correo «Revisión de publicaciones».
// Los datos viven en public/data/redes-sociales.json (lectura de Bustral + páginas públicas de cada red).

export const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
export const RED_NOMBRE = { linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', spotify: 'Spotify' };
export const ESTADO = {
  video_aprobado: { texto: 'Video aprobado', clase: 'badge-verde' },
  guion_aprobado: { texto: 'Guion aprobado', clase: 'badge-verde' },
  video_objetado: { texto: 'Video objetado', clase: 'badge-rojo' },
  por_aprobar: { texto: 'Por aprobar', clase: 'badge-naranja' },
};
export const BUSTRAL_CALENDARIO = 'https://app.bustral.com/dashboard/social';

export const mesDe = f => String(f || '').slice(0, 7);
export function fechaLarga(f){
  if(!f) return '—';
  const [a, m, d] = String(f).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}
export function fechaCorta(f){
  if(!f) return '—';
  const [, m, d] = String(f).split('-').map(Number);
  return `${d} ${MESES[m - 1].slice(0, 3)}`;
}
// «2026-11-04» → «04/11/2026»; con fecha y hora de objeción/aprobación («2026-11-05 14:30») deja también la hora.
export function fechaDMA(f){
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}:\d{2}))?/.exec(String(f || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ' ' + m[4] : ''}` : '';
}
export function diasEntre(a, b){
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}
export function totalVistas(p){
  return Object.values(p.vistas || {}).reduce((s, n) => s + (Number(n) || 0), 0);
}
export function nombreMes(mes){
  const [a, n] = String(mes).split('-').map(Number);
  return `${MESES[n - 1][0].toUpperCase()}${MESES[n - 1].slice(1)} ${a}`;
}
export function mesesDisponibles(datos){
  const s = new Set();
  (datos.publicadas || []).forEach(p => s.add(mesDe(p.fecha)));
  (datos.programadas || []).forEach(p => s.add(mesDe(p.fecha)));
  return [...s].sort();
}

// «Hoy» del calendario: la fecha de la lectura más reciente de los datos (el calendario de Bustral, las publicaciones de las redes o la última sincronización). Con ella se decide si una pieza programada ya
// está vencida sin publicar; antes se usaba solo la fecha de la primera lectura (12-nov) y el calendario quedaba como si el tiempo no hubiera pasado.
export function fechaCalendario(datos){
  return [datos.leido, datos.bustralPanel && datos.bustralPanel.calendarioLeido, datos.publicacionesRedes && datos.publicacionesRedes.leido, datos.sincronizado && datos.sincronizado.fecha].filter(Boolean).sort().pop();
}

// Identificador de una publicación a partir de su enlace (YouTube, Instagram, TikTok): sirve para saber si dos enlaces son la misma publicación.
export function claveEnlace(u){
  const s = String(u || ''); let r;
  if((r = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(s))) return 'yt:' + r[1];
  if((r = /instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p)\/([\w-]+)/.exec(s))) return 'ig:' + r[1];
  if((r = /tiktok\.com\/.*\/video\/(\d+)/.exec(s))) return 'tt:' + r[1];
  return s;
}
// La pieza realmente publicada de una pieza programada: por su enlace exacto («piezaUrl», lo seguro cuando hay varias piezas el mismo día) y, si no lo tiene, por la fecha en que salió («publicadaComo»).
function piezaPublicadaDe(datos, g){
  if(g.piezaUrl){
    const k = claveEnlace(g.piezaUrl);
    const p = datos.publicadas.find(x => Object.values(x.urls || {}).some(u => claveEnlace(u) === k));
    if(p) return p;
  }
  return g.publicadaComo ? datos.publicadas.find(p => p.fecha === g.publicadaComo) || null : null;
}

// Título que tiene en el calendario de Bustral cada publicación real, por su enlace (clave del enlace → título). Bustral y las redes nombran distinto la misma pieza (p. ej. «Reel 1 · Incidente de impacto
// fiscal (Parte 1)…» en Bustral y «Reforma pensional: ¿hay plata para arrancar?» en las redes), así que la tabla de todas las publicaciones los junta para poder buscar por cualquiera de los dos nombres.
export function titulosBustralPorEnlace(datos){
  const mapa = new Map();
  (datos.programadas || []).forEach(g => {
    const p = piezaPublicadaDe(datos, g);
    if(!p) return;
    Object.values(p.urls || {}).forEach(u => { if(u) mapa.set(claveEnlace(u), g.titulo); });
  });
  return mapa;
}

// Todo lo del mes: filas del calendario (programadas cruzadas con lo realmente publicado + publicadas sin programar), indicadores y más/menos vista.
export function calcularVistaMes(datos, mes){
  const hoy = fechaCalendario(datos);
  const publicadasMes = datos.publicadas.filter(p => mesDe(p.fecha) === mes);
  const programadasMes = datos.programadas.filter(p => mesDe(p.fecha) === mes);

  // Cada programada se cruza con su publicación real (misma pieza, a veces otro día).
  const filasProg = programadasMes.map(g => {
    const real = piezaPublicadaDe(datos, g);
    const salioEn = real ? real.fecha : (g.publicadaEn ? g.publicadaComo : null);
    let cumpl;
    if(salioEn){
      const d = diasEntre(g.fecha, salioEn);
      cumpl = d === 0 ? { texto: 'Publicada a tiempo', clase: 'badge-verde' }
        : d > 0 ? { texto: `Publicada con ${d} día${d > 1 ? 's' : ''} de retraso`, clase: 'badge-naranja' }
        : { texto: `Publicada ${-d} día${d < -1 ? 's' : ''} antes`, clase: 'badge-verde' };
    } else if(g.fecha < hoy){
      cumpl = { texto: 'Sin publicar (fecha vencida)', clase: 'badge-rojo' };
    } else if(g.fecha === hoy){
      cumpl = { texto: 'Programada para hoy', clase: 'badge-naranja' };
    } else {
      cumpl = { texto: 'Pendiente', clase: 'badge-gris' };
    }
    return { tipo: 'programada', fecha: g.fecha, titulo: g.titulo, g, real, salioEn, cumpl };
  });
  const vinculadas = new Set(filasProg.filter(f => f.real).map(f => f.real.fecha + '|' + f.real.titulo));
  const filasPub = publicadasMes
    .filter(p => !vinculadas.has(p.fecha + '|' + p.titulo))
    .map(p => ({ tipo: 'publicada', fecha: p.fecha, titulo: p.titulo, p, cumpl: null }));
  const filas = [...filasProg, ...filasPub].sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Piezas realmente publicadas en el mes (sin contarlas dos veces).
  const piezasPublicadas = filasPub.length + filasProg.filter(f => f.salioEn).length;
  const porRed = {};
  publicadasMes.forEach(p => (p.redes || []).forEach(r => { porRed[r] = (porRed[r] || 0) + 1; }));

  const programadas = filasProg.length;
  const cumplidas = filasProg.filter(f => f.salioEn).length;
  const aTiempo = filasProg.filter(f => f.salioEn && diasEntre(f.fecha, f.salioEn) <= 0).length;
  const vencidasSin = filasProg.filter(f => !f.salioEn && f.fecha < hoy).length;
  const aprobadas = filasProg.filter(f => ['video_aprobado', 'guion_aprobado'].includes(f.g.estado)).length;
  const objetadas = filasProg.filter(f => f.g.estado === 'video_objetado').length;

  // Más / menos vista: solo hay vistas públicas de YouTube y TikTok.
  const conVistas = publicadasMes
    .concat(filasProg.filter(f => f.g.vistas && !f.real).map(f => ({ ...f.g, fecha: f.g.publicadaComo || f.g.fecha, redes: ['youtube', 'spotify'] })))
    .map(p => ({ p, v: totalVistas(p) }))
    .filter(x => x.v > 0 || (x.p.vistas && Object.keys(x.p.vistas).length))
    .sort((a, b) => b.v - a.v);
  return {
    filas, piezasPublicadas, porRed, programadas, cumplidas, aTiempo, vencidasSin, aprobadas, objetadas,
    mas: conVistas[0] || null, menos: conVistas.length > 1 ? conVistas[conVistas.length - 1] : null,
    hayProgramacion: programadas > 0,
    pct: programadas ? Math.round(cumplidas / programadas * 100) : null,
  };
}

// Una fila lista para escribir (correo, Excel y PDF): todas las fechas de la pieza en un solo objeto.
// Bustral solo guarda el ESTADO actual de cada video (aprobado / objetado); no registra cuándo se aprobó u objetó. Si alguien lo anota a mano en el JSON
// (`aprobadoEl` / `objetadoEl`, «AAAA-MM-DD» o «AAAA-MM-DD HH:MM») sale en el informe; si no, queda «no lo registra Bustral».
export function novedadesDelMes(datos, mes){
  const vista = calcularVistaMes(datos, mes);
  const filas = vista.filas.map(f => {
    const g = f.tipo === 'programada' ? f.g : null;
    const pub = f.tipo === 'publicada' ? f.p : (f.real || null);
    const redes = f.tipo === 'publicada'
      ? (f.p.redes || [])
      : f.real ? (f.real.redes || [])
      : (g && g.publicadaEn) ? Object.keys(g.publicadaEn) : [];
    const salioEl = f.tipo === 'publicada' ? f.fecha : f.salioEn;
    const vistas = pub ? totalVistas(pub) + (g ? totalVistas(g) : 0) : (g ? totalVistas(g) : 0);
    return {
      titulo: f.titulo,
      programada: g ? g.fecha : null,
      estado: g ? (ESTADO[g.estado]?.texto || g.estado) : 'Publicada sin programación en Bustral',
      estadoClave: g ? g.estado : null,
      objetadoEl: g?.objetadoEl || null,
      aprobadoEl: g?.aprobadoEl || null,
      nota: g?.objecion || null,   // lo que escribió quien objetó la pieza en Bustral
      publicadaEl: salioEl || null,
      hora: (pub && pub.hora) || (g && g.horaPublicada) || null,
      redes: redes.map(r => RED_NOMBRE[r] || r),
      cumplimiento: f.cumpl ? f.cumpl.texto : 'Fuera del calendario',
      claseCumplimiento: f.cumpl ? f.cumpl.clase : 'badge-gris',
      vistas: vistas || null,
    };
  });
  return { vista, filas, noPublicadas: filas.filter(x => x.programada && !x.publicadaEl && x.programada < fechaCalendario(datos)) };
}

// «Seguidores nuevos del mes»: si hay un conteo guardado de hace ~30 días se calcula solo (hoy − entonces); si no, el dato de Bustral o «sin medir».
export function nuevosDe(datos, red, s){
  const hoy = new Date(datos.leido + 'T00:00:00');
  const previos = (datos.historialSeguidores || [])
    .map(h => ({ h, dias: Math.round((hoy - new Date(h.fecha + 'T00:00:00')) / 86400000) }))
    .filter(x => x.dias >= 25 && x.dias <= 40 && x.h[red] != null)
    .sort((a, b) => Math.abs(a.dias - 30) - Math.abs(b.dias - 30));
  if(previos.length && s.actuales != null) return { valor: s.actuales - previos[0].h[red], texto: `Seguidores de hoy menos los que había el ${fechaLarga(previos[0].h.fecha)} (conteo guardado).` };
  if(s.nuevos30d != null) return { valor: s.nuevos30d, texto: red === 'facebook' ? 'Los que se sumaron menos los que dejaron de seguirte en 30 días (dato de Bustral).' : 'Suscriptores ganados en los últimos 30 días (dato de Bustral).' };
  return { valor: null, texto: 'Aún no se puede medir: el conteo de hoy queda guardado y el próximo mes se calcula solo.' };
}
export const REDES_ORDEN = ['facebook', 'instagram', 'tiktok', 'youtube', 'spotify', 'linkedin'];

// Estadísticas por publicación (2026-11-23): de la más reciente a la más antigua, con vistas, me gusta y comentarios por red donde la red los entrega.
export function estadisticasPorPublicacion(datos){
  const suma = arr => arr.reduce((s, [, n]) => s + (Number(n) || 0), 0);
  return (datos.publicadas || []).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).map(p => {
    const vistas = Object.entries(p.vistas || {}).filter(([, n]) => n != null);
    const reac = Object.entries(p.reacciones || {}).filter(([, r]) => r);
    const meGusta = reac.filter(([, r]) => r.meGusta != null).map(([red, r]) => [red, r.meGusta]);
    const comentarios = reac.filter(([, r]) => r.comentarios != null).map(([red, r]) => [red, r.comentarios]);
    return { p, titulo: p.titulo, fecha: p.fecha, redes: p.redes || [], vistas, totalVistas: suma(vistas), meGusta, totalMeGusta: suma(meGusta), comentarios, totalComentarios: suma(comentarios) };
  });
}
