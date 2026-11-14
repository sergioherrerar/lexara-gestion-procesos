// Novedades de la Rama Judicial en la campana (2026-11-13, pedido del usuario: «ya puedes colocar notificación de nuevas actuaciones»).
// Una vez al día, cuando alguien abre la app, se pregunta a la Rama por la fecha de la última actuación de los procesos vigentes de esa persona
// (con el número principal, en lotes de 15 y solo cuando hay conexión real). Si esa fecha es posterior a la que ya había visto, aparece en la campana.
// Lo ya visto se guarda en este navegador, por persona: la PRIMERA revisión solo toma la foto de partida (no avisa de lo que ya existía) y se avisa de lo que cambie después.
// Al abrir la pestaña «Rama Judicial» del proceso la novedad se da por vista. No escribe nada en SharePoint.
import { consultarRama, numerosDelProceso, familiaDelRadicado } from './ramaJudicial';
import { nombreAbogadoCanonico, stripHtml } from './graph';

const LLAVE = 'lexara.rama.novedades.v1';
const clave = n => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const mismaPersona = (a, b) => !!clave(a) && clave(nombreAbogadoCanonico(a)) === clave(nombreAbogadoCanonico(b));
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const soloFecha = v => String(v || '').slice(0, 10);

function cargar(usuario){
  try{
    const todo = JSON.parse(localStorage.getItem(LLAVE) || '{}');
    const u = todo[clave(usuario)] || {};
    return { revisado: u.revisado || '', vistos: u.vistos || {}, novedades: u.novedades || {}, familia: u.familia || {}, familiaDia: u.familiaDia || '' };
  }catch(e){ return { revisado: '', vistos: {}, novedades: {}, familia: {}, familiaDia: '' }; }
}
function guardar(usuario, estado){
  try{
    const todo = JSON.parse(localStorage.getItem(LLAVE) || '{}');
    todo[clave(usuario)] = estado;
    localStorage.setItem(LLAVE, JSON.stringify(todo));
  }catch(e){ /* sin almacenamiento: se vuelve a revisar la próxima vez */ }
}

// Procesos vigentes de la persona (como Apoderado o Abogado encargado) que tienen un número principal de 23 dígitos. Con `todos` se incluyen los de todo el equipo.
export function procesosParaRevisar(procesos, nombre, todos = false){
  return (procesos || []).filter(p => !(stripHtml(p.EstadoVT) || '').toLowerCase().includes('termin'))
    .filter(p => todos || mismaPersona(p.Apoderado, nombre) || mismaPersona(p.AbogadoEncargado, nombre))
    .map(p => ({ id: p.id, radicado: numerosDelProceso(p).principal, cliente: p.Cliente || '', numeroCorto: p.Radicado || '' }))
    .filter(x => x.radicado);
}

export function novedadesGuardadas(usuario, lista){
  const est = cargar(usuario);
  // Cada proceso se revisa con todas sus instancias (terminaciones 00-03 que existen); una novedad en cualquiera de ellas lleva al proceso.
  const dueno = new Map();
  (lista || []).forEach(x => { (est.familia[x.radicado] || [x.radicado]).forEach(v => dueno.set(v, x)); });
  return Object.entries(est.novedades).map(([rad, n]) => {
    const p = dueno.get(rad);
    const instancia = p ? (rad !== p.radicado ? rad.slice(-2) : '') : (n.instancia || '');
    return { radicado: rad, procesoId: p ? p.id : n.id, cliente: p ? p.cliente : (n.cliente || ''), numeroCorto: p ? p.numeroCorto : (n.numeroCorto || ''), fecha: n.fecha, detectada: n.detectada, instancia };
  }).filter(n => n.procesoId != null);
}

