// Generador de informes GENÉRICOS (Excel + PDF) — el formato estándar de
// Lexara para las Entidades que NO tienen un formato propio heredado de un
// sistema anterior (a diferencia de SOS/Famisanar, que sí tienen su propia
// plantilla real de Access). Aplica, confirmado por el usuario 2026-08-16,
// a: Colpatria, Coomeva, GTM, JRCI, Particulares, Salud Total — y a
// cualquier Entidad nueva que no traiga su propio modelo.
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
// final (mismo artefacto ya visto en SOS/Famisanar) — se limpia igual.
function limpiarHash(v){
  return (v||"").toString().trim().replace(/^#/, "").replace(/#$/, "");
}

// [columna Excel, campo interno de la app, tipo] — mismas 16 columnas de la
// 2ª plantilla de Famisanar ("Informe LExara.xlsx"), que el usuario confirmó
// como el formato genérico a usar en el resto de Entidades.
const COLUMNAS_LEXARA = [
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
const ANCHOS = [8, 22, 14, 28, 20, 20, 18, 26, 14, 45, 45, 18, 16, 20, 14, 20];

export async function generarInformeLexaraExcel(entidad, procesos){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet((entidad||"Informe").slice(0, 31)); // Excel limita el nombre de hoja a 31 caracteres

  ws.columns = [{width: 5}, ...COLUMNAS_LEXARA.map((c,i) => ({width: ANCHOS[i]}))];

  const headerRow = ws.addRow(["", ...COLUMNAS_LEXARA.map(c => c[0])]);
  headerRow.height = 30;
  headerRow.eachCell((cell, colNumber) => {
    if(colNumber === 1) return; // columna A en blanco, igual que la plantilla real
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb: COLOR_ENCABEZADO} };
    cell.font = { name:'Aptos Narrow', size:11, bold:true, color:{argb:'FFFFFFFF'} };
    cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
  });

  procesos.forEach(p => {
    const valores = COLUMNAS_LEXARA.map(([, campo, tipo]) => {
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
  a.download = `Informe ${entidad} ${hoy}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function despachoConcatenado(p){
  const despacho = (p.Despacho||"").trim();
  const numero = (p.NumeroDespacho||"").trim();
  return [despacho, numero].filter(Boolean).join(" ") || "—";
}

// "entidad" es la etiqueta corta guardada en el proceso (p.ej. "Colpatria");
// no hay un mapa de razón social completa por Entidad como en SOS/Famisanar
// (todavía no se ha confirmado el nombre legal completo de cada una) — se
// usa el nombre tal cual aparece en la app para el "Señores:" de la carta.
// Columnas de la carta, confirmadas por el usuario, EN ESTE ORDEN: Número
// corto, Despacho (concatenado con No. de despacho), Histórico. Se quitó
// "Naturaleza del Proceso" (2026-08-16, pedido explícito) para darle más
// espacio a Histórico.
export async function generarInformeLexaraPDF(entidad, procesosVigentes){
  const filas = [...procesosVigentes].sort((a,b) => (a.Radicado||"").localeCompare(b.Radicado||""));
  const fecha = fechaLarga(new Date());
  const parrafo = `De manera cordial me permito informar que, con corte al ${fecha}, a cargo de MD ABOGADOS SAS se ` +
    `encuentran un total de ${filas.length} procesos judiciales, de los cuales en el siguiente cuadro se especifica ` +
    `su número corto, despacho y su histórico, cuyo detalle se encuentra en el informe de Excel adjunto.`;

  await generarCartaInformePDF({
    nombreArchivo: `Informe ${entidad}`,
    nombreEntidad: entidad,
    cantidadProcesos: filas.length,
    parrafo,
    columnas: ["Número corto", "Despacho", "Histórico"],
    filas: filas.map(p => [
      p.Radicado || "—",
      despachoConcatenado(p),
      stripHtml(p.Historico) || "—",
    ]),
    columnStyles: {
      // Número corto es el radicado con guiones (~30 caracteres) — igual que
      // en SOS/Famisanar, letra chica + columna ancha para que no se parta
      // en dos líneas. Despacho y, sobre todo, Histórico se quedan con el
      // resto del ancho disponible.
      0: { halign:'center', fontStyle:'bold', textColor:VERDE_OSCURO, font:'courier', fontSize:6.5, cellWidth:46 },
      1: { halign:'left', cellWidth:44 },
      2: { halign:'left', cellWidth:'auto' },
    },
  });
}
