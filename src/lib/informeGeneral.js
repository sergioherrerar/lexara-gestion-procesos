// Excel de "todos los procesos" (2026-08-22) — pedido explícito del usuario
// para poder hacer cruces: mismo formato de columnas del Excel de SOS
// (COLUMNAS_SOS en informeSOS.js), pero sin filtrar por Entidad NI por
// Estado V/T — incluye terminados, vigentes y en revisión, de todas las
// Entidades a la vez. Se le agregan "Entidad" y "Estado V/T" al inicio
// (columnas que el formato SOS no necesita porque ahí la Entidad ya es fija)
// para poder distinguir de dónde es cada fila una vez mezcladas todas.
// Ver [[project_informes_modulo]].
import { stripHtml, parseMonto } from './graph';
import { COLUMNAS_SOS, ANCHOS, COLOR_ENCABEZADO, fechaISOaExcel, limpiarHash } from './informeSOS';

const COLUMNAS_EXTRA = [["Entidad", "Entidad", "text"], ["Estado V/T", "EstadoVT", "text"]];
const ANCHOS_EXTRA = [16, 14];
const COLUMNAS = [...COLUMNAS_EXTRA, ...COLUMNAS_SOS];
const ANCHOS_TOTAL = [...ANCHOS_EXTRA, ...ANCHOS];

export async function generarInformeGeneralProcesosExcel(procesos){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Todos los procesos");

  ws.columns = COLUMNAS.map((c, i) => ({ width: ANCHOS_TOTAL[i] || 14 }));

  const headerRow = ws.addRow(COLUMNAS.map(c => c[0]));
  headerRow.height = 70;
  headerRow.eachCell(cell => {
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb: COLOR_ENCABEZADO} };
    cell.font = { name:'Calibri', size:11, bold:true, color:{argb:'FFFFFFFF'} };
    cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
  });

  procesos.forEach(p => {
    const valores = COLUMNAS.map(([, campo, tipo]) => {
      const raw = p[campo];
      if(tipo === 'money') return parseMonto(raw);
      if(tipo === 'date') return fechaISOaExcel(raw);
      if(tipo === 'html') return stripHtml(raw);
      if(tipo === 'hash-link') return limpiarHash(raw);
      return raw ?? "";
    });
    const row = ws.addRow(valores);
    row.height = 160;
    row.eachCell(cell => {
      cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
    });
  });

  ["Valor radicacion","Valor Reforma","Valor Cartera actual","Monto Medida Cautelar"].forEach(header => {
    const idx = COLUMNAS.findIndex(c => c[0] === header) + 1;
    if(idx > 0) ws.getColumn(idx).numFmt = '"$"#,##0.00';
  });
  ["Fecha Admision del Proceso","Fecha reforma de demanda","fecha ultimo estado"].forEach(header => {
    const idx = COLUMNAS.findIndex(c => c[0] === header) + 1;
    if(idx > 0) ws.getColumn(idx).numFmt = 'dd/mm/yyyy';
  });

  ws.views = [{ state:'frozen', ySplit:1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const hoy = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `Informe general de procesos ${hoy}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