async function resumenesDeLote(url, radicados){
  try{
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ radicados }) });
    const datos = await res.json().catch(() => null);
    if(res.ok && datos?.ok && datos.resultados) return datos.resultados;
  }catch(e){ /* sin conexión: se intenta uno por uno */ }
  // Respaldo si la función publicada es la versión anterior (sin modo lote): una consulta por radicado, solo la primera página.
  const salida = {};
  for(const rad of radicados){
    try{
      const d = await consultarRama(url, rad, { forzar: true, paginas: 1 });
      const p = d.procesos?.[0];
      salida[rad] = p ? { ok: true, fechaUltimaActuacion: p.fechaUltimaActuacion, esPrivado: !!p.esPrivado } : { ok: true, sinProceso: true };
    }catch(e){ salida[rad] = { ok: false, error: e.message }; }
  }
  return salida;
}

// Revisa la Rama (una vez al día, o ya si `forzar`) y devuelve las novedades pendientes de esta persona.
export async function revisarRama({ url, lista, usuario, forzar = false }){
  const est = cargar(usuario);
  const hoy = hoyISO();
  if(!url || !lista.length || (!forzar && est.revisado === hoy)) return novedadesGuardadas(usuario, lista);
  // Se revisan el número principal y sus otras instancias (terminaciones 00-03 que existan). La primera vez se prueban las cuatro y se recuerda cuáles existen.
  // Cada 14 días se vuelven a probar las cuatro terminaciones (por si apareció una instancia nueva).
  if(est.familiaDia && (new Date(hoy) - new Date(est.familiaDia)) / 86400000 > 14){ est.familia = {}; est.familiaDia = ''; }
  const consultas = [];
  const vistosRad = new Set();
  lista.forEach(x => { (est.familia[x.radicado] || familiaDelRadicado(x.radicado)).forEach(v => { if(!vistosRad.has(v)){ vistosRad.add(v); consultas.push({ rad: v, x }); } }); });
  const resultados = {};
  let respondieron = 0;
  for(let i = 0; i < consultas.length; i += 15){
    const lote = consultas.slice(i, i + 15);
    const res = await resumenesDeLote(url, lote.map(c => c.rad));
    lote.forEach(c => {
      const r = res[c.rad];
      resultados[c.rad] = r || { ok: false };
      if(!r || !r.ok) return;
      respondieron++;
      const fecha = soloFecha(r.fechaUltimaActuacion);
      if(!fecha){ if(est.vistos[c.rad] === undefined) est.vistos[c.rad] = '0000-00-00'; return; }   // no existe, o aún no tiene actuaciones: si luego aparece la primera, avisa
      const visto = est.vistos[c.rad];
      if(!visto){ est.vistos[c.rad] = fecha; return; }                      // primera vez: foto de partida, sin aviso
      if(fecha > visto) est.novedades[c.rad] = { id: c.x.id, cliente: c.x.cliente, numeroCorto: c.x.numeroCorto, fecha, detectada: hoy, instancia: c.rad !== c.x.radicado ? c.rad.slice(-2) : '' };
    });
  }
  // Se recuerda qué terminaciones existen de cada proceso (solo si las cuatro respondieron), para no volver a probar las que no existen.
  lista.forEach(x => {
    if(est.familia[x.radicado]) return;
    const fam = familiaDelRadicado(x.radicado);
    if(fam.every(v => resultados[v]?.ok)){ est.familia[x.radicado] = fam.filter(v => v === x.radicado || !!soloFecha(resultados[v].fechaUltimaActuacion)); if(!est.familiaDia) est.familiaDia = hoy; }
  });
  if(respondieron > 0) est.revisado = hoy;                                 // si la Rama no respondió (caída), se vuelve a intentar
  guardar(usuario, est);
  return novedadesGuardadas(usuario, lista);
}

// Se da por vista la novedad de un radicado (al abrir su pestaña «Rama Judicial»).
export function marcarRamaVista(usuario, radicado, fechaUltima){
  const est = cargar(usuario);
  const f = soloFecha(fechaUltima);
  if(f) est.vistos[radicado] = f;
  delete est.novedades[radicado];
  guardar(usuario, est);
}
