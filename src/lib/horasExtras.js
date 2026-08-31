// "Horas Extras" (Administración) — agregado 2026-08-31, pedido explícito
// del usuario, con la normatividad laboral colombiana real (confirmada por
// el usuario con fuente: https://www.gerencie.com/horas-extras-y-recargos-nocturnos-dominicales-y-festivos.html):
//   - Diurna: 6:00 a. m. – 7:00 p. m.
//   - Nocturna: 7:00 p. m. – 6:00 a. m.
// El usuario pidió explícitamente NO calcular valores en pesos, solo la
// CANTIDAD de horas por tipo (Diurnas/Nocturnas/Diurnas Festivas/Nocturnas
// Festivas) — así que acá no hay ningún factor de recargo (25%/75%/etc.),
// solo la clasificación por horario + festivo/domingo.
// Ver [[project_horas_extras]].
import { prepararDocumentoPDF, dibujarResumenBox, VERDE_OSCURO, GRIS_SUAVE, TEXTO, BORDE_SUAVE, GRIS_ZEBRA, MARGEN, CONTENIDO_Y_INICIAL, CONTENIDO_Y_MAXIMO } from './informesPDF';

export const MESES_NOMBRES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const HORA_DIURNA_INICIO = 6;
const HORA_DIURNA_FIN = 19; // 7:00 p.m.

// --- Festivos de Colombia (calculados, no cargados a mano) ---
// Algoritmo de Meeus/Jones/Butcher para el Domingo de Pascua — estándar,
// válido para el calendario gregoriano (cualquier año que use esta app).
function domingoDePascua(anio){
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19*a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2*e + 2*i - h - k) % 7;
  const m = Math.floor((a + 11*h + 22*l) / 451);
  const mes = Math.floor((h + l - 7*m + 114) / 31); // 3=marzo, 4=abril
  const dia = ((h + l - 7*m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}
function fmtISO(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function sumarDias(d, dias){
  const d2 = new Date(d);
  d2.setDate(d2.getDate() + dias);
  return d2;
}
// "Ley Emiliani" — los festivos trasladables se corren al lunes siguiente si
// no cayeron ya en lunes.
function alLunesSiguiente(d){
  const dia = d.getDay(); // 0=domingo..6=sábado
  if(dia === 1) return d;
  const agregar = (1 - dia + 7) % 7;
  return sumarDias(d, agregar);
}

const _festivosCache = new Map();
export function festivosColombia(anio){
  if(_festivosCache.has(anio)) return _festivosCache.get(anio);
  const set = new Set();
  // Fijos (no se corren de fecha)
  [[0,1],[4,1],[6,20],[7,7],[11,8],[11,25]].forEach(([m,d]) => set.add(fmtISO(new Date(anio,m,d))));
  // Trasladables al lunes siguiente
  [[0,6],[2,19],[5,29],[7,15],[9,12],[10,1],[10,11]].forEach(([m,d]) => set.add(fmtISO(alLunesSiguiente(new Date(anio,m,d)))));
  // Basados en el Domingo de Pascua
  const pascua = domingoDePascua(anio);
  set.add(fmtISO(sumarDias(pascua, -3))); // Jueves Santo
  set.add(fmtISO(sumarDias(pascua, -2))); // Viernes Santo
  set.add(fmtISO(alLunesSiguiente(sumarDias(pascua, 39))));  // Ascensión del Señor
  set.add(fmtISO(alLunesSiguiente(sumarDias(pascua, 60))));  // Corpus Christi
  set.add(fmtISO(alLunesSiguiente(sumarDias(pascua, 68))));  // Sagrado Corazón de Jesús
  _festivosCache.set(anio, set);
  return set;
}
export function esFestivoODomingo(fechaISO){
  const [y,m,d] = String(fechaISO).split('-').map(Number);
  if(!y || !m || !d) return false;
  const date = new Date(y, m-1, d);
  if(date.getDay() === 0) return true;
  return festivosColombia(y).has(fechaISO);
}

function parseHora(hhmm){
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm||"").trim());
  if(!m) return null;
  return Number(m[1]) + Number(m[2])/60;
}

