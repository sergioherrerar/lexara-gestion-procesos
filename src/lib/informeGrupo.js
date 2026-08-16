// Excel COMPARTIDO del formato "Grupo" (12 columnas): la plantilla real que
// el usuario compartió para "Informe Grupo Aliansalud *.xlsx" (hoja "Grupo")
// resultó ser el mismo formato de Excel que pidió para otra Entidad
// ("Grupo Colmédica") — "FORMATO GRUPO" — así que se extrajo aparte para no
// duplicarlo. El PDF de cada una sigue siendo propio (columnas distintas),
// eso vive en su propio archivo (informeAliansalud.js, informeColmedica.js).
// Ver CHANGELOG 2026-08-16 y [[project_informes_modulo]].
import { stripHtml } from './graph';

const COLOR_ENCABEZADO = "FF004941"; // var(--verde-oscuro), mismo verde institucional de siempre.

function fechaISOaExcel(iso){
  if(!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if(!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}

// [columna Excel, campo interno de la app, tipo]. El orden ES el orden de
// columnas del Excel real (empieza en la columna B — la A queda en blanco,
// igual que en la plantilla). Trae "Cliente" al final (razón social
// completa de la Entidad), a diferencia de SOS/Famisanar/Lexara-genérico.
const COLUMNAS_GRUPO = [
  ["_Id", "id", "id"],
  ["No Completo", "NoCompleto", "text"],
  ["numero corto", "Radicado", "text"],
  ["Despacho Judicial", "Despacho", "text"],
  ["Demandante", "Demandante", "text"],
  ["Parte en la que actuamos", "ParteActuamos", "text"],
  ["Historico numeros completos", "HistoricoNumerosCompletos", "text"],
  ["Demandado", "Demandado", "text"],
  ["fecha ultimo estado", "FechaUltimoEstado", "date"],
  ["Estado", "Estado", "html"],
  ["Historico", "Historico", "html"],
  ["Cliente", "Cliente", "text"],
];
// Anchos pensados para el contenido real de cada columna (el ancho reportado
// por el archivo original venía inconsistente entre columnas — se prefirió
// un ancho legible por contenido en vez de calcarlo pixel a pixel).
const ANCHOS = [8, 22, 28, 30, 20, 18, 26, 20, 14, 45, 45, 30];

export async function generarInformeGrupoExcel(entidad, procesos){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Grupo");

  ws.columns = [{width: 5}, ...COLUMNAS_GRUPO.map((c,i) => ({width: ANCHOS[i]}))];

  const headerRow = ws.addRow(["", ...COLUMNAS_GRUPO.map(c => c[0])]);
  headerRow.height = 45;
  headerRow.eachCell((cell, colNumber) => {
    if(colNumber === 1) return; // columna A en blanco, igual que la plantilla real
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb: COLOR_ENCABEZADO} };
    cell.font = { name:'Aptos Narrow', size:11, bold:true, color:{argb:'FFFFFFFF'} };
    cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
  });

  procesos.forEach(p => {
    const valores = COLUMNAS_GRUPO.map(([, campo, tipo]) => {
      const raw = p[campo];
      if(tipo === 'date') return fechaISOaExcel(raw);
      if(tipo === 'html') return stripHtml(raw);
      return raw ?? "";
    });
    const row = ws.addRow(["", ...valores]);
    row.height = 140;
    row.eachCell(cell => { cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true }; });
  });

  ws.getColumn(10).numFmt = 'mm-dd-yy'; // fecha ultimo estado

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
