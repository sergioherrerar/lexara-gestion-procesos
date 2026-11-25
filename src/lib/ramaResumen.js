// Resumen para el abogado y clasificación de las actuaciones de la Rama Judicial (2026-11-24, pedido del usuario: «empieza por 1 y 2» de las mejoras de la pestaña Rama):
//   1) «Resumen» al principio de la pestaña: dónde está el proceso, la próxima audiencia, el término que corre (con días hábiles) y si ya está registrado en el portal;
//   2) clasificar las actuaciones (autos, sentencias, audiencias, traslados…) para filtrarlas y resaltar las importantes, y poder crear la audiencia o el término desde la actuación.
// Todo sale de lo que ya devuelve la consulta pública de la Rama (fecha, actuación, anotación, inicia y finaliza término). Funciones puras, sin red.
import { diasHabilesRestantes, esDiaHabilJudicial, sumarDiasHabilesJudiciales } from './audienciasTerminos.js';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const iso = v => String(v || '').slice(0, 10);
export function hoyISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dias(a, b){ return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }

// ---------- clasificación ----------
export const CATEGORIAS = [
  { id: 'sentencia', nombre: 'Sentencias', singular: 'Sentencia' },
  { id: 'audiencia', nombre: 'Audiencias', singular: 'Audiencia' },
  { id: 'desistimiento', nombre: 'Desistimientos', singular: 'Desistimiento' },
  { id: 'traslado', nombre: 'Traslados y términos', singular: 'Traslado' },
  { id: 'auto', nombre: 'Autos', singular: 'Auto' },
  { id: 'notificacion', nombre: 'Notificaciones', singular: 'Notificación' },
  { id: 'memorial', nombre: 'Memoriales', singular: 'Memorial' },
  { id: 'secretaria', nombre: 'Trámite interno', singular: 'Trámite' },
  { id: 'otro', nombre: 'Otras', singular: 'Otra' },
];
const AUTO_DE_FONDO = /admite|inadmite|rechaza|decide|resuelve|niega|concede|repone|requer|requier|desistimiento|obedezcase|remite|decreta|ordena (la |el )?(notificacion|requerir|emplaz|pago|traslado|practica|embargo|sentencia)|aprueba|acepta renuncia|libra mandamiento|mandamiento|sentencia|fija fecha|corre traslado|declara/;

/** { categoria, importante } de una actuación de la Rama, por el NOMBRE de la actuación (la anotación solo aclara). */
export function clasificarActuacion(act){
  const nombre = norm(act && act.actuacion);
  const nota = norm(act && act.anotacion);
  const dev = (categoria, importante = false) => ({ categoria, importante });
  if(/audiencia|fija fecha|fijar fecha|diligencia/.test(nombre)) return dev('audiencia', true);
  // Desistimientos (2026-11-25, pedido del usuario, sobre todo en los procesos de SOS): casi siempre se nombran en la anotación («Decide sobre desistimiento parcial de las pretensiones», «poder expreso para desistir»).
  if(/desist/.test(nombre + ' ' + nota)) return dev('desistimiento', true);
  if(/^al despacho|^a la secretaria|^constancia secretarial|^pendiente de tramite|^recibo providencia|^reparto|^radicacion|^expediente digital|^envio expediente|^recepcion expediente|^remitidos|^devolucion|^gastos/.test(nombre)) return dev('secretaria');
  if(/^(sentencia|fallo)|sentencia de (primera|segunda|unica) instancia|^se profiere sentencia/.test(nombre)) return dev('sentencia', true);
  if(/traslado|corre traslado/.test(nombre) && !/^envio/.test(nombre)) return dev('traslado', true);
  if(/memorial/.test(nombre)) return dev('memorial');
  if(/notificacion|fijacion (en )?(estado|lista)|^por estado|^envio de (comunicacion|notificacion)|edicto|telegrama|citatorio|aviso|emplaz/.test(nombre)) return dev('notificacion');
  if(/^auto\b|^autos\b|providencia|decreta|ordena|admite|inadmite|rechaza|requer|requier|resuelve|decide|obedezcase|aprueba|acepta|niega|concede|repone|desistimiento|embargo|oficio/.test(nombre)){
    const deTramite = /^auto de tramite/.test(nombre) && !/termino|traslado|audiencia|fija/.test(nota);
    return dev('auto', !deTramite && AUTO_DE_FONDO.test(nombre));
  }
  return dev('otro');
}