// Reparte un tramo [inicio,fin) (en horas, dentro de un mismo día, 0-24) en
// horas diurnas (6-19) y nocturnas (0-6 y 19-24).
function diurnasNocturnas(inicio, fin){
  let diurnas = 0, nocturnas = 0;
  const dIni = Math.max(inicio, HORA_DIURNA_INICIO), dFin = Math.min(fin, HORA_DIURNA_FIN);
  if(dFin > dIni) diurnas += dFin - dIni;
  const n1Ini = Math.max(inicio, 0), n1Fin = Math.min(fin, HORA_DIURNA_INICIO);
  if(n1Fin > n1Ini) nocturnas += n1Fin - n1Ini;
  const n2Ini = Math.max(inicio, HORA_DIURNA_FIN), n2Fin = Math.min(fin, 24);
  if(n2Fin > n2Ini) nocturnas += n2Fin - n2Ini;
  return { diurnas, nocturnas };
}
function redondear(n){ return Math.round(n * 100) / 100; }

// Clasifica un turno de hora extra en las 4 categorías reales. Si el turno
// cruza la medianoche (HoraFin menor que HoraInicio), el pedazo que cae en
// el día siguiente se evalúa con SU PROPIO festivo/domingo (puede ser
// distinto al del día en que empezó — ej: empieza 11pm 24-dic, termina 1am
// 25-dic, Navidad).
export function clasificarHorasExtra(fechaISO, horaInicioStr, horaFinStr){
  const vacio = { HorasDiurnas:0, HorasNocturnas:0, HorasDiurnasFestivas:0, HorasNocturnasFestivas:0 };
  const inicio = parseHora(horaInicioStr);
  let fin = parseHora(horaFinStr);
  if(inicio == null || fin == null) return vacio;
  if(fin <= inicio) fin += 24; // cruzó medianoche

  const [y,m,d] = String(fechaISO).split('-').map(Number);
  if(!y || !m || !d) return vacio;
  const fechaSiguienteISO = fmtISO(sumarDias(new Date(y,m-1,d), 1));
  const festivoHoy = esFestivoODomingo(fechaISO);
  const festivoManana = esFestivoODomingo(fechaSiguienteISO);

  const out = { ...vacio };
  const finDia1 = Math.min(fin, 24);
  if(finDia1 > inicio){
    const { diurnas, nocturnas } = diurnasNocturnas(inicio, finDia1);
    if(festivoHoy){ out.HorasDiurnasFestivas += diurnas; out.HorasNocturnasFestivas += nocturnas; }
    else { out.HorasDiurnas += diurnas; out.HorasNocturnas += nocturnas; }
  }
  if(fin > 24){
    const { diurnas, nocturnas } = diurnasNocturnas(0, fin - 24);
    if(festivoManana){ out.HorasDiurnasFestivas += diurnas; out.HorasNocturnasFestivas += nocturnas; }
    else { out.HorasDiurnas += diurnas; out.HorasNocturnas += nocturnas; }
  }
  out.HorasDiurnas = redondear(out.HorasDiurnas);
  out.HorasNocturnas = redondear(out.HorasNocturnas);
  out.HorasDiurnasFestivas = redondear(out.HorasDiurnasFestivas);
  out.HorasNocturnasFestivas = redondear(out.HorasNocturnasFestivas);
  return out;
}

export function filtrarHorasExtrasPorMes(horasExtras, anio, mesIndex0, soloAprobadas = true){
  return (horasExtras||[]).filter(h => {
    if(soloAprobadas && !h.Aprobado) return false;
    const [y,m] = String(h.Fecha||"").split('-').map(Number);
    return y === anio && (m-1) === mesIndex0;
  });
}

const ORDEN_TIPOS = ["Diurnas","Nocturnas","Diurnas Festivas","Nocturnas Festivas"];
const PALETA_TIPOS = { "Diurnas":"#ef7d00", "Nocturnas":"#1d5fa3", "Diurnas Festivas":"#a3281c", "Nocturnas Festivas":"#004941" };
export function colorDeTipoHoraExtra(tipo){ return PALETA_TIPOS[tipo] || "#5c6b68"; }

