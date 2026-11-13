// Rama Judicial → actuaciones de un proceso (2026-11-13, pedido del usuario: «integrar la lectura de los procesos en la rama judicial para ver
// sus anotaciones… que se llene el histórico así por líneas como lo llevamos»). La consulta la hace rama-judicial/consultar.php (cPanel), que lee
// la Consulta Nacional Unificada de la Rama (pública, por radicado de 23 dígitos, sin usuario ni contraseña). Aquí solo se arma la petición y
// se convierten las actuaciones en renglones del Histórico («DD-MM-AAAA Actuación: anotación»), sin repetir los que ya estén.
import { stripHtml, normalize } from './graph';

// Radicados de 23 dígitos del proceso: el «No. completo» y los del «Histórico números completos» (sin repetir).
export function radicadosDelProceso(proceso){
  const partes = [...String(proceso?.NoCompleto || '').split(/\s+/), ...String(proceso?.HistoricoNumerosCompletos || '').split(/\s+/)];
  const vistos = new Set();
  const lista = [];
  partes.forEach(p => { const d = p.replace(/\D/g, ''); if(d.length === 23 && !vistos.has(d)){ vistos.add(d); lista.push(d); } });
  return lista;
}

// Primero el número principal (el «No. completo»); después los del «Histórico números completos» (y cualquier otro número que traiga el No. completo).
export function numerosDelProceso(proceso){
  const todos = radicadosDelProceso(proceso);
  const principal = (String(proceso?.NoCompleto || '').split(/\s+/).map(p => p.replace(/\D/g, '')).find(d => d.length === 23)) || todos[0] || '';
  return { principal, historicos: todos.filter(r => r !== principal) };
}

const cache = new Map();   // radicado -> { t, datos }   (10 minutos, para no repetir consultas al abrir y cerrar la ficha)
const VIGENCIA_MS = 10 * 60 * 1000;

export async function consultarRama(url, radicado, { forzar = false, paginas = 3 } = {}){
  if(!url) throw new Error('Falta instalar la consulta a la Rama Judicial (RAMA_JUDICIAL_URL en config.js).');
  const guardado = cache.get(radicado);
  if(!forzar && guardado && Date.now() - guardado.t < VIGENCIA_MS) return guardado.datos;
  let res;
  try{
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ radicado, paginas }) });
  }catch(e){
    throw new Error('No se pudo comunicar con el servidor de consulta. Revise la conexión e intente de nuevo.');
  }
  let datos = null;
  try{ datos = await res.json(); }catch(e){ /* sin cuerpo válido */ }
  if(!res.ok || !datos?.ok) throw new Error(datos?.error || `La consulta falló (código ${res.status}).`);
  cache.set(radicado, { t: Date.now(), datos });
  return datos;
}

// ---------- actuaciones → renglones del Histórico ----------

// Actuaciones de puro trámite (envíos, recibos, pases): no se agregan solas al Histórico, aunque sí se muestran en la lista.
const TRAMITE = /^(envio de comunicacion|recibo providencia|a la secretaria|constancia secretarial|fijacion estado|notificacion por estado|recibe memoriales online a la secretaria|recibe memorial(es)?)$/;
export function esDeTramite(act){ return TRAMITE.test(normalize(act?.actuacion || '').replace(/\s+/g, ' ').trim()); }