// ---------- fechas y horas escritas en el texto ----------
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
function aISO(a, m, d){
  const y = +a, mm = +m, dd = +d;
  if(!y || mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';
  const f = new Date(y, mm - 1, dd);
  if(f.getMonth() !== mm - 1) return '';
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
function horaDespues(texto){
  const m = /(?:a\s+las?|siendo\s+las?|hora(?:s)?\s*:?)\s*(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|horas|hrs?\.?|de la manana|de la tarde|de la noche|del dia|am|pm)?/.exec(texto);
  if(!m) return '';
  let h = +m[1]; const min = m[2] ? +m[2] : 0; const marca = (m[3] || '').replace(/[.\s]/g, '');
  if(!m[2] && !marca) return '';   // «a las 1» sin minutos ni marca: texto cortado, no se adivina
  if(h > 23 || min > 59) return '';
  if((marca === 'pm' || marca === 'delatarde' || marca === 'delanoche') && h < 12) h += 12;
  if((marca === 'am' || marca === 'delamanana') && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
/** Todas las fechas completas (con año) escritas en un texto, con su hora si la trae: «25 DE FEBRERO DE 2027 A LAS 15:00 HORAS», «25/02/2027 a las 3:00PM». */
export function fechasEnTexto(texto){
  const t = norm(texto); const salida = [];
  const largo = /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de|del)\s+(\d{4})/g;
  let m;
  while((m = largo.exec(t))){ const f = aISO(m[3], MESES[m[2]], m[1]); if(f) salida.push({ fecha: f, hora: horaDespues(t.slice(largo.lastIndex, largo.lastIndex + 70)), pos: m.index }); }
  const corto = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g;
  while((m = corto.exec(t))){ const f = aISO(m[3], m[2], m[1]); if(f) salida.push({ fecha: f, hora: horaDespues(t.slice(corto.lastIndex, corto.lastIndex + 70)), pos: m.index }); }
  return salida.sort((a, b) => a.pos - b.pos);
}

// ---------- audiencias y términos de una actuación ----------
function tipoDeAudiencia(textoNorm){
  const m = /audiencia\s+(inicial|de pruebas|de juzgamiento|de conciliacion|de tramite|de alegatos|de instruccion|unica|especial|de fallo|de sustentacion|concentrada|de resolucion de excepciones|de sentencia|virtual|de verificacion|de contradiccion)/.exec(textoNorm);
  if(!m) return /audiencia/.test(textoNorm) ? 'Audiencia' : '';
  return 'Audiencia ' + m[1];
}
function modalidadDeAudiencia(textoNorm){
  const plataforma = /microsoft teams|\bteams\b/.test(textoNorm) ? 'Microsoft Teams' : /lifesize/.test(textoNorm) ? 'Lifesize' : /\bzoom\b/.test(textoNorm) ? 'Zoom' : /google meet|\bmeet\b/.test(textoNorm) ? 'Google Meet' : '';
  if(plataforma || /virtual/.test(textoNorm)) return 'Virtual' + (plataforma ? ' · ' + plataforma : '');
  if(/presencial/.test(textoNorm)) return 'Presencial';
  return '';
}
/** Si la actuación fija una audiencia con fecha futura: { fecha, hora, tipo, modalidad } (la más próxima que cita); si no, null. */
export function audienciaDeActuacion(act, hoy = hoyISO()){
  const texto = String(act && act.actuacion || '') + ' ' + String(act && act.anotacion || '');
  const t = norm(texto);
  if(!/audiencia/.test(t)) return null;
  const futuras = fechasEnTexto(texto).filter(x => x.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if(!futuras.length) return null;
  return { fecha: futuras[0].fecha, hora: futuras[0].hora, tipo: tipoDeAudiencia(t), modalidad: modalidadDeAudiencia(t) };
}
/** Si la actuación abre un término que aún no vence: { inicia, finaliza, restantes }; si no, null. Una «notificación por estado» (inicia y finaliza el mismo día) no es un término. */
export function terminoDeActuacion(act, hoy = hoyISO()){
  const fin = iso(act && act.fechaFinal), ini = iso(act && act.fechaInicial);
  if(!fin || fin < hoy) return null;
  const { categoria } = clasificarActuacion(act);
  if(categoria === 'notificacion' && (!ini || fin <= ini)) return null;
  return { inicia: ini, finaliza: fin, restantes: diasHabilesRestantes(fin, hoy) };
}
/** Días hábiles judiciales entre la fecha de la actuación (no cuenta) y el día en que finaliza el término (cuenta): lo que se escribe en «Días hábiles» del término. */
export function diasHabilesDeTermino(fechaActuacion, finaliza){
  const a = iso(fechaActuacion), f = iso(finaliza);
  if(!a || !f || f <= a) return 0;
  let n = 0; const d = new Date(a + 'T12:00:00');
  for(let i = 0; i < 400; i++){
    d.setDate(d.getDate() + 1);
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if(esDiaHabilJudicial(s)) n++;
    if(s >= f) break;
  }
  return n;
}
/**
 * Lo que va en el formulario de Términos para un término de la Rama: «Fecha de notificación» = el último día hábil ANTES de que inicie el término
 * (el portal cuenta los días a partir del día siguiente) y «Días hábiles» = los hábiles desde que inicia hasta que finaliza (el término real, p. ej. 3 del traslado de excepciones).
 * Sin fecha de inicio, se cuenta desde la fecha de la actuación.
 */
export function datosParaTermino(fechaActuacion, inicia, finaliza){
  const act = iso(fechaActuacion), ini = iso(inicia), fin = iso(finaliza);
  let base = act;
  if(ini && ini > act && ini <= fin){
    const d = new Date(ini + 'T12:00:00');
    for(let i = 0; i < 15; i++){
      d.setDate(d.getDate() - 1);
      const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if(s <= act){ base = act; break; }
      if(esDiaHabilJudicial(s)){ base = s; break; }
    }
  }
  return { fecha: base, dias: diasHabilesDeTermino(base, fin) };
}
/** De un texto cualquiera, la opción de la lista de tipos que más se le parece (para precargar «Tipo de audiencia/término»), o ''. */
export function sugerirDescripcion(opciones, texto){
  const clave = s => new Set(norm(s).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(w => w.length >= 4));
  const base = clave(texto); if(!base.size) return '';
  let mejor = '', puntaje = 0;
  (opciones || []).forEach(o => {
    const palabras = clave(o.Descripcion); let comunes = 0; palabras.forEach(w => { if(base.has(w)) comunes++; });
    const p = palabras.size ? comunes / palabras.size : 0;
    if(comunes > 0 && p > puntaje){ puntaje = p; mejor = o.Descripcion; }
  });
  return puntaje >= 0.5 ? mejor : '';
}

// ---------- resumen del proceso ----------
// La parte de la anotación que habla del desistimiento (unos 150 caracteres alrededor), para mostrarla en el resumen.
function anotacionCorta(anotacion){
  const t = String(anotacion || '').replace(/\s+/g, ' ').trim();
  const i = t.toLowerCase().search(/desist/);
  if(i < 0) return t.slice(0, 150);
  const ini = Math.max(0, i - 50);
  return (ini > 0 ? '…' : '') + t.slice(ini, ini + 170) + (ini + 170 < t.length ? '…' : '');
}
const RUIDO = /^(constancia secretarial|recibe memorial|recibo memorial|recepcion memorial|envio de (comunicacion|notificacion)|recibo providencia|a la secretaria|pendiente de tramite)/;
function ordenar(acts){
  return (acts || []).slice().sort((a, b) => iso(b.fecha).localeCompare(iso(a.fecha)) || Number(b.consecutivo || 0) - Number(a.consecutivo || 0));
}
/** ¿El portal ya tiene esa audiencia / ese término? (misma fecha). */
export function audienciaRegistrada(aud, audienciasPortal){ return !!aud && (audienciasPortal || []).some(r => iso(r.FechaAudiencia) === aud.fecha); }
export function terminoRegistrado(t, terminosPortal){
  return !!t && (terminosPortal || []).some(r => (iso(r.VencimientoTermino) || sumarDiasHabilesJudiciales(iso(r.FechaNotificacion), r.DiasHabiles)) === t.finaliza);
}

/**
 * Todo lo que el abogado necesita de un vistazo, a partir de las actuaciones de la Rama:
 * { total, ultima, ultimaImportante, alDespacho, audiencia, terminos[], suspension }.
 */
export function resumenDeActuaciones(acts, hoy = hoyISO()){
  const lista = ordenar(acts);
  const info = a => ({ act: a, fecha: iso(a.fecha), nombre: String(a.actuacion || '').trim(), hace: dias(iso(a.fecha), hoy), ...clasificarActuacion(a) });
  const ultima = lista[0] ? info(lista[0]) : null;
  const imp = lista.find(a => clasificarActuacion(a).importante);
  const ultimaImportante = imp ? info(imp) : null;

  // ¿Dónde está? El primer movimiento que no es ruido: si es «al despacho…», el expediente está esperando decisión.
  const primero = lista.find(a => !RUIDO.test(norm(a.actuacion)));
  const alDespacho = primero && /^al despacho/.test(norm(primero.actuacion)) ? { fecha: iso(primero.fecha), hace: dias(iso(primero.fecha), hoy), nombre: String(primero.actuacion || '').trim() } : null;

  // Próxima audiencia: la de la actuación más reciente que cita una fecha futura; se avisa si después hay un aplazamiento.
  let audiencia = null;
  for(const a of lista){
    const au = audienciaDeActuacion(a, hoy);
    if(au){
      const posterior = lista.some(x => iso(x.fecha) > iso(a.fecha) && /aplaz|reprogram|cancel|suspend|nueva fecha|nuevo senalamiento|nuevo señalamiento/.test(norm(x.actuacion + ' ' + x.anotacion)) && /audiencia/.test(norm(x.actuacion + ' ' + x.anotacion)));
      audiencia = { ...au, fechaActuacion: iso(a.fecha), actuacion: String(a.actuacion || '').trim(), texto: String(a.anotacion || '').replace(/\s+/g, ' ').trim(), posibleCambio: posterior, restantes: diasHabilesRestantes(au.fecha, hoy), act: a };
      break;
    }
  }
  // Términos que corren: los que la Rama marca con «finaliza término» desde hoy en adelante, el más próximo primero.
  const terminos = lista.map(a => ({ a, t: terminoDeActuacion(a, hoy) })).filter(x => x.t)
    .map(x => ({ ...x.t, fechaActuacion: iso(x.a.fecha), actuacion: String(x.a.actuacion || '').trim(), act: x.a }))
    .sort((p, q) => p.finaliza.localeCompare(q.finaliza));
  // Suspensión o reanudación de términos (acuerdos del Consejo Superior), en los últimos 90 días: se muestra la más reciente.
  const sus = lista.find(a => dias(iso(a.fecha), hoy) <= 90 && /suspension de terminos|suspender.{0,40}terminos|suspension de los terminos|reanudacion de terminos|reanudan los terminos/.test(norm(a.actuacion + ' ' + a.anotacion)));
  const suspension = sus ? { fecha: iso(sus.fecha), reanudacion: /reanudacion|reanudan/.test(norm(sus.actuacion + ' ' + sus.anotacion)) && !/suspension de terminos/.test(norm(sus.anotacion).slice(0, 60)), texto: String(sus.anotacion || '').replace(/\s+/g, ' ').trim() } : null;
  const desists = lista.filter(a => clasificarActuacion(a).categoria === 'desistimiento');
  const desistimiento = desists.length ? { total: desists.length, fecha: iso(desists[0].fecha), hace: dias(iso(desists[0].fecha), hoy), nombre: String(desists[0].actuacion || '').trim(), texto: anotacionCorta(desists[0].anotacion) } : null;
  return { total: lista.length, ultima, ultimaImportante, alDespacho, audiencia, terminos, suspension, desistimiento };
}

// ---------- correos de los despachos (2026-11-24: lectura del buzón de Gerencia, donde llegan por reenvío) ----------
/** Radicados que cita un texto: { c21: [primeros 21 dígitos de los números completos], cortos: ['AAAA-NNNNN', …] }. */
export function radicadosEnTexto(texto){
  const t = String(texto || '');
  const limpio = t
    .replace(/(\d{5})-(\d{2})-(\d{2})-(\d{3})-(\d{4})-(\d{5})-(\d{2})/g, '$1$2$3$4$5$6$7')
    .replace(/(\d{12})\s*-\s*(\d{4})\s*-?\s*(\d{5})\s*-?\s*(\d{2})/g, '$1$2$3$4')
    .replace(/(\d{5})-(\d{2})-(\d{2})-(\d{3})-(\d{4})-(\d{5})\b/g, '$1$2$3$4$5$6');
  const c21 = new Set();
  (limpio.match(/\b\d{23}\b/g) || []).forEach(x => c21.add(x.slice(0, 21)));
  (limpio.match(/\b\d{21}\b/g) || []).forEach(x => c21.add(x));
  const cortos = new Set();
  (t.match(/\b(?:19|20)\d{2}[-\s]?\d{5}\b/g) || []).forEach(s => cortos.add(s.replace(/\s/, '-').replace(/^(\d{4})(\d{5})$/, '$1-$2')));
  return { c21: [...c21], cortos: [...cortos] };
}

export const TIPOS_CORREO = {
  audiencia: 'Audiencia', desistimiento: 'Desistimiento', sentencia: 'Sentencia', traslado: 'Traslado o término', auto: 'Auto', oficio: 'Oficio',
  notificacion: 'Notificación', acuse: 'Acuse o respuesta automática', otro: 'Otro',
};
/**
 * Qué clase de correo es, por su asunto y vista previa. { tipo, ruido, importante, audiencia, terminoDias }:
 * ruido = acuses de entrega/lectura, respuestas automáticas y acuses de SAMAI (no son actuaciones); audiencia = fecha futura que cita el texto;
 * terminoDias = «N días (hábiles)» si el texto los menciona (solo una pista: la verificación es de la persona).
 */
export function clasificarCorreo(asunto, vista, remitente, hoy = hoyISO()){
  const a = norm(asunto), v = norm(vista), r = norm(remitente), t = a + ' ' + v;
  const ruido = /^(respuesta automatica|automatic reply|delivered|entregado|relayed|retransmitido|undeliverable|leido:|read:|aceptado|rechazado|provisional)|postmaster|no se pudo entregar/.test(a) || /postmaster|mailer-daemon/.test(r)
    || /notificaciones samai|acuse de recibo|validacion de autenticacion/.test(a + ' ' + r);
  let tipo = 'otro';
  if(ruido) tipo = 'acuse';
  else if(/audiencia|diligencia|^cancelado/.test(a)) tipo = 'audiencia';
  else if(/desist/.test(t)) tipo = 'desistimiento';
  else if(/sentencia|fallo/.test(a)) tipo = 'sentencia';
  else if(/traslado|termino|corre traslado/.test(a)) tipo = 'traslado';
  else if(/\bauto\b|providencia|requiere|admite|niega|decreta|ordena|rechaza|resuelve/.test(a)) tipo = 'auto';
  else if(/oficio/.test(a)) tipo = 'oficio';
  else if(/notificacion|estado|edicto|citacion|comunicacion/.test(a)) tipo = 'notificacion';
  let audiencia = null;
  if(!ruido && /audiencia|diligencia/.test(t)){
    const futuras = fechasEnTexto(String(asunto || '') + ' ' + String(vista || '')).filter(x => x.fecha >= hoy).sort((p, q) => p.fecha.localeCompare(q.fecha));
    if(futuras.length) audiencia = { fecha: futuras[0].fecha, hora: futuras[0].hora, tipo: tipoDeAudiencia(t), modalidad: modalidadDeAudiencia(t), cancelada: /^cancelado|cancel/.test(a) };
  }
  const m = !ruido && /(?:termino|plazo|traslado|dentro de)[^.]{0,60}?\b(\d{1,2})\s*(?:\(\d+\)\s*)?dias(?:\s+habiles)?/.exec(t);
  const terminoDias = m ? +m[1] : 0;
  return { tipo, ruido, importante: !ruido && (['audiencia', 'desistimiento', 'sentencia', 'traslado', 'auto'].includes(tipo) || !!audiencia || !!terminoDias), audiencia, terminoDias };
}

/** Los procesos del portal a los que apunta un correo: por el radicado de 21 dígitos (No. completo o Histórico) y, si no hay, por el número corto cuando es único. */
export function procesosDeCorreo(textoRadicados, procesos){
  const { c21, cortos } = radicadosEnTexto(textoRadicados);
  const dig = v => String(v || '').split(/\s+/).map(p => p.replace(/\D/g, '')).filter(d => d.length >= 21).map(d => d.slice(0, 21));
  const hallados = new Map();
  (procesos || []).forEach(p => {
    const nums = new Set([...dig(p.NoCompleto), ...dig(p.HistoricoNumerosCompletos)]);
    if(c21.some(x => nums.has(x))) hallados.set(p.id, p);
  });
  if(!hallados.size){
    cortos.forEach(c => { const m = (procesos || []).filter(p => p.Radicado === c); if(m.length === 1) hallados.set(m[0].id, m[0]); });
  }
  return [...hallados.values()];
}
