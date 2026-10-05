import { normalize, temasParaPrestacion } from './graph';
import { DEPARTAMENTOS_COLOMBIA, municipiosDe } from './colombiaGeo';

// Listas fijas de "Nueva tutela" — viven acá (y no dentro de TutelaDrawer)
// para que el formulario Y el limpiador del borrador de LexIA usen SIEMPRE
// exactamente las mismas opciones (2026-10-05, revisión pedida por el
// usuario: "que no cree conflictos por formatos/errores de listas").
export const SI_NO = ["Sí", "No"];
// Listas fijas confirmadas por el usuario 2026-08-18.
export const TIPO_VINCULACION_OPCIONES = ["Accionada", "Vinculada"];
export const PRESTACION_OPCIONES = ["Asistencial", "Económica", "Administrativa"];
export const TIPO_RESPUESTA_OPCIONES = ["ACLARACION", "ALCANCE", "APLAZAMIENTO", "CUMPLIMIENTO FALLO", "CORRECION", "IMPUGNACION", "MODULACION", "NULIDAD", "REQUERIMIENTO", "TUTELA"];
// Nombre exacto histórico del valor por defecto (Entidad en Tutelas casi
// solo maneja este valor, pedido explícito del usuario 2026-08-28).
export const ENTIDAD_DEFECTO = "GRUPO COLMEDICA";
export const ENTIDAD_OPCIONES_TUTELAS = [ENTIDAD_DEFECTO];
export const CLIENTE_OPCIONES_TUTELAS = ["COLMEDICA MEDICINA PREPAGADA S.A.", "ALIANSALUD ENTIDAD PROMOTORA DE SALUD S.A.", "UNIDAD MÉDICA Y DE DIAGNÓSTICO S.A."];

// Clave de comparación tolerante: sin tildes, sin mayúsculas, sin puntuación
// ni espacios de más ("Bogotá, D.C." == "BOGOTA D.C." == "bogotadc").
function clave(v){
  return normalize(String(v ?? "")).replace(/[^a-z0-9]/g, "");
}

// Devuelve la opción OFICIAL de la lista que corresponde a `valor` (o "" si
// no hay una coincidencia clara) — nunca devuelve un texto que no esté en la
// lista. Con `parcial`, si no hay coincidencia exacta acepta una única opción
// que empiece igual (o que el valor empiece como ella): cubre casos como
// "COLMEDICA MEDICINA PREPAGADA" sin el "S.A." del final.
function opcionOficial(valor, opciones, parcial = false){
  const k = clave(valor);
  if(!k) return "";
  const exacta = opciones.find(o => clave(o) === k);
  if(exacta) return exacta;
  if(parcial && k.length >= 8){
    const candidatas = opciones.filter(o => clave(o).startsWith(k) || k.startsWith(clave(o)));
    if(candidatas.length === 1) return candidatas[0];
  }
  return "";
}

function siNo(valor){
  const v = normalize(String(valor ?? "")).trim();
  if(["si", "s", "yes", "true", "1"].includes(v)) return "Sí";
  if(["no", "n", "false", "0"].includes(v)) return "No";
  return "";
}

