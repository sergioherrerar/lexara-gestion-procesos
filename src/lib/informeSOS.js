// Generador del informe formal de la Entidad "SOS" — Excel (esta primera
// versión) y luego PDF. Calca la consulta/macro de Access que el despacho ya
// usaba (34 columnas, mismo orden, mismos anchos y colores), solo que ahora
// sale directo desde la app en vez de tener que abrir Access. Ver
// CHANGELOG 2026-08-14 y [[project_informes_modulo]].
//
// Cada Entidad puede tener su propio formato de informe (columnas/orden
// distintos) — este archivo es específico de SOS. Si más adelante se agrega
// otra Entidad con modelo propio, debe ir en su propio archivo, no mezclarse
// aquí (evita que un cambio para una Entidad rompa el formato de otra).
// ExcelJS es una librería pesada (~1MB) que solo hace falta al generar este
// informe puntual — se importa de forma diferida (dynamic import) para que
// no infle el paquete principal que se descarga en cada inicio de sesión.
import { stripHtml, parseMonto } from './graph';

// [columna Excel, header exacto que la Entidad SOS espera, campo interno de
// la app, tipo]. El orden de este arreglo ES el orden de columnas del Excel.
const COLUMNAS_SOS = [
  ["_Id", "id", "id"],
  ["Naturaleza del Proceso", "NaturalezaProceso", "text"],
  ["Subclasificacion", "Subclasificacion", "text"],
  ["Admitida", "Admitida", "text"],
  ["Prueba Pericial", "PruebaPericial", "text"],
  ["Numero 5 Digitos", "Numero5Digitos", "text"],
  ["No Completo", "NoCompleto", "text"],
  ["Historico numeros completos", "HistoricoNumerosCompletos", "text"],
  ["Despacho Judicial", "Despacho", "text"],
  ["Demandado", "Demandado", "text"],
  ["Valor radicacion", "ValorRadicacion", "money"],
  ["Fecha Admision del Proceso", "FechaAdmision", "date"],
  ["Fecha reforma de demanda", "FechaReformaDemanda", "date"],
  ["Valor Reforma", "ValorReforma", "money"],
  ["Etapa del proceso", "EtapaProcesal", "text"],
  ["fecha ultimo estado", "FechaUltimoEstado", "date"],
  ["Estado", "Estado", "html"],
  ["Historico", "Historico", "html"],
  ["Valor Cartera actual", "ValorCarteraActual", "money"],
  ["Enlace Proceso", "EnlaceProceso", "hash-link"],
  ["No Contrato", "NumeroContrato", "text"],
  ["Link Contrato", "LinkContrato", "hash-link"],
  ["Glosa demandada", "GlosaDemandada", "text"],
  ["Instancia", "Instancia", "text"],
  ["Departamento", "Departamento", "text"],
  ["Municipio", "Municipio", "text"],
  ["Apoderado o agente oficioso (SNS)", "Apoderado", "text"],
  ["Identificacion Apoderado o agente oficioso (SNS)", "CCApoderada", "text"],
  ["Demandante (SNS)", "Demandante", "text"],
  ["Numero de Identificacion Demandante (SNS)", "DemandanteIdentificacion", "text"],
  ["Medida Cautelar", "MedidaCautelar", "text"],
  ["Monto Medida Cautelar", "MontoMedidaCautelar", "money"],
  ["Calificacion de la contingencia", "CalificacionContingencia", "text"],
  ["Porcentaje de la Calificacion", "PorcentajeCalificacion", "text"],
];

// Anchos de columna del macro original (A-V) + los que faltaban (W-AH),
// completados con un ancho razonable para que ninguna quede angosta.
const ANCHOS = [5,15,11,9,9,10,24,24,17,15,18,13,13,18,10,10,45,45,18,14,14,14,20,18,14,14,24,24,24,24,14,16,20,13];

const COLOR_ENCABEZADO = "FF004941"; // var(--verde-oscuro) — mismo verde institucional que el macro original.

function fechaISOaExcel(iso){
  if(!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if(!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}
// Los enlaces del sistema anterior venían envueltos en "#" al inicio y al
// final (ver macro original) — se limpia igual para no arrastrar ese resto.
function limpiarHash(v){
  return (v||"").toString().trim().replace(/^#/, "").replace(/#$/, "");
}

export async function generarInformeSOSExcel(procesos){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("SOS");

  ws.columns = COLUMNAS_SOS.map((c, i) => ({ width: ANCHOS[i] || 14 }));

  const headerRow = ws.addRow(COLUMNAS_SOS.map(c => c[0]));
  headerRow.height = 70;
  headerRow.eachCell(cell => {
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb: COLOR_ENCABEZADO} };
    cell.font = { name:'Calibri', size:11, bold:true, color:{argb:'FFFFFFFF'} };
    cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
  });

  procesos.forEach(p => {
    const valores = COLUMNAS_SOS.map(([, campo, tipo]) => {
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

  // Formato moneda en las 3 columnas de valores — igual que el macro original.
  ["Valor radicacion","Valor Reforma","Valor Cartera actual","Monto Medida Cautelar"].forEach(header => {
    const idx = COLUMNAS_SOS.findIndex(c => c[0] === header) + 1;
    if(idx > 0) ws.getColumn(idx).numFmt = '"$"#,##0.00';
  });
  // Fechas en formato dd/mm/aaaa.
  ["Fecha Admision del Proceso","Fecha reforma de demanda","fecha ultimo estado"].forEach(header => {
    const idx = COLUMNAS_SOS.findIndex(c => c[0] === header) + 1;
    if(idx > 0) ws.getColumn(idx).numFmt = 'dd/mm/yyyy';
  });

  ws.views = [{ state:'frozen', ySplit:1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const hoy = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `Informe SOS ${hoy}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