export function fechaDMA(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

// Texto corto de la anotación: sin iniciales del funcionario, sin enlaces ni listas de certificados, máx. ~180 caracteres.
export function resumenAnotacion(texto, max = 180){
  let t = String(texto || '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^[A-ZÁÉÍÓÚÑ]{2,4}\s*-\s*/, '');                                   // «IGH-», «YCÁ-»
  t = t.replace(/^[A-ZÁÉÍÓÚÑ]{2,4}(?=AUTO|SENTENCIA|ACTA|OFICIO)/, '');            // «YCÁAUTO RESUELVE…»
  t = t.replace(/^[A-ZÁÉÍÓÚÑ]{2,4}(?=[A-ZÁÉÍÓÚÑ][a-záéíóúñ])/, '');                  // «JHGDecide sobre…»
  t = t.replace(/^[A-ZÁÉÍÓÚÑ]{2,4}s*[.:]?$/, '');                                       // solo las iniciales del funcionario: «JHG»
  t = t.replace(/\s*(USANDO EL SIGUIENTE ENLACE|ENLACE DE ACCESO|Certificados adjuntos|Total adjuntos|Documento firmado electr)[\s\S]*$/i, '');
  t = t.replace(/https?:?\s*\S+/gi, '').replace(/\s+/g, ' ').trim().replace(/^[.,;:\s]+|[.,;:\s]+$/g, '');
  t = t.replace(/^[A-ZÁÉÍÓÚÑ]{2,4}$/, '');                                          // quedó solo las iniciales del funcionario: «JHG»
  if(t.length > max) t = t.slice(0, max - 3).replace(/\s+\S*$/, '') + '…';
  return t;
}

export function renglonHistorico(act, max = 180){
  const f = fechaDMA(act.fecha);
  const nombre = String(act.actuacion || '').trim();
  const nota = resumenAnotacion(act.anotacion, max);
  const cuerpo = nota && normalize(nota) !== normalize(nombre) ? `${nombre}: ${nota}` : nombre;
  return `${f} ${cuerpo}`.trim() + (/[.…]$/.test(cuerpo) ? '' : '.');
}

// ¿Esa actuación ya está en el Histórico (que se escribe a mano, con otras palabras)? Si trae la misma fecha y el nombre de la actuación, sí.
export function yaEstaEnHistorico(act, historicoHtml){
  const h = normalize(stripHtml(historicoHtml || '')).replace(/\s+/g, ' ');
  const f = fechaDMA(act.fecha);
  const nombre = normalize(act.actuacion || '').replace(/\s+/g, ' ').trim();
  if(!h || !f) return false;
  if(h.includes(normalize(renglonHistorico(act)).replace(/\s+/g, ' ').replace(/[.…]$/, ''))) return true;
  return h.includes(f) && nombre.length >= 4 && h.includes(nombre.slice(0, 14));
}

// Fecha (AAAA-MM-DD) del renglón más reciente que ya tiene fecha en el Histórico, para saber desde dónde hay «novedades».
export function ultimaFechaDelHistorico(historicoHtml){
  const t = stripHtml(historicoHtml || '').replace(RE_MARCA, ' ');   // la marca «Actualizado desde la Rama» lleva la fecha de hoy y no cuenta como actuación
  let mayor = '';
  const re = /(?<![\d/-])(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?!\d)/g;
  let m;
  while((m = re.exec(t))){
    const iso = `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    if(iso > mayor && iso <= new Date().toISOString().slice(0, 10)) mayor = iso;
  }
  return mayor;
}

// Las actuaciones «nuevas»: de fondo (no de trámite), que no están ya en el Histórico y son posteriores a su último renglón fechado
// (si el Histórico no tiene fechas, las 10 más recientes). Salen en orden cronológico, como se lleva el Histórico.
export function actuacionesNuevas(actuaciones, historicoHtml){
  const desde = ultimaFechaDelHistorico(historicoHtml);
  const fondo = (actuaciones || []).filter(a => !esDeTramite(a) && !yaEstaEnHistorico(a, historicoHtml));
  const elegidas = desde ? fondo.filter(a => String(a.fecha || '').slice(0, 10) >= desde) : fondo.slice(0, 10);
  return elegidas.slice().sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) || (a.consecutivo || 0) - (b.consecutivo || 0));
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function htmlRenglones(acts){ return acts.map(a => `<div>${esc(renglonHistorico(a))}</div>`).join(''); }

// ---------- actualización completa desde la Rama: Histórico + Estado + Fecha Estado ----------
// La marca deja constancia en el propio Histórico (así la ven todos) de cuándo se actualizó desde la Rama.
const RE_MARCA = /\d{1,2}-\d{1,2}-\d{4}\s+Actualizado desde la Rama Judicial[^.]*\.?/g;
export function ultimaActualizacionDesdeRama(historicoHtml){
  const t = stripHtml(historicoHtml || '');
  const todas = t.match(RE_MARCA);
  if(!todas || !todas.length) return '';
  return /^(\d{1,2}-\d{1,2}-\d{4})/.exec(todas[todas.length - 1])?.[1] || '';
}
function hoyDMA(){ const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; }

// Estado = las 2 actuaciones de fondo más recientes (cada una con su fecha, una por línea, como se lleva); Fecha Estado = la fecha de la más reciente.
// Solo se cambia si esa actuación es posterior a la Fecha Estado que ya tenía el proceso.
export function actualizacionDesdeRama(actuaciones, historicoHtml, fechaEstadoActual){
  const nuevas = actuacionesNuevas(actuaciones, historicoHtml);
  const fondo = (actuaciones || []).filter(a => !esDeTramite(a) && a.fecha)
    .slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || (b.consecutivo || 0) - (a.consecutivo || 0));
  const providencias = fondo.filter(a => /^(auto|sentencia|audiencia|fallo|providencia|decreto)/.test(normalize(a.actuacion || '').trim()));
  const recientes = (providencias.length ? providencias : fondo).slice(0, 2).reverse();
  const fechaNueva = recientes.length ? String(recientes[recientes.length - 1].fecha).slice(0, 10) : '';
  const cambiaEstado = !!fechaNueva && fechaNueva > String(fechaEstadoActual || '').slice(0, 10);
  const estado = cambiaEstado ? recientes.map(a => renglonHistorico(a, 140)).join('\n') : null;
  const n = nuevas.length;
  const detalle = n ? ` (${n} ${n === 1 ? 'actuación nueva' : 'actuaciones nuevas'})` : ' (sin actuaciones nuevas)';
  const marca = `${hoyDMA()} Actualizado desde la Rama Judicial${detalle}.`;
  return {
    nuevas, estado, fechaEstado: cambiaEstado ? fechaNueva : null,
    historicoHtml: htmlRenglones(nuevas) + `<div>${esc(marca)}</div>`,
    hayCambios: n > 0 || cambiaEstado,
  };
}