// Fecha ISO "aaaa-mm-dd" real (valida que exista en el calendario) — acepta
// también "dd/mm/aaaa" o "dd-mm-aaaa" (formato colombiano). Cualquier otra
// cosa queda vacía: un <input type="date"> la mostraría en blanco PERO el
// formulario la guardaría igual, y SharePoint rechaza una fecha inválida.
function fechaISO(valor){
  const s = String(valor ?? "").trim();
  if(!s) return "";
  let y, m, d, r;
  if((r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))){ y = +r[1]; m = +r[2]; d = +r[3]; }
  else if((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s))){ d = +r[1]; m = +r[2]; y = +r[3]; }
  else return "";
  const f = new Date(Date.UTC(y, m - 1, d));
  if(f.getUTCFullYear() !== y || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function limpiarTexto(valor){
  // eslint-disable-next-line no-control-regex
  return String(valor ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\s+/g, " ").trim();
}

// "Solicita" es una columna de texto ENRIQUECIDO: el editor la carga como
// HTML (innerHTML). Lo que devuelve LexIA es texto plano sacado de un correo
// externo — si se pasaba tal cual, un "<" o "&" del texto rompía el formato
// y, peor, cualquier etiqueta HTML escrita en el correo se ejecutaba/pegaba
// como HTML real en el editor y en SharePoint. Se escapa SIEMPRE y los saltos
// de línea pasan a párrafos (<p>) / <br>.
function textoPlanoAHtml(texto){
  const s = String(texto ?? "").replace(/\r\n?/g, "\n").trim();
  if(!s) return "";
  const esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return s.split(/\n{2,}/).map(p => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
}

function numeroTutelaLimpio(valor){
  // Quita separadores de miles ("28.159") y toma el primer número de 4 a 6
  // dígitos — un radicado judicial largo (18+ dígitos) NO es el número corto.
  const s = String(valor ?? "").replace(/(\d)[.,](\d{3})(?!\d)/g, "$1$2");
  const m = /\d{4,6}/.exec(s);
  return m && !/\d{7,}/.test(s) ? m[0] : "";
}

function procesoCorto(valor){
  // Formato oficial "aaaa-nnnnn" — si viene dentro de un radicado completo
  // (23-001-40-03-003-2026-00942-00) se saca solo esa parte.
  const m = /((?:19|20)\d{2})\s*-\s*(\d{5})(?!\d)/.exec(String(valor ?? ""));
  return m ? `${m[1]}-${m[2]}` : "";
}

function correoLimpio(valor){
  const m = /[\w.+'-]+@[\w-]+(?:\.[\w-]+)+/.exec(String(valor ?? ""));
  return m ? m[0].toLowerCase() : "";
}

function identificacionLimpia(valor){
  const s = limpiarTexto(valor);
  // Una cédula escrita con puntos/comas/espacios ("51.640.157") se guarda
  // solo con dígitos; cualquier otro texto se deja como vino.
  return /^[\d.,\s]+$/.test(s) ? s.replace(/[^\d]/g, "") : s;
}

function departamentoOficial(valor){
  const k = clave(valor);
  if(!k) return "";
  const exacto = DEPARTAMENTOS_COLOMBIA.find(d => clave(d) === k);
  if(exacto) return exacto;
  if(k.startsWith("bogota")) return "Bogotá D.C.";
  return "";
}

/**
 * Limpia el registro que extrajo LexIA ANTES de abrir "Nueva tutela" para
 * que nada de lo que traiga choque al guardar en SharePoint (2026-10-05,
 * revisión pedida por el usuario). Reglas:
 *  - Todo campo de lista (Entidad, Cliente, Tipo vinculación, Prestación,
 *    Tipo respuesta, Departamento, Ciudad, Tema) queda con una opción OFICIAL
 *    de su lista o vacío — nunca un texto "huérfano" (los campos Cliente/
 *    Entidad son columnas de Búsqueda: un valor que no existe CREARÍA un
 *    registro basura nuevo en la lista de origen al guardar).
 *  - Sí/No siempre exactamente "Sí" o "No" (un "Si" sin tilde se guardaba
 *    como "No" en silencio).
 *  - Fechas reales en aaaa-mm-dd, o vacías.
 *  - No. Tutela solo dígitos (columna numérica), Proceso en aaaa-nnnnn.
 *  - Solicita convertido a HTML seguro.
 *  - Se descarta cualquier otra clave (p.ej. el marcador interno `_creado`).
 * Devuelve `{ campos, avisos }`: `avisos` lista, en español, lo que se dejó
 * vacío o se corrigió para que el usuario lo revise.
 */
export function normalizarBorradorTutela(registro, { temas = [], numeroAsunto = null } = {}){
  const r = registro || {};
  const avisos = [];
  const c = {};

  const noTutela = numeroTutelaLimpio(r.NoTutela);
  const delAsunto = numeroAsunto ? String(numeroAsunto) : "";
  if(noTutela && delAsunto && noTutela !== delAsunto){
    c.NoTutela = delAsunto;
    avisos.push(`LexIA leyó la tutela ${noTutela} pero el asunto del correo dice ${delAsunto} — se dejó ${delAsunto}.`);
  } else {
    c.NoTutela = noTutela || delAsunto;
    if(!c.NoTutela) avisos.push("No. Tutela (no se encontró un número corto válido)");
  }

  c.Entidad = opcionOficial(r.Entidad, ENTIDAD_OPCIONES_TUTELAS, true) || ENTIDAD_DEFECTO;
  c.Cliente = opcionOficial(r.Cliente, CLIENTE_OPCIONES_TUTELAS, true);
  if(!c.Cliente && limpiarTexto(r.Cliente)) avisos.push(`Cliente (LexIA puso "${limpiarTexto(r.Cliente)}", que no está en la lista)`);
  c.TipoVinculacionEntidad = opcionOficial(r.TipoVinculacionEntidad, TIPO_VINCULACION_OPCIONES);
  c.Prestacion = opcionOficial(r.Prestacion, PRESTACION_OPCIONES);
  if(!c.Prestacion && limpiarTexto(r.Prestacion)) avisos.push(`Prestación (LexIA puso "${limpiarTexto(r.Prestacion)}")`);
  c.TipoRespuesta = opcionOficial(r.TipoRespuesta, TIPO_RESPUESTA_OPCIONES);
  if(!c.TipoRespuesta && limpiarTexto(r.TipoRespuesta)) avisos.push(`Tipo Respuesta (LexIA puso "${limpiarTexto(r.TipoRespuesta)}")`);

  // Tema: solo de los que existen para esa Prestación (mismo criterio del
  // desplegable del formulario).
  const temaTexto = limpiarTexto(r.Tema);
  c.Tema = c.Prestacion ? opcionOficial(temaTexto, temasParaPrestacion(temas, c.Prestacion)) : "";
  if(!c.Tema && temaTexto) avisos.push(`Tema (LexIA sugirió "${temaTexto}", que no está en la lista de ${c.Prestacion || "la Prestación"} — elígelo o créalo con el botón "Tema")`);

  let departamento = departamentoOficial(r.Departamento);
  let ciudad = "";
  const ciudadTexto = limpiarTexto(r.Ciudad);
  if(ciudadTexto){
    const buscarEn = departamento ? [departamento] : DEPARTAMENTOS_COLOMBIA;
    const hallazgos = [];
    buscarEn.forEach(dep => {
      const m = municipiosDe(dep).find(x => clave(x) === clave(ciudadTexto));
      if(m) hallazgos.push({ dep, m });
    });
    if(hallazgos.length === 1){ ciudad = hallazgos[0].m; if(!departamento) departamento = hallazgos[0].dep; }
  }
  c.Departamento = departamento;
  c.Ciudad = ciudad;
  if(limpiarTexto(r.Departamento) && !departamento) avisos.push(`Departamento (LexIA puso "${limpiarTexto(r.Departamento)}")`);
  if(ciudadTexto && !ciudad) avisos.push(`Ciudad (LexIA puso "${ciudadTexto}")`);

  c.MedidaCautelar = siNo(r.MedidaCautelar);
  c.AgenciaOficiosa = siNo(r.AgenciaOficiosa);

  c.FechaNotificacion = fechaISO(r.FechaNotificacion);
  c.FechaVencimiento = fechaISO(r.FechaVencimiento);
  if(limpiarTexto(r.FechaNotificacion) && !c.FechaNotificacion) avisos.push("Fecha Notificación (formato no válido)");
  if(limpiarTexto(r.FechaVencimiento) && !c.FechaVencimiento) avisos.push("Fecha Vencimiento (formato no válido)");

  c.Proceso = procesoCorto(r.Proceso);
  if(limpiarTexto(r.Proceso) && !c.Proceso) avisos.push(`Proceso (LexIA puso "${limpiarTexto(r.Proceso)}", no tiene el formato aaaa-nnnnn)`);

  c.Juzgado = limpiarTexto(r.Juzgado);
  c.Usuario = limpiarTexto(r.Usuario);
  c.NoIdentificacion = identificacionLimpia(r.NoIdentificacion);
  c.Correo = correoLimpio(r.Correo);
  c.Solicita = textoPlanoAHtml(r.Solicita);

  return { campos: c, avisos };
}
