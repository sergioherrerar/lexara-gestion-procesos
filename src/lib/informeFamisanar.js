// Generador de los informes formales de la Entidad "Famisanar": Excel + PDF.
// Segunda Entidad con modelo propio (después de SOS, ver informeSOS.js) —
// mismo criterio: nunca inventar columnas, calcar la plantilla real que el
// usuario compartió ("Informe Famisanar *.xlsx", hoja "Famisanar", leída con
// exceljs vía un script de Node para sacar columnas/anchos/formato exactos).
// Ver CHANGELOG 2026-08-16 y [[project_informes_modulo]].
import { stripHtml, parseMonto } from './graph';
import { generarCartaInformePDF, fechaLarga, VERDE_OSCURO } from './informesPDF';

const COLOR_ENCABEZADO = "FF004941"; // var(--verde-oscuro), mismo verde institucional de siempre.

function fechaISOaExcel(iso){
  if(!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if(!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}
// Los enlaces del sistema anterior venían envueltos en "#" al inicio y al
// final (mismo artefacto ya visto en el informe de SOS, columna real
// equivalente) — se limpia igual para no arrastrar ese resto.
function limpiarHash(v){
  return (v||"").toString().trim().replace(/^#/, "").replace(/#$/, "");
}

// [columna Excel, campo interno de la app, tipo]. El orden ES el orden de
// columnas del Excel real (empieza en la columna B — la A queda en blanco,
// igual que en la plantilla). Actualizado 2026-08-16 con la 2ª versión de la
// plantilla que mandó el usuario ("Informe LExara.xlsx", mismo hoja
// "Famisanar"): Demandado se corrió justo después de Demandante, se quitó
// "Fecha Terminacion" (ya no la pide esta plantilla) y se agregaron Enlace
// Proceso/No Contrato/Link Contrato al final.
const COLUMNAS_FAMISANAR = [
  ["_Id", "id", "id"],
  ["No Completo", "NoCompleto", "text"],
  ["Radicado Actual", "RadicadoActual", "text"],
  ["Despacho Judicial", "Despacho", "text"],
  ["Demandante", "Demandante", "text"],
  ["Demandado", "Demandado", "text"],
  ["Parte en la que actuamos", "ParteActuamos", "text"],
  ["Historico numeros completos", "HistoricoNumerosCompletos", "text"],
  ["fecha ultimo estado", "FechaUltimoEstado", "date"],
  ["Estado", "Estado", "html"],
  ["Historico", "Historico", "html"],
  ["Cuantia Actual", "ValorActualDemanda", "money"],
  ["Calificacion de la contingencia", "CalificacionContingencia", "text"],
  ["Enlace Proceso", "EnlaceProceso", "hash-link"],
  ["No Contrato", "NumeroContrato", "text"],
  ["Link Contrato", "LinkContrato", "hash-link"],
];
// Anchos pensados para el contenido real de cada columna (el ancho reportado
// por el archivo original venía inconsistente entre columnas — se prefirió
// un ancho legible por contenido en vez de calcarlo pixel a pixel).
const ANCHOS = [8, 22, 14, 28, 20, 20, 18, 26, 14, 45, 45, 18, 16, 20, 14, 20];

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
      if(tipo === 'hash-link') return limpiarHash(raw);
      return raw ?? "";
    });
    const row = ws.addRow(["", ...valores]);
    row.height = 140;
    row.eachCell(cell => { cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true }; });
  });

  ws.getColumn(13).numFmt = '"$"#,##0.00'; // Cuantia Actual
  ws.getColumn(10).numFmt = 'mm-dd-yy';    // fecha ultimo estado

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
// Columnas de la carta, confirmadas por el usuario, EN ESTE ORDEN: Número
// corto, Naturaleza del Proceso, Despacho (concatenado con No. de despacho,
// separados por un espacio), Histórico.
function despachoConcatenado(p){
  const despacho = (p.Despacho||"").trim();
  const numero = (p.NumeroDespacho||"").trim();
  return [despacho, numero].filter(Boolean).join(" ") || "—";
}

export async function generarInformeFamisanarPDF(entidad, procesosVigentes){
  const nombreEntidad = NOMBRE_COMPLETO_ENTIDAD[(entidad||"").toUpperCase()] || entidad;
  const filas = [...procesosVigentes].sort((a,b) => (a.Radicado||"").localeCompare(b.Radicado||""));
  const fecha = fechaLarga(new Date());
  const parrafo = `De manera cordial me permito informar que, con corte al ${fecha}, a cargo de MD ABOGADOS SAS se ` +
    `encuentran un total de ${filas.length} procesos judiciales, de los cuales en el siguiente cuadro se especifica ` +
    `su número corto, naturaleza del proceso, despacho y su histórico, cuyo detalle se encuentra en el informe de ` +
    `Excel adjunto.`;

  await generarCartaInformePDF({
    nombreArchivo: 'Informe Famisanar',
    nombreEntidad,
    cantidadProcesos: filas.length,
    parrafo,
    columnas: ["Número corto", "Naturaleza del Proceso", "Despacho", "Histórico"],
    filas: filas.map(p => [
      p.Radicado || "—",
      p.NaturalezaProceso || "—",
      despachoConcatenado(p),
      stripHtml(p.Historico) || "—",
    ]),
    columnStyles: {
      // Número corto es el radicado con guiones (~30 caracteres) — igual que
      // en el informe de SOS, letra chica + columna ancha para que no se
      // parta en dos líneas.
      0: { halign:'center', fontStyle:'bold', textColor:VERDE_OSCURO, font:'courier', fontSize:6.5, cellWidth:46 },
      1: { halign:'center', cellWidth:28 },
      2: { halign:'left', cellWidth:40 },
      3: { halign:'left', cellWidth:'auto' },
    },
  });
}
