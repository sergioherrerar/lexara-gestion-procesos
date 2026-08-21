// Generador de los informes formales de la Entidad "SOS": informe general de
// procesos (Excel + PDF) y, desde 2026-08-16, el de Desistimientos (Excel).
// Cada uno calca su propia plantilla real que el usuario compartió (mismas
// columnas, orden y colores) — ver CHANGELOG y [[project_informes_modulo]].
//
// Cada Entidad puede tener su propio formato de informe (columnas/orden
// distintos) — este archivo es específico de SOS. Si más adelante se agrega
// otra Entidad con modelo propio, debe ir en su propio archivo, no mezclarse
// aquí (evita que un cambio para una Entidad rompa el formato de otra).
// ExcelJS/jsPDF son librerías pesadas que solo hacen falta al generar estos
// informes puntuales — se importan de forma diferida (dynamic import) para
// que no infle el paquete principal que se descarga en cada inicio de sesión.
import { stripHtml, parseMonto, fmtMonto, procesoForDesistimiento } from './graph';
import { generarCartaInformePDF, fechaLarga, fechaCorta, VERDE_OSCURO, GRIS_SUAVE } from './informesPDF';

// [columna Excel, header exacto que la Entidad SOS espera, campo interno de
// la app, tipo]. El orden de este arreglo ES el orden de columnas del Excel.
// Exportado (junto con ANCHOS/COLOR_ENCABEZADO/fechaISOaExcel/limpiarHash)
// para que informeGeneral.js pueda reusar exactamente este mismo formato en
// el Excel de "todos los procesos" (2026-08-22) sin duplicar las 34 filas —
// no es mezclar el modelo de otra Entidad, es la misma plantilla aplicada a
// un universo distinto de filas (todos los procesos, no solo SOS).
export const COLUMNAS_SOS = [
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
export const ANCHOS = [5,15,11,9,9,10,24,24,17,15,18,13,13,18,10,10,45,45,18,14,14,14,20,18,14,14,24,24,24,24,14,16,20,13];

export const COLOR_ENCABEZADO = "FF004941"; // var(--verde-oscuro) — mismo verde institucional que el macro original.

export function fechaISOaExcel(iso){
  if(!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if(!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}
// Los enlaces del sistema anterior venían envueltos en "#" al inicio y al
// final (ver macro original) — se limpia igual para no arrastrar ese resto.
export function limpiarHash(v){
  return (v||"").toString().trim().replace(/^#/, "").replace(/#$/, "");
}

// "entidad" no se usa (el nombre de la Entidad ya está fijo en este archivo,
// es siempre "SOS") — se recibe solo para que la firma sea igual a la del
// resto de generadores de Excel (ver FORMATOS_POR_ENTIDAD en InformesView.jsx).
export async function generarInformeSOSExcel(entidad, procesos){
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

/* ---------------- Carta de reporte de procesos (PDF) ----------------
   Primer intento (2026-08-16) usaba una hoja de impresión HTML/CSS y
   `window.print()`, igual que Factura/Orden de compra — pero esta carta es
   multipágina y el resultado real salió mal ordenado (encabezado/pie en
   position:fixed no se comportó bien en varias páginas al imprimir/guardar).
   Además el usuario pidió explícitamente que el PDF se EXPORTE directo
   (como el Excel), sin pasar por el diálogo de impresión del navegador.
   Se reconstruyó con jsPDF + jspdf-autotable, y el scaffolding común
   (membrete, firma, paginación) se extrajo a informesPDF.js al agregar la
   segunda Entidad (Famisanar) — este archivo solo arma sus propias columnas
   y texto. */
const NOMBRE_COMPLETO_ENTIDAD = {
  SOS: "EPS SERVICIO OCCIDENTAL DE SALUD S.A",
};

// "entidad" es la etiqueta corta guardada en el proceso (p.ej. "SOS");
// "procesosVigentes" ya debe venir filtrado (solo los NO terminados de esa
// Entidad) — el conteo y las filas de la carta son exactamente esa lista.
export async function generarInformeSOSPDF(entidad, procesosVigentes){
  const nombreEntidad = NOMBRE_COMPLETO_ENTIDAD[(entidad||"").toUpperCase()] || entidad;
  const filas = [...procesosVigentes].sort((a,b) => (a.NoCompleto||a.Radicado||"").localeCompare(b.NoCompleto||b.Radicado||""));
  const fecha = fechaLarga(new Date());
  const parrafo = `De manera cordial me permito informar que, con corte al ${fecha}, a cargo de MD ABOGADOS SAS se ` +
    `encuentran un total de ${filas.length} procesos judiciales, con pretensiones de recobros ante la ADRES, de los ` +
    `cuales en el siguiente cuadro se especifica su radicado actual, estado del proceso, cuantía, y última novedad, ` +
    `cuyo detalle se encuentra en el informe de Excel adjunto.`;

  await generarCartaInformePDF({
    nombreArchivo: 'Informe SOS',
    nombreEntidad,
    cantidadProcesos: filas.length,
    parrafo,
    columnas: ["No. Radicado", "Fecha Estado", "Estado", "Valor Actual Demanda"],
    filas: filas.map(p => [
      p.NoCompleto || p.Radicado || "—",
      fechaCorta(p.FechaUltimoEstado),
      stripHtml(p.Estado) || "—",
      p.ValorActualDemanda ? fmtMonto(parseMonto(p.ValorActualDemanda)) : "—",
    ]),
    columnStyles: {
      // No. Completo/Radicado y Valor Actual Demanda son cadenas largas en
      // fuente monoespaciada — con el tamaño base (8.5) no cabían en una
      // sola línea y se partían a la mitad de un número. Letra más chica +
      // columna un poco más ancha las deja siempre en una sola línea.
      0: { halign:'center', fontStyle:'bold', textColor:VERDE_OSCURO, font:'courier', fontSize:7, cellWidth:40 },
      1: { halign:'center', cellWidth:20, textColor:GRIS_SUAVE },
      2: { halign:'left', cellWidth:'auto' },
      3: { halign:'right', font:'courier', fontStyle:'bold', fontSize:7, cellWidth:33 },
    },
  });
}

/* ---------------- Desistimientos SOS (Excel) ----------------
   Calca la plantilla real compartida por el usuario ("Desistimientos SOS
   *.xlsx", hoja "Des SOS"): 10 columnas de datos empezando en la columna B
   (la A queda en blanco a propósito, igual que en el archivo real). La
   mayoría de columnas vienen del PROCESO vinculado (No. Completo, Histórico
   números completos, Despacho, Valor Actual Demanda) — un Desistimiento no
   guarda esos datos, se unen vía `procesoForDesistimiento`. Solo se incluyen
   los desistimientos cuyo proceso pertenezca a la Entidad que se pasa (se
   filtra pasando ya solo los procesos de esa Entidad). */
const COLUMNAS_DESISTIMIENTOS_SOS = [
  ["numero corto", null, "text"],
  ["No Completo", null, "text"],
  ["Historico numeros completos", null, "text"],
  ["Despacho Judicial", null, "text"],
  ["Valor Actual Demanda", null, "money"],
  ["Desistimiento Valor", null, "money"],
  ["Fecha Radicacion", null, "date"],
  ["Aprobacion", null, "text"],
  ["Fecha de Aprobacion", null, "date"],
  ["Observaciones", null, "text"],
];
const ANCHOS_DESISTIMIENTOS = [6, 16, 24, 30, 30, 20, 20, 16, 14, 18, 36];

export async function generarDesistimientosSOSExcel(desistimientos, procesosEntidad){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Des SOS");

  ws.columns = [{width: ANCHOS_DESISTIMIENTOS[0]}, ...COLUMNAS_DESISTIMIENTOS_SOS.map((c,i) => ({width: ANCHOS_DESISTIMIENTOS[i+1]}))];

  const headerRow = ws.addRow(["", ...COLUMNAS_DESISTIMIENTOS_SOS.map(c => c[0])]);
  headerRow.height = 30;
  headerRow.eachCell((cell, colNumber) => {
    if(colNumber === 1) return; // columna A en blanco, igual que la plantilla real
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb: COLOR_ENCABEZADO} };
    cell.font = { name:'Aptos Narrow', size:11, bold:true, color:{argb:'FFFFFFFF'} };
    cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
  });

  const filas = (desistimientos||[])
    .map(d => ({ d, proceso: procesoForDesistimiento(procesosEntidad, d) }))
    .filter(x => x.proceso);

  filas.forEach(({d, proceso}) => {
    const valores = [
      "",
      proceso.Radicado || "",
      proceso.NoCompleto || "",
      proceso.HistoricoNumerosCompletos || "",
      proceso.Despacho || "",
      parseMonto(proceso.ValorActualDemanda),
      parseMonto(d.DesistimientoValor),
      fechaISOaExcel(d.FechaRadicacion),
      d.Aprobacion || "",
      fechaISOaExcel(d.FechaAprobacion),
      d.Observaciones || "",
    ];
    const row = ws.addRow(valores);
    row.height = 60;
    row.eachCell(cell => { cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true }; });
  });

  ws.getColumn(6).numFmt = '"$"#,##0.00'; // Valor Actual Demanda
  ws.getColumn(7).numFmt = '"$"#,##0.00'; // Desistimiento Valor
  ws.getColumn(8).numFmt = 'mm-dd-yy';    // Fecha Radicacion
  ws.getColumn(10).numFmt = 'mm-dd-yy';   // Fecha de Aprobacion

  ws.views = [{ state:'frozen', ySplit:1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const hoy = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `Desistimientos SOS ${hoy}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