// Agrupa Colaborador -> {Diurnas,Nocturnas,Diurnas Festivas,Nocturnas
// Festivas}, ya filtradas por mes (ver filtrarHorasExtrasPorMes) — misma
// forma {grupos:[{colaborador,filas:[{tipoRespuesta,total}],totalColaborador}],
// totalGeneral} que agruparPorAbogado, para reusar StackedBarChart tal cual
// (labelKey="colaborador" totalKey="totalColaborador").
export function agruparPorColaborador(horasExtrasDelMes){
  const porColaborador = new Map();
  (horasExtrasDelMes||[]).forEach(h => {
    const nombre = (h.Colaborador||"").trim() || "Sin colaborador";
    if(!porColaborador.has(nombre)) porColaborador.set(nombre, {"Diurnas":0,"Nocturnas":0,"Diurnas Festivas":0,"Nocturnas Festivas":0});
    const g = porColaborador.get(nombre);
    g["Diurnas"] += Number(h.HorasDiurnas)||0;
    g["Nocturnas"] += Number(h.HorasNocturnas)||0;
    g["Diurnas Festivas"] += Number(h.HorasDiurnasFestivas)||0;
    g["Nocturnas Festivas"] += Number(h.HorasNocturnasFestivas)||0;
  });
  const nombres = Array.from(porColaborador.keys()).sort((a,b)=>a.localeCompare(b));
  let totalGeneral = 0;
  const grupos = nombres.map(colaborador => {
    const g = porColaborador.get(colaborador);
    const filas = ORDEN_TIPOS.filter(t => g[t] > 0).map(t => ({ tipoRespuesta: t, total: redondear(g[t]) }));
    const totalColaborador = redondear(filas.reduce((s,f) => s+f.total, 0));
    totalGeneral += totalColaborador;
    return { colaborador, filas, totalColaborador };
  });
  return { grupos, totalGeneral: redondear(totalGeneral) };
}

function fmtHoras(n){
  const v = redondear(n||0);
  return `${v.toLocaleString('es-CO', {minimumFractionDigits: v % 1 === 0 ? 0 : 1, maximumFractionDigits: 2})} horas`;
}

// PDF — un bloque por Colaborador (barra de título verde + lista de tipos
// con horas, igual estilo que dibujarSeccion en informeTutelas.js), cierre
// con el total general. Solo cuenta horas YA APROBADAS (ver
// filtrarHorasExtrasPorMes/agruparPorColaborador).
export async function generarPDFHorasExtras(horasExtras, anio, mesIndex0){
  const horasDelMes = filtrarHorasExtrasPorMes(horasExtras, anio, mesIndex0, true);
  const { grupos, totalGeneral } = agruparPorColaborador(horasDelMes);

  const { doc, pageWidth, fecha, dibujarEncabezadoYPie, numerarPaginas } = await prepararDocumentoPDF('Relación de Horas Extras');
  dibujarEncabezadoYPie();
  let y = CONTENIDO_Y_INICIAL;

  doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(...TEXTO);
  doc.text(`Bogotá D.C., ${fecha}`, MARGEN, y); y += 9;

  y = dibujarResumenBox(doc, MARGEN, y, pageWidth - MARGEN*2, [
    { label:'Mes', value: `${MESES_NOMBRES[mesIndex0]} ${anio}` },
    { label:'Colaboradores', value: grupos.length },
    { label:'Total horas aprobadas', value: fmtHoras(totalGeneral) },
  ]) + 10;

  if(!grupos.length){
    doc.setFont('helvetica','italic'); doc.setFontSize(10); doc.setTextColor(...GRIS_SUAVE);
    doc.text('No hay horas extras aprobadas para este mes.', MARGEN, y);
  }

  grupos.forEach(g => {
    const altoBloque = 8 + g.filas.length * 7 + 3;
    if(y + altoBloque > CONTENIDO_Y_MAXIMO){
      doc.addPage();
      dibujarEncabezadoYPie();
      y = CONTENIDO_Y_INICIAL;
    }
    doc.setFillColor(...VERDE_OSCURO);
    doc.rect(MARGEN, y, pageWidth - MARGEN*2, 7, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(255);
    doc.text(g.colaborador, MARGEN + 2, y + 5);
    doc.text(fmtHoras(g.totalColaborador), pageWidth - MARGEN - 2, y + 5, {align:'right'});
    y += 7;
    g.filas.forEach((f, i) => {
      doc.setFillColor(...(i % 2 ? GRIS_ZEBRA : [255,255,255]));
      doc.rect(MARGEN, y, pageWidth - MARGEN*2, 7, 'F');
      doc.setDrawColor(...BORDE_SUAVE); doc.setLineWidth(0.15);
      doc.rect(MARGEN, y, pageWidth - MARGEN*2, 7, 'S');
      doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...TEXTO);
      doc.text(f.tipoRespuesta, MARGEN + 4, y + 4.8);
      doc.text(fmtHoras(f.total), pageWidth - MARGEN - 4, y + 4.8, {align:'right'});
      y += 7;
    });
    y += 5;
  });

  numerarPaginas();
  const hoyISO = new Date().toISOString().slice(0,10);
  doc.save(`Horas Extras - ${MESES_NOMBRES[mesIndex0]} ${anio} - ${hoyISO}.pdf`);
}
