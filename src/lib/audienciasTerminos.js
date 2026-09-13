// Lógica de "días hábiles judiciales" para el módulo Audiencias/Términos
// (Informes > Procesos Judiciales > Audiencias Términos), agregado 2026-09-12
// a pedido explícito del usuario (reemplaza el seguimiento manual que antes
// se llevaba en un formulario de Access).
//
// A diferencia de esFestivoODomingo (horasExtras.js, construida para
// clasificar horas extra — ahí el sábado SÍ es día laboral normal), acá el
// usuario confirmó que para términos y audiencias judiciales el sábado NO es
// día hábil (solo lunes a viernes, y los festivos de Colombia también se
// excluyen) — por eso esta es una función nueva, aunque sí reutiliza
// festivosColombia() para no duplicar el calendario de festivos.
import { festivosColombia } from './horasExtras.js';

function fmtISO(d){
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function parseISO(fechaISO){
  const [y,m,d] = String(fechaISO||"").slice(0,10).split('-').map(Number);
  if(!y || !m || !d) return null;
  return new Date(y, m-1, d);
}
function sumarDias(d, dias){
  const r = new Date(d);
  r.setDate(r.getDate() + dias);
  return r;
}

// Lunes a viernes, sin festivos colombianos — sábados y domingos NUNCA son
// hábiles para este conteo judicial (confirmado por el usuario 2026-09-12:
// "sabados no son habiles").
export function esDiaHabilJudicial(fechaISO){
  const date = parseISO(fechaISO);
  if(!date) return false;
  const dow = date.getDay(); // 0=domingo, 6=sabado
  if(dow === 0 || dow === 6) return false;
  return !festivosColombia(date.getFullYear()).has(fmtISO(date));
}

// Suma `dias` días hábiles judiciales a partir de una fecha (la fecha de
// partida no cuenta como día 1; se cuenta desde el día siguiente, como un
// plazo procesal). Devuelve la fecha resultante en formato ISO — usada para
// calcular el "Vencimiento" de un Término a partir de su Fecha de
// notificación + Días hábiles.
export function sumarDiasHabilesJudiciales(fechaISO, dias){
  let date = parseISO(fechaISO);
  const total = Math.round(Number(dias));
  if(!date || !total || total < 0) return fechaISO ? String(fechaISO).slice(0,10) : "";
  let restantes = total;
  while(restantes > 0){
    date = sumarDias(date, 1);
    if(esDiaHabilJudicial(fmtISO(date))) restantes--;
  }
  return fmtISO(date);
}

// Cuenta los días hábiles judiciales estrictamente entre hoy y una fecha
// objetivo (sin contar hoy). Positivo = faltan días; 0 = es hoy; negativo =
// ya venció (la fecha objetivo ya pasó). `hoyISO` es opcional (solo para
// pruebas) — por defecto usa la fecha real de hoy.
export function diasHabilesRestantes(fechaObjetivoISO, hoyISO){
  const hoy = parseISO(hoyISO) || parseISO(fmtISO(new Date()));
  const objetivo = parseISO(fechaObjetivoISO);
  if(!hoy || !objetivo) return null;
  if(fmtISO(hoy) === fmtISO(objetivo)) return 0;
  const yaVencio = objetivo < hoy;
  let cursor = hoy;
  let dias = 0;
  if(yaVencio){
    while(fmtISO(cursor) !== fmtISO(objetivo)){
      cursor = sumarDias(cursor, -1);
      if(esDiaHabilJudicial(fmtISO(cursor))) dias--;
    }
  } else {
    while(fmtISO(cursor) !== fmtISO(objetivo)){
      cursor = sumarDias(cursor, 1);
      if(esDiaHabilJudicial(fmtISO(cursor))) dias++;
    }
  }
  return dias;
}

// Clasificación de color pedida y confirmada por el usuario 2026-09-12:
// > 5 días hábiles restantes = verde · de 2 a 5 = naranja · de 0 a 2 = rojo ·
// ya vencido (la fecha ya pasó) = gris.
export function colorCuentaRegresiva(diasRestantes){
  if(diasRestantes === null || diasRestantes === undefined) return 'gris';
  if(diasRestantes < 0) return 'gris';
  if(diasRestantes <= 2) return 'rojo';
  if(diasRestantes <= 5) return 'naranja';
  return 'verde';
}

export function etiquetaCuentaRegresiva(diasRestantes){
  if(diasRestantes === null || diasRestantes === undefined) return '—';
  if(diasRestantes < 0) return 'Vencido';
  if(diasRestantes === 0) return 'Hoy';
  return diasRestantes === 1 ? 'Falta 1 día hábil' : `Faltan ${diasRestantes} días hábiles`;
}
