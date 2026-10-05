// Vencimiento de una tutela leída por LexIA (2026-10-06, pedido explícito del
// usuario: "cuando LexIA lea la información y tome los días de vencimiento de
// la tutela, estos deben ser días hábiles — no sábados, no domingos, no
// festivos; verifica los festivos en Colombia"). Antes LexIA devolvía la
// "FechaVencimiento" ya calculada por Claude — un modelo de lenguaje sumando
// días a ojo, sin calendario de festivos, falla justo en esto. Ahora LexIA
// solo lee el NÚMERO de días que otorga el juez (`DiasTermino`) y la fecha
// de notificación; el portal calcula la fecha con el mismo conteo y el mismo
// calendario de festivos de Colombia que ya usa Audiencias/Términos
// (lunes a viernes, sin festivos; el día de la notificación no cuenta como
// día 1).
import { sumarDiasHabilesJudiciales, esDiaHabilJudicial } from './audienciasTerminos';
import { nombresFestivosColombia } from './horasExtras';

// "aaaa-mm-dd" real (valida que exista en el calendario) o "" — acepta
// también dd/mm/aaaa o dd-mm-aaaa.
function fechaISO(valor){
  const s = String(valor ?? "").trim();
  let y, m, d, r;
  if((r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))){ y = +r[1]; m = +r[2]; d = +r[3]; }
  else if((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s))){ d = +r[1]; m = +r[2]; y = +r[3]; }
  else return "";
  const f = new Date(Date.UTC(y, m - 1, d));
  if(f.getUTCFullYear() !== y || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Fecha ("aaaa-mm-dd") en Colombia de un instante ISO como el receivedDateTime
// de Graph, que viene en UTC — un correo de las 8 p. m. en Bogotá llega ya
// como el día siguiente en UTC.
export function fechaLocalISO(valor){
  const d = new Date(valor);
  if(!valor || isNaN(d.getTime())) return "";
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

const DIAS_SEMANA =["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Por qué una fecha NO es día hábil ("sábado", "domingo", "festivo: Día de la
// Raza") o "" si sí lo es.
export function motivoDiaNoHabil(iso){
  if(!iso || esDiaHabilJudicial(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  if(dow === 0 || dow === 6) return DIAS_SEMANA[dow];
  return `festivo (${nombresFestivosColombia(y).get(iso) || "Colombia"})`;
}

/**
 * Corrige el vencimiento de un registro extraído por LexIA. `fechaCorreoISO`
 * (opcional) es el día en que llegó el correo, que se usa como fecha de
 * notificación si LexIA no encontró una. Devuelve `{ registro, avisos }`:
 *  - Con `DiasTermino` (días que otorga el juez) y una fecha de
 *    notificación: FechaVencimiento = esa fecha + N días hábiles (sin
 *    sábados, domingos ni festivos de Colombia), sin importar lo que haya
 *    puesto LexIA.
 *  - Sin `DiasTermino` (el despacho dio una fecha concreta): se respeta la
 *    fecha, pero se avisa si cae en sábado, domingo o festivo.
 */
export function aplicarVencimientoHabil(registro, fechaCorreoISO){
  const r = { ...(registro || {}) };
  const avisos = [];
  const dias = parseInt(String(r.DiasTermino ?? "").replace(/\D/g, ""), 10);
  let notificacion = fechaISO(r.FechaNotificacion);
  const vencimientoActual = fechaISO(r.FechaVencimiento);
  if(!notificacion && dias >= 1 && fechaISO(fechaCorreoISO)){
    notificacion = fechaISO(fechaCorreoISO);
    avisos.push(`Fecha Notificación: LexIA no la encontró, se usó el día en que llegó el correo (${notificacion})`);
    r.FechaNotificacion = notificacion;
  }
  if(dias >= 1 && dias <= 60 && notificacion){
    const calculado = sumarDiasHabilesJudiciales(notificacion, dias);
    if(calculado !== vencimientoActual){
      avisos.push(`Vencimiento: ${dias} día${dias === 1 ? "" : "s"} hábil${dias === 1 ? "" : "es"} desde ${notificacion} = ${calculado} (sin sábados, domingos ni festivos de Colombia)${vencimientoActual ? `; LexIA había puesto ${vencimientoActual}` : ""}`);
    }
    r.FechaVencimiento = calculado;
  } else if(vencimientoActual){
    const motivo = motivoDiaNoHabil(vencimientoActual);
    if(motivo) avisos.push(`El vencimiento ${vencimientoActual} cae en ${motivo} — revisa que la fecha sea la correcta`);
  }
  return { registro: r, avisos };
}
