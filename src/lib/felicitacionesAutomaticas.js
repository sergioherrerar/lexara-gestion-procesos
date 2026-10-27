// Plan y ejecución del envío AUTOMÁTICO de las felicitaciones de cumpleaños (2026-10-29, pedido del usuario: «que se envíe de forma automática desde el correo de Soporte»,
// a las 7:00 a. m. del día del cumpleaños). El portal no corre a esa hora: deja cada correo programado en Exchange (entrega diferida) y Exchange lo entrega solo.
import { proximoCumpleanos } from './cumpleanos';
import { prepararFelicitacion } from './felicitacionCumpleanos';
import { programarCorreoDiferido, listarFelicitacionesProgramadas, cuentaDelPortal } from './graph';

export const REMITENTE_AUTOMATICO = 'soporte@lexaraabogados.com';
export const DIAS_ADELANTE = 30;
const DESFASE_BOGOTA_MS = 5 * 3600 * 1000;   // Colombia: UTC-5, sin horario de verano

export function esCuentaDeSoporte(){ return cuentaDelPortal() === REMITENTE_AUTOMATICO; }

// Con copia al resto del equipo (pedido del usuario 2026-10-29): los demás colaboradores ACTIVOS con correo, sin repetir, sin el cumpleañero ni la cuenta
// de Soporte (que es quien envía).
export function copiaDelEquipo(colaborador, colaboradores){
  const propio = String(colaborador?.Correo || '').toLowerCase();
  const vistos = new Set([propio, REMITENTE_AUTOMATICO]);
  const cc = [];
  (colaboradores || []).forEach(c => {
    const correo = String(c.Correo || '').trim();
    const clave = correo.toLowerCase();
    if(!c.Activo || !correo || vistos.has(clave)) return;
    vistos.add(clave); cc.push(correo);
  });
  return cc;
}

function aTexto(fecha){
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}
// Día (aaaa-mm-dd) en Colombia de un instante ISO en UTC.
function diaEnBogota(iso){
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? '' : new Date(t - DESFASE_BOGOTA_MS).toISOString().slice(0, 10);
}
// Hora de entrega: las 7:00 a. m. de Colombia (12:00 UTC) del día del cumpleaños; si ya pasó (cumpleaños de hoy, tarde), en 2 minutos.
export function horaDeEnvio(textoFecha, ahora = new Date()){
  const iso = `${textoFecha}T12:00:00.000Z`;
  return new Date(iso) > ahora ? { iso, yaPaso: false } : { iso: new Date(ahora.getTime() + 2 * 60000).toISOString(), yaPaso: true };
}

// Colaboradores ACTIVOS con correo y fecha de nacimiento que cumplen en los próximos DIAS_ADELANTE días, con su estado: 'enviada' | 'programada' | 'pendiente'.
export function planDeFelicitaciones(colaboradores, programadas, ahora = new Date()){
  const plan = [];
  (colaboradores || []).forEach(c => {
    if(!c.Activo || !c.Correo) return;
    const p = proximoCumpleanos(c.FechaNacimiento, ahora);
    if(!p || p.dias > DIAS_ADELANTE) return;
    const fecha = aTexto(p.fecha);
    const correo = String(c.Correo).toLowerCase();
    const previa = (programadas || []).find(x => x.para === correo && diaEnBogota(x.hora) === fecha);
    plan.push({ colaborador: c, fecha, dias: p.dias, texto: p.texto, estado: previa ? (previa.enviada ? 'enviada' : 'programada') : 'pendiente', horaPrevia: previa?.hora || '' });
  });
  return plan.sort((a, b) => a.dias - b.dias);
}

export async function cargarEstado(colaboradores){
  const programadas = await listarFelicitacionesProgramadas();
  return planDeFelicitaciones(colaboradores, programadas);
}

// Programa los pendientes uno por uno (para no pasarse de límites de Graph). `alAvanzar(i, total, nombre)` informa el progreso. Devuelve { hechos, fallos }.
export async function programarPendientes(plan, listas, alAvanzar, config, colaboradores){
  const pendientes = plan.filter(x => x.estado === 'pendiente');
  const hechos = [], fallos = [];
  for(let i = 0; i < pendientes.length; i++){
    const x = pendientes[i];
    alAvanzar?.(i, pendientes.length, x.colaborador.Nombre);
    try{
      const f = await prepararFelicitacion({ colaborador: x.colaborador, listas, config });
      const { iso } = horaDeEnvio(x.fecha);
      await programarCorreoDiferido({ to: x.colaborador.Correo, cc: copiaDelEquipo(x.colaborador, colaboradores), subject: f.asunto, htmlBody: f.html, imagenes: f.imagenes, enviarEnIso: iso });
      hechos.push(x.colaborador.Nombre);
    }catch(err){ console.error('No se pudo programar la felicitación de ' + x.colaborador.Nombre + ':', err); fallos.push({ nombre: x.colaborador.Nombre, motivo: err.message || String(err) }); if(/Mail\.Send/.test(err.message || '')) break; }
  }
  return { hechos, fallos };
}

// Prueba: la felicitación de un colaborador, enviada a Soporte en 3 minutos con la categoría de prueba, para comprobar que Exchange la entrega a la hora indicada.
export async function enviarPrueba(colaborador, listas, config){
  const f = await prepararFelicitacion({ colaborador, listas, config });
  const iso = new Date(Date.now() + 3 * 60000).toISOString();
  await programarCorreoDiferido({ to: REMITENTE_AUTOMATICO, subject: '[PRUEBA] ' + f.asunto, htmlBody: f.html, imagenes: f.imagenes, enviarEnIso: iso, categoria: 'Prueba felicitación' });
  return iso;
}
