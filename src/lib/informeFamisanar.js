// Generador de los informes formales de la Entidad "Famisanar": Excel + PDF.
// Segunda Entidad con modelo propio (después de SOS, ver informeSOS.js) —
// mismo criterio: nunca inventar columnas, calcar la plantilla real que el
// usuario compartió ("Informe Famisanar *.xlsx", hoja "Famisanar", leída con
// exceljs vía un script de Node para sacar columnas/anchos/formato exactos).
// Ver CHANGELOG 2026-08-16 y [[project_informes_modulo]].
import { stripHtml, parseMonto, fmtMonto } from './graph';
import { generarCartaInformePDF, fechaLarga, fechaCorta, VERDE_OSCURO, GRIS_SUAVE } from './informesPDF';

const COLOR_ENCABEZADO = "FF004941"; // var(--verde-oscuro), mismo verde institucional de siempre.

function fechaISOaExcel(iso){
  if(!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if(!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}

// [columna Excel, campo interno de la app, tipo]. El orden ES el orden de
// columnas del Excel real (empieza en la columna B — la A queda en blanco,
// igual que en la plantilla).
const COLUMNAS_FAMISANAR = [
  ["_Id", "id", "id"],
  ["No Completo", "NoCompleto", "text"],
  ["Radicado Actual", "RadicadoActual", "text"],
  ["Despacho Judicial", "Despacho", "text"],
  ["Demandante", "Demandante", "text"],
  ["Parte en la que actuamos", "ParteActuamos", "text"],
  ["Historico numeros completos", "HistoricoNumerosCompletos", "text"],
  ["Demandado", "Demandado", "text"],
  ["fecha ultimo estado", "FechaUltimoEstado", "date"],
  ["Estado", "Estado", "html"],
  ["Historico", "Historico", "html"],
  ["Cuantia Actual", "ValorActualDemanda", "money"],
  ["Fecha Terminacion", "FechaTerminacion", "date"],
  ["Calificacion_de_la_contingencia", "CalificacionContingencia", "text"],
];
// Anchos pensados para el contenido real de cada columna (el ancho reportado
// por el archivo original venía inconsistente entre columnas — se prefirió
// un ancho legible por contenido en vez de calcarlo pixel a pixel).
const ANCHOS = [8, 22, 14, 28, 20, 18, 26, 20, 14, 45, 45, 18, 14, 16];

export async function generarInformeFamisanarExcel(procesos){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Famisanar");

  ws.columns = [{width: 5}, ...COLUMNAS_FAMISANAR.map((c,i) => ({width: ANCHOS[i]}))];

  const headerRow = ws.addRow(["", ...COLUMNAS_FAMISANAR.map(c => c[0])]);
  headerRow.height = 30;
  headerRow.eachCell((cell, colNumber) => {
    if(colNumber === 1) return; // columna A en blanco, igual que la plantilla real
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb: COLOR_ENCABEZADO} };
    cell.font = { name:'Aptos Narrow', size:11, bold:true, color:{argb:'FFFFFFFF'} };
    cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
  });

  procesos.forEach(p => {
    const valores = COLUMNAS_FAMISANAR.map(([, campo, tipo]) => {
      const raw = p[campo];
      if(tipo === 'money') return parseMonto(raw);
      if(tipo === 'date') return fechaISOaExcel(raw);
      if(tipo === 'html') return stripHtml(raw);
      return raw ?? "";
    });
    const row = ws.addRow(["", ...valores]);
    row.height = 140;
    row.eachCell(cell => { cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true }; });
  });

  ws.getColumn(13).numFmt = '"$"#,##0.00'; // Cuantia Actual
  ws.getColumn(10).numFmt = 'mm-dd-yy';    // fecha ultimo estado
  ws.getColumn(14).numFmt = 'mm-dd-yy';    // Fecha Terminacion

  ws.views = [{ state:'frozen', ySplit:1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const hoy = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `Informe Famisanar ${hoy}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const NOMBRE_COMPLETO_ENTIDAD = {
  FAMISANAR: "FAMISANAR EPS",
};

// "entidad" es la etiqueta corta guardada en el proceso (p.ej. "Famisanar");
// "procesosVigentes" ya debe venir filtrado (solo los NO terminados de esa
// Entidad) — el conteo y las filas de la carta son exactamente esa lista.
// Columnas de la carta (pedidas explícitamente por el usuario, en este
// orden): Número corto, Cuantía Actual, Calificación de la contingencia,
// Estado, Fecha Estado.
export async function generarInformeFamisanarPDF(entidad, procesosVigentes){
  const nombreEntidad = NOMBRE_COMPLETO_ENTIDAD[(entidad||"").toUpperCase()] || entidad;
  const filas = [...procesosVigentes].sort((a,b) => (a.Radicado||"").localeCompare(b.Radicado||""));
  const fecha = fechaLarga(new Date());
  const parrafo = `De manera cordial me permito informar que, con corte al ${fecha}, a cargo de MD ABOGADOS SAS se ` +
    `encuentran un total de ${filas.length} procesos judiciales, de los cuales en el siguiente cuadro se especifica ` +
    `su número corto, calificación de la contingencia, estado del proceso y última novedad, cuyo detalle se ` +
    `encuentra en el informe de Excel adjunto.`;

  await generarCartaInformePDF({
    nombreArchivo: 'Informe Famisanar',
    nombreEntidad,
    cantidadProcesos: filas.length,
    parrafo,
    columnas: ["Número corto", "Cuantía Actual", "Calificación de la contingencia", "Estado", "Fecha Estado"],
    filas: filas.map(p => [
      p.Radicado || "—",
      p.ValorActualDemanda ? fmtMonto(parseMonto(p.ValorActualDemanda)) : "—",
      p.CalificacionContingencia || "—",
      stripHtml(p.Estado) || "—",
      fechaCorta(p.FechaUltimoEstado),
    ]),
    columnStyles: {
      // Número corto es el radicado con guiones (~30 caracteres) — igual que
      // en el informe de SOS, letra chica + columna ancha para que no se
      // parta en dos líneas.
      0: { halign:'center', fontStyle:'bold', textColor:VERDE_OSCURO, font:'courier', fontSize:6.5, cellWidth:46 },
      1: { halign:'right', font:'courier', fontStyle:'bold', fontSize:7, cellWidth:28 },
      2: { halign:'center', cellWidth:26 },
      3: { halign:'left', cellWidth:'auto' },
      4: { halign:'center', cellWidth:20, textColor:GRIS_SUAVE },
    },
  });
}
