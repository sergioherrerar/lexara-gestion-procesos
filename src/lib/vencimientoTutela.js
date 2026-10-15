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

// Hora ("HH:MM", 24 h) en Colombia de un instante ISO, o "".
export function horaLocalHHMM(valor){
  const d = new Date(valor);
  if(!valor || isNaN(d.getTime())) return "";
  return d.toLocaleTimeString('en-GB', { timeZone: 'America/Bogota', hour12: false, hour: '2-digit', minute: '2-digit' });
}

// Horario hábil judicial: lunes a viernes de 8:00 a. m. a 5:00 p. m. (pedido
// explícito del usuario 2026-10-05). Una notificación que llega DESPUÉS de las
// 5:00 p. m., o en sábado/domingo/festivo, se entiende notificada por el
// juzgado el siguiente día hábil — esa es la fecha de notificación que cuenta
// para el término (el día de la notificación, como siempre, no se cuenta).
export const HORA_CIERRE_HABIL = "17:00";

// { fecha, ajustada, motivo } — fecha efectiva de notificación de algo que
// llegó el `fechaISO` a la `hhmm`.
export function fechaNotificacionEfectiva(fechaISO_, hhmm){
  const fecha = fechaISO(fechaISO_);
  if(!fecha) return { fecha: "", ajustada: false, motivo: "" };
  const noHabil = motivoDiaNoHabil(fecha);
  const tarde = /^\d{2}:\d{2}$/.test(hhmm || "") && hhmm > HORA_CIERRE_HABIL;
  if(!noHabil && !tarde) return { fecha, ajustada: false, motivo: "" };
  const efectiva = sumarDiasHabilesJudiciales(fecha, 1);
  const motivo = noHabil ? `llegó en ${noHabil}` : `llegó a las ${hhmm}, después del cierre hábil (${HORA_CIERRE_HABIL})`;
  return { fecha: efectiva, ajustada: true, motivo };
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

// "aaaa-mm-dd HH:MM" (o solo "aaaa-mm-dd") válido o { fecha: "", hora: "" }.
function fechaHoraDeTexto(valor){
  const s = String(valor ?? "").trim();
  const f = fechaISO(s);
  if(!f) return { fecha: "", hora: "" };
  const h = /[T ](\d{1,2}):(\d{2})/.exec(s);
  return { fecha: f, hora: h ? `${String(+h[1]).padStart(2, "0")}:${h[2]}` : "" };
}

function sumarDiasCalendario(iso, n){
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(y, m - 1, d + n);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
}

// Si la fecha cae en día no hábil (sábado, domingo o festivo), el primer día hábil siguiente (Ley de Desconexión Laboral).
function primerDiaHabilDesde(iso){
  let f = iso;
  while(motivoDiaNoHabil(f)) f = sumarDiasCalendario(f, 1);
  return f;
}

const esSi = v => /^(s[ií]|si|true|1)$/i.test(String(v ?? "").trim());

/**
 * Notificación y vencimiento de una tutela leída por LexIA — regla del despacho (2026-10-15): son DOS fechas distintas.
 *  1. FechaNotificacion (la del registro en el portal): el día en que el ÁREA JURÍDICA (Gabriela, Yessica o Dania) notificó la tutela, es decir la del
 *     primer correo de los remitentes permitidos. NO se le aplica el horario hábil: se toma el día tal cual (un viernes a las 8:00 p. m. queda ese
 *     viernes; la hora queda en HoraNotificacion).
 *  2. FechaVencimiento: se cuenta desde el momento en que el JUZGADO de la traza del correo lo remitió (EnvioJuzgado, "aaaa-mm-dd HH:MM"), con el horario
 *     hábil: si el juzgado lo envió después de las 5:00 p. m. o en día no hábil, la notificación se entiende surtida el día hábil siguiente y el término
 *     corre desde el día siguiente a esa notificación (viernes 8 p. m. → surtida el lunes; 1 día hábil → vence el martes). Si el juzgado dice expresamente
 *     que el término es en días calendario (TerminoCalendario = "Sí") se cuentan días calendario, y si el vencimiento cae en día no hábil pasa al primer
 *     día hábil siguiente. Si no se conoce el envío del juzgado, se usa la hora del correo del área (y se avisa).
 *
 * `fechaCorreoISO` / `instanteCorreo` son la fecha y el instante del primer correo del área. `opciones.envioJuzgado` es el envío leído de la traza
 * ("aaaa-mm-dd HH:MM"); si no viene, se usa el que traiga el registro (leído por LexIA o guardado antes). Devuelve `{ registro, avisos }`.
 */
export function aplicarVencimientoHabil(registro, fechaCorreoISO, instanteCorreo, opciones = {}){
  const r = { ...(registro || {}) };
  const avisos = [];
  const dias = parseInt(String(r.DiasTermino ?? "").replace(/\D/g, ""), 10);
  const calendario = esSi(r.TerminoCalendario);
  let notificacion = fechaISO(r.FechaNotificacion);
  const vencimientoActual = fechaISO(r.FechaVencimiento);
  const horaCorreo = horaLocalHHMM(instanteCorreo);
  const fechaDelCorreo = fechaISO(fechaCorreoISO);
  // Regla del usuario (2026-10-07): la fecha de notificación es la del PRIMER correo de los remitentes
  // permitidos (el área jurídica), aunque los documentos digan otra fecha.
  if(opciones.forzarFechaCorreo && fechaDelCorreo){
    if(notificacion && notificacion !== fechaDelCorreo){
      avisos.push(`Fecha Notificación: los documentos decían ${notificacion}; se usó la del primer correo del área (${fechaDelCorreo})`);
    }
    notificacion = fechaDelCorreo;
    r.FechaNotificacion = fechaDelCorreo;
  }
  if(!notificacion && dias >= 1 && fechaDelCorreo){
    notificacion = fechaDelCorreo;
    avisos.push(`Fecha Notificación: LexIA no la encontró, se usó el día en que llegó el correo (${notificacion})`);
    r.FechaNotificacion = notificacion;
  }
  // La hora de la notificación del área se guarda aparte (no se ajusta al horario hábil).
  if(notificacion && fechaDelCorreo && notificacion === fechaDelCorreo && horaCorreo) r.HoraNotificacion = horaCorreo;

  // Envío del juzgado: el de la traza (opciones), el que traiga el registro o, a falta de ambos, el correo del área.
  const envio = fechaHoraDeTexto(opciones.envioJuzgado || r.EnvioJuzgado);
  let base = { fecha: "", hora: "" };
  let origenBase = "";
  if(envio.fecha){
    base = envio;
    origenBase = "juzgado";
    r.EnvioJuzgado = envio.hora ? `${envio.fecha} ${envio.hora}` : envio.fecha;
  }else if(notificacion){
    base = { fecha: notificacion, hora: notificacion === fechaDelCorreo ? horaCorreo : "" };
    origenBase = "area";
  }
  let surtida = "";
  if(base.fecha){
    const ef = fechaNotificacionEfectiva(base.fecha, base.hora);
    surtida = ef.fecha || base.fecha;
    r.NotificacionSurtida = surtida;
    if(origenBase === "area" && dias >= 1) avisos.push(`Vencimiento: no encontré en la traza del correo la fecha en que el juzgado lo remitió; el término se contó desde el correo del área (${base.fecha}${base.hora ? " " + base.hora : ""}) — revisa la fecha de envío del juzgado`);
    if(ef.ajustada) avisos.push(`Notificación surtida: ${origenBase === "juzgado" ? "el correo del juzgado" : "el correo"} ${ef.motivo}; se entiende notificada el ${ef.fecha}, y el término corre desde el día siguiente`);
  }
  if(dias >= 1 && dias <= 60 && surtida){
    let calculado;
    if(calendario){
      calculado = sumarDiasCalendario(surtida, dias);
      const habil = primerDiaHabilDesde(calculado);
      if(habil !== calculado) avisos.push(`Vencimiento: ${calculado} cae en día no hábil (${motivoDiaNoHabil(calculado)}); se pasa al primer día hábil siguiente, ${habil}`);
      calculado = habil;
    }else{
      calculado = sumarDiasHabilesJudiciales(surtida, dias);
    }
    if(calculado !== vencimientoActual){
      avisos.push(`Vencimiento: ${dias} día${dias === 1 ? "" : "s"} ${calendario ? "calendario" : "hábil" + (dias === 1 ? "" : "es")} desde la notificación surtida el ${surtida} = ${calculado}${calendario ? "" : " (sin sábados, domingos ni festivos de Colombia)"}${vencimientoActual ? `; LexIA había puesto ${vencimientoActual}` : ""}`);
    }
    r.FechaVencimiento = calculado;
  } else if(vencimientoActual){
    const motivo = motivoDiaNoHabil(vencimientoActual);
    if(motivo) avisos.push(`El vencimiento ${vencimientoActual} cae en ${motivo} — revisa que la fecha sea la correcta`);
  }
  return { registro: r, avisos };
}
