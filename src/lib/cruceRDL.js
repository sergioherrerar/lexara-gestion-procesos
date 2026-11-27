// Reglas del cruce con RDL (2026-11-28, aclaraciones del usuario) para que NO salgan como «novedades» cosas que no lo son:
//   1. Si el apoderado de un proceso de RDL es DANIEL (Daniel Flechas), es un proceso al que Lexara le hace seguimiento pero FUERA del portal: se tiene en cuenta (se muestra aparte) y no se marca como novedad.
//   2. Procesos que RDL trae con otro radicado o con datos distintos se CRUZAN por otros datos (número corto y partes) para saber si son el MISMO proceso: si lo son, no se marcan como «no están en el portal»;
//      la diferencia (radicado, despacho) queda como una lista aparte para corregirla nosotros o pedirle a RDL que la corrija.
//   3. Procesos de Supersociedades (103 SUPERSOCIEDADES 76534 y 39696) se dejan por fuera de las novedades.
// Funciones puras, sin red.
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const soloDigitos = s => String(s || '').replace(/\D/g, '');

/** Procesos que RDL trae y que se dejan por fuera de las novedades (se reconocen por el número que trae RDL). */
export const RDL_IGNORAR = [
  { despacho: '103 SUPERSOCIEDADES', radicado: '76534' },
  { despacho: '103 SUPERSOCIEDADES', radicado: '39696' },
];
/** ¿Esta fila (de un informe diario o del Excel mensual) está en la lista de ignorados? fila: { radicado, despacho? } */
export function esIgnoradoRDL(fila){
  const rad = soloDigitos(fila && fila.radicado);
  if(!rad) return false;
  return RDL_IGNORAR.some(x => soloDigitos(x.radicado) === rad);
}
/** Proceso al que Lexara le hace seguimiento fuera del portal: el apoderado que trae RDL es Daniel. */
export function esSeguimientoFueraDelPortal(apoderado){ return /\bdaniel\b/.test(norm(apoderado)); }

/** Número corto «AAAA-NNNNN» de un radicado de 23 dígitos (o de 21), o '' si no se puede. */
export function numeroCortoDe(radicado){
  const d = soloDigitos(radicado);
  return d.length >= 21 ? d.slice(12, 16) + '-' + d.slice(16, 21) : '';
}
const normalizarCorto = c => String(c || '').trim().replace(/[‐-―−]/g, '-').replace(/\s+/g, '');

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'sa', 's', 'a', 'sas', 'ltda', 'en', 'eps', 'ips']);
function tokens(s){ return new Set(norm(s).split(' ').filter(w => w.length > 2 && !PALABRAS_VACIAS.has(w))); }
/** Parecido entre dos nombres (0 a 1): palabras en común sobre las del más corto. */
export function similitudNombres(a, b){
  const A = tokens(a), B = tokens(b);
  if(!A.size || !B.size) return 0;
  let comunes = 0; A.forEach(w => { if(B.has(w)) comunes++; });
  return comunes / Math.min(A.size, B.size);
}

/**
 * ¿Esta fila de RDL es el MISMO proceso que alguno del portal aunque el radicado no coincida? Se cruza por el número corto y por las partes.
 * fila: { radicado, consecutivo?, demandante?, demandado?, despacho? }; procesos: los del portal.
 * → null si no hay coincidencia; si la hay: { proceso, diferencias: [{ campo, rdl, portal }], parteIgual }
 */
export function cruzarConPortal(fila, procesos){
  const cortos = new Set([normalizarCorto(numeroCortoDe(fila.radicado)), normalizarCorto(fila.consecutivo)].filter(Boolean));
  if(!cortos.size) return null;
  const candidatos = (procesos || []).filter(p => cortos.has(normalizarCorto(p.Radicado)));
  if(!candidatos.length) return null;
  const puntuado = candidatos.map(p => {
    const sD = similitudNombres(fila.demandante, p.Demandante), sd = similitudNombres(fila.demandado, p.Demandado);
    const sC = Math.max(similitudNombres(fila.demandante, p.Cliente), similitudNombres(fila.demandado, p.Cliente));
    return { p, puntos: Math.max(sD, sd, sC), sD, sd };
  }).sort((a, b) => b.puntos - a.puntos);
  const mejor = puntuado[0];
  if(mejor.puntos < 0.5) return null;   // mismo número corto pero partes distintas: casi seguro otro proceso (otro despacho)
  const p = mejor.p;
  const diferencias = [];
  const radRDL = soloDigitos(fila.radicado), radPortal = soloDigitos(String(p.NoCompleto || '').split(/\s+/)[0]);
  const todosPortal = [p.NoCompleto, p.HistoricoNumerosCompletos].join(' ').split(/\s+/).map(soloDigitos).filter(d => d.length >= 21);
  if(radRDL.length >= 21 && todosPortal.length && !todosPortal.some(d => d.slice(0, 21) === radRDL.slice(0, 21))){
    diferencias.push({ campo: radRDL.slice(0, 12) !== radPortal.slice(0, 12) ? 'Radicado (despacho distinto)' : 'Radicado', rdl: fila.radicado, portal: p.NoCompleto || '—' });
  }
  return { proceso: p, diferencias, parteIgual: mejor.puntos >= 0.8 };
}

/**
 * Afina el resultado de compararConProcesos (Excel mensual de RDL contra el portal) con las reglas de arriba:
 *  · las filas ignoradas (Supersociedades) salen de las novedades;
 *  · las de apoderado Daniel pasan a «fuera del portal» (se tienen en cuenta, no son novedad);
 *  · las que son el mismo proceso con otro radicado se mueven a «diferencias» (y ese proceso del portal deja de figurar como «vigente que RDL no incluyó»).
 * → { ...revision, noEncontrados, faltantesEnArchivo, fueraDelPortal: [fila], diferencias: [{ origen, fila, proceso, diferencias[] }], ignorados: n }
 */
export function refinarRevision(revision, procesos){
  const noEncontrados = [], fueraDelPortal = [], diferencias = [];
  const cubiertos = new Set();
  let ignorados = 0;
  (revision.noEncontrados || []).forEach(f => {
    if(esIgnoradoRDL(f)){ ignorados++; return; }
    if(esSeguimientoFueraDelPortal(f.apoderado)){ fueraDelPortal.push({ ...f, origen: 'Excel mensual' }); return; }
    const x = cruzarConPortal(f, procesos);
    if(x){ cubiertos.add(normalizarCorto(x.proceso.Radicado)); diferencias.push({ origen: 'Excel mensual', fila: f, proceso: x.proceso, diferencias: x.diferencias, parteIgual: x.parteIgual }); return; }
    noEncontrados.push(f);
  });
  const faltantesEnArchivo = (revision.faltantesEnArchivo || []).filter(f => !cubiertos.has(normalizarCorto(f.consecutivo)));
  return { ...revision, noEncontrados, faltantesEnArchivo, fueraDelPortal, diferencias, ignorados };
}
