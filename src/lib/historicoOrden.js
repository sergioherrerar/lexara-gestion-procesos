// Histórico del proceso en orden de fechas y Estado / Fecha último estado sacados de él (2026-11-28, pedido del usuario):
//  · el Histórico queda de la actuación más ANTIGUA arriba a la más NUEVA abajo (los renglones sin fecha se quedan pegados al renglón con fecha que tienen encima);
//  · Estado = los 3 últimos renglones por fecha (los más cercanos a hoy) y Fecha último estado = la fecha del más reciente.
// Funciones puras, sin red ni DOM.
const RE_FECHA = /^\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/;
const RE_MARCA = /Actualizado desde la Rama Judicial/i;

function textoDe(html){
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
function isoDe(texto){
  const m = RE_FECHA.exec(texto);
  if(!m) return '';
  const d = Number(m[1]), mes = Number(m[2]);
  if(mes < 1 || mes > 12 || d < 1 || d > 31) return '';
  return `${m[3]}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Parte el Histórico (HTML o texto) en renglones: [{ html, texto }] (sin los vacíos). */
export function renglonesDelHistorico(historico){
  const crudo = String(historico || '');
  if(!crudo.trim()) return [];
  let partes;
  if(/<[a-z!/]/i.test(crudo)){
    partes = crudo.replace(/\r?\n/g, ' ')
      .replace(/<br\s*\/?>/gi, '\u0001')
      .replace(/<\/(div|p|li)\s*>/gi, '\u0001')
      .replace(/<(div|p|li|ul|ol)(\s[^>]*)?>/gi, '')
      .replace(/<\/(ul|ol)\s*>/gi, '')
      .split('\u0001');
  }else{
    partes = crudo.split(/\r?\n/).map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  }
  return partes.map(h => ({ html: h.trim(), texto: textoDe(h) })).filter(r => r.texto || /<img/i.test(r.html));
}

// Agrupa: cada renglón con fecha abre un grupo; los que no tienen fecha se suman al grupo anterior.
function gruposDe(historico){
  const grupos = [];
  renglonesDelHistorico(historico).forEach(r => {
    const iso = isoDe(r.texto);
    if(iso || !grupos.length) grupos.push({ iso, renglones: [r] });
    else grupos[grupos.length - 1].renglones.push(r);
  });
  return grupos;
}

/** Histórico ordenado por fecha: la más antigua arriba y la más nueva abajo (a igual fecha se respeta el orden en que estaban). → { html, cambio } */
export function ordenarHistorico(historico){
  const grupos = gruposDe(historico);
  const ordenados = grupos.map((g, i) => ({ g, i })).sort((a, b) => {
    // un primer grupo sin fecha (texto suelto al inicio) se queda arriba
    if(!a.g.iso && !b.g.iso) return a.i - b.i;
    if(!a.g.iso) return a.i === 0 ? -1 : 1;
    if(!b.g.iso) return b.i === 0 ? 1 : -1;
    return a.g.iso < b.g.iso ? -1 : a.g.iso > b.g.iso ? 1 : a.i - b.i;
  }).map(x => x.g);
  const cambio = ordenados.some((g, i) => g !== grupos[i]);
  const html = ordenados.map(g => g.renglones.map(r => `<div>${r.html}</div>`).join('')).join('');
  return { html, cambio };
}

/**
 * Estado y Fecha último estado a partir del Histórico: los 3 renglones con fecha más cercanos a hoy (sin pasarse de hoy ni contar la marca
 * «Actualizado desde la Rama Judicial»), del más antiguo al más reciente, uno por línea; la fecha es la del más reciente.
 * → { estado: 'texto', fecha: 'AAAA-MM-DD', lineas: n } o null si el Histórico no tiene renglones con fecha.
 */
export function estadoDesdeHistorico(historico, hoyISO, cuantas = 3){
  const hoy = hoyISO || new Date().toISOString().slice(0, 10);
  const grupos = gruposDe(historico)
    .filter(g => g.iso && g.iso <= hoy && !RE_MARCA.test(g.renglones[0].texto))
    .map((g, i) => ({ ...g, i }))
    .sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : a.i - b.i));
  if(!grupos.length) return null;
  const ultimos = grupos.slice(-cuantas);
  return {
    estado: ultimos.map(g => g.renglones.map(r => r.texto).join(' ')).join('\n'),
    fecha: ultimos[ultimos.length - 1].iso,
    lineas: ultimos.length,
  };
}
