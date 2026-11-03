// Campana de pendientes de la cabecera (2026-11-03, pedido del usuario): las Audiencias, Términos y Pendientes que tiene asignados la persona que inició sesión.
//  · Audiencia → su columna «Abogado».
//  · Término → no tiene responsable propio; es el Apoderado del Proceso al que pertenece.
//  · Pendiente → «Pendiente para».
//  · Tutela → su «Abogado Respuesta»; cuenta mientras no esté Contestada (ver contestacionesEnviadas.js) y no haya vencido hace más de 3 días.
// Cuenta lo que falta por atender: audiencias y términos de hoy en adelante (no hay forma de marcarlos como cumplidos, así que lo pasado no cuenta) y los Pendientes que
// siguen «Vigente», aunque su fecha ya haya pasado (esos sí son tareas sin hacer).
import { sumarDiasHabilesJudiciales, diasHabilesRestantes, colorCuentaRegresiva, etiquetaCuentaRegresiva } from './audienciasTerminos.js';
import { nombreAbogadoCanonico } from './graph.js';
import { vencimientoEfectivo } from './contestacionesEnviadas.js';

const soloFechaISO = v => String(v || '').slice(0, 10);
const clave = n => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
// Un mismo abogado puede estar escrito con otro nombre (alias conocidos): se compara siempre por el nombre completo.
const mismaPersona = (a, b) => !!clave(a) && clave(nombreAbogadoCanonico(a)) === clave(nombreAbogadoCanonico(b));

function hoyISOLocal(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Lista ordenada por fecha de lo que tiene pendiente `nombre`. Con `nombre` vacío (modo demo, sin sesión real) devuelve lo de todos.
 * Cada fila: { clave, tipo, fecha, hora, texto, radicado, cliente, responsable, vencido, color, etiqueta }.
 */
export function pendientesDePersona({ nombre, audiencias, terminos, pendientes, procesos, tutelas }){
  const hoy = hoyISOLocal();
  const procesoPorId = new Map((procesos || []).map(p => [String(p.id), p]));
  const filtrar = !!clave(nombre);
  const lista = [];
  function agregar(f){
    const vencido = !!f.fecha && f.fecha < hoy;
    const restantes = !f.fecha ? null : vencido ? -1 : diasHabilesRestantes(f.fecha);
    lista.push({ ...f, vencido, color: vencido ? (f.revisarEnvio ? 'naranja' : 'rojo') : colorCuentaRegresiva(restantes), etiqueta: f.fecha ? (vencido ? (f.revisarEnvio ? 'Revisar envío' : 'Vencido') : etiquetaCuentaRegresiva(restantes)) : 'Sin fecha' });
  }
  (audiencias || []).forEach(a => {
    if(filtrar && !mismaPersona(a.Abogado, nombre)) return;
    const fecha = soloFechaISO(a.FechaAudiencia);
    if(fecha && fecha < hoy) return;
    const p = procesoPorId.get(String(a.Proceso));
    agregar({ clave: 'a' + a.id, tipo: 'audiencias', fecha, hora: a.HoraAudiencia || '', texto: a.Descripcion || '', radicado: p?.Radicado || '', cliente: p?.Cliente || '', responsable: a.Abogado || '' });
  });
  (terminos || []).forEach(t => {
    const p = procesoPorId.get(String(t.Proceso));
    if(filtrar && !mismaPersona(p?.Apoderado, nombre)) return;
    const fecha = soloFechaISO(t.VencimientoTermino) || sumarDiasHabilesJudiciales(soloFechaISO(t.FechaNotificacion), t.DiasHabiles) || '';
    if(fecha && fecha < hoy) return;
    agregar({ clave: 't' + t.id, tipo: 'terminos', fecha, hora: '', texto: t.Descripcion || '', radicado: p?.Radicado || '', cliente: p?.Cliente || '', responsable: p?.Apoderado || '' });
  });
  (pendientes || []).forEach(pe => {
    if(pe.Estado === 'Terminado') return;
    if(filtrar && !mismaPersona(pe.PendientePara, nombre)) return;
    const p = procesoPorId.get(String(pe.ProcesoMD ?? pe.Proceso));
    agregar({ clave: 'p' + pe.id, tipo: 'pendientes', fecha: soloFechaISO(pe.FechaPendiente), hora: '', texto: pe.Pendiente || '', radicado: p?.Radicado || '', cliente: p?.Cliente || '', responsable: pe.PendientePara || '' });
  });
  const limite = (() => { const d = new Date(); d.setDate(d.getDate() - 3); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  (tutelas || []).forEach(tu => {
    if(String(tu.Contestada || '').trim().toUpperCase() === 'SI') return;
    if(filtrar && !mismaPersona(tu.AbogadoRespuesta, nombre)) return;
    // Con el aplazamiento de ese número ya enviado (Contestada = SI) el plazo gana un día hábil.
    const fecha = vencimientoEfectivo(tu, tutelas, x => String(x.Contestada || '').trim().toUpperCase() === 'SI').fecha;
    if(!fecha || fecha < limite) return;
    // «Vencido» es muy grave: el portal no puede asegurar que no se envió (el correo pudo salir con otro número o desde otro buzón), así que en tutelas solo pide revisar el envío.
    agregar({ revisarEnvio: fecha < hoy, clave: 'u' + tu.id, tipo: 'tutelas', fecha, hora: '', texto: 'Tutela ' + (tu.NoTutela || '') + (tu.TipoRespuesta ? ' · ' + tu.TipoRespuesta : ''), radicado: '', cliente: tu.Cliente || '', responsable: tu.AbogadoRespuesta || '' });
  });
  return lista.sort((a, b) => {
    if(!a.fecha && !b.fecha) return 0;
    if(!a.fecha) return 1;
    if(!b.fecha) return -1;
    return a.fecha.localeCompare(b.fecha) || (a.hora || '').localeCompare(b.hora || '');
  });
}
