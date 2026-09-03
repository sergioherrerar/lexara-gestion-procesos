// Vacaciones (Administración) — reescrito por completo 2026-08-31: reemplaza
// el Excel real que se usaba antes ("Vacaciones.xlsx", ver la saga completa
// de 404 en [[project_administracion_modulo]]) por la lista real "Vacaciones"
// (una fila por PERÍODO tomado, no una fila por persona) — pedido explícito
// del usuario: "no vamos a dejar el excel, vamos a crear lista en SharePoint".
//
// Los totales que antes eran fórmulas del propio Excel (fila 3, columnas
// C-H: fecha actual=HOY(), Días Laborados=C-B, Días generados=Días
// Laborados/24, Días Tomados=SUMA de columnas Días, Días Pendientes=
// generados-tomados) ahora los calcula esta función, con la MISMA fórmula
// real (confirmada leyendo el Excel real), solo que a partir de:
//   - "Fecha de Ingreso" — ya existe en la lista Equipo MD (colaboradores)
//   - la suma de "Dias" de la lista "Vacaciones" (una fila por período)
// en vez de columnas fijas de un archivo.
import { COLOR_ENCABEZADO, fechaISOaExcel } from './informeSOS';
import { esColaboradorVigente } from './permissions';
import {
  prepararDocumentoPDF, dibujarResumenBox, fechaCorta,
  VERDE_OSCURO, GRIS_SUAVE, TEXTO, BORDE_SUAVE, GRIS_ZEBRA, VERDE_CLARO, MARGEN, CONTENIDO_Y_INICIAL, CONTENIDO_Y_MAXIMO,
} from './informesPDF';

function soloFecha(v){
  const s = String(v||"").slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function redondear(n){ return Math.round(n * 100) / 100; }

// Misma fórmula real del Excel (C3-B3, D3/24) — días CORRIDOS, no hábiles.
export function calcularResumen(fechaIngresoISO, periodosDeEsaPersona){
  const ingresoISO = soloFecha(fechaIngresoISO);
  if(!ingresoISO) return { diasLaborados: null, diasGenerados: null, diasTomados: 0, diasPendientes: null };
  const [y,m,d] = ingresoISO.split('-').map(Number);
  const ingreso = new Date(y, m-1, d);
  const hoy = new Date(); const hoySoloFecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const diasLaborados = Math.round((hoySoloFecha - ingreso) / 86400000);
  const diasGenerados = redondear(diasLaborados / 24);
  const diasTomados = redondear((periodosDeEsaPersona||[]).reduce((s,p) => s + (Number(p.Dias)||0), 0));
  const diasPendientes = redondear(diasGenerados - diasTomados);
  return { diasLaborados, diasGenerados, diasTomados, diasPendientes };
}

// Une Equipo MD (colaboradores, para Nombre + Fecha de Ingreso) con la lista
// "Vacaciones" (períodos, uno por fila) — un bloque por colaborador con
// Fecha de Ingreso, ordenado alfabéticamente. Solo incluye colaboradores
// VIGENTES (Activo=Sí y no Contratista, ver esColaboradorVigente en
// permissions.js) con Fecha de Ingreso cargada (sin eso no hay nada que
// calcular) — pedido explícito del usuario 2026-09-01 ("que solo se
// visualicen los datos de trabajadores no contratistas y que estén
// vigentes"): las vacaciones son un concepto laboral, no aplica a quien está
// vinculado por prestación de servicios.
export function agruparVacacionesPorColaborador(colaboradores, periodos){
  return (colaboradores||[])
    .filter(c => esColaboradorVigente(c) && soloFecha(c.FechaIngreso))
    .map(c => {
      const propios = (periodos||[])
        .filter(p => (p.Colaborador||"").trim() === (c.Nombre||"").trim())
        .sort((a,b) => String(b.FechaInicio||"").localeCompare(String(a.FechaInicio||"")));
      const resumen = calcularResumen(c.FechaIngreso, propios);
      return { id: c.id, nombre: c.Nombre, fechaIngreso: c.FechaIngreso, ...resumen, cantidadPeriodos: propios.length, historial: propios };
    })
    .sort((a,b) => (a.nombre||"").localeCompare(b.nombre||""));
}

// Excel de Vacaciones — pedido explícito del usuario 2026-09-01 ("un botón
// donde se pueda exportar a excel toda la lista con el formato de todos los
// excel"): mismo estilo institucional que el resto de los Excel de la app
// (encabezado verde oscuro con texto blanco, ver COLOR_ENCABEZADO en
// informeSOS.js) y las columnas numéricas/de fecha alineadas a la derecha
// (ver [[feedback_alinear_valores_derecha]]). Dos hojas: "Resumen" (una fila
// por colaborador, igual a la tabla de arriba) y "Períodos" (una fila por
// período tomado, con el detalle completo de todos juntos).
export async function generarVacacionesExcel(filas){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();

  function encabezar(ws, titulos, anchos){
    ws.columns = titulos.map((t,i) => ({ width: anchos[i] || 16 }));
    const headerRow = ws.addRow(titulos);
    headerRow.eachCell(cell => {
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb: COLOR_ENCABEZADO} };
      cell.font = { name:'Calibri', size:11, bold:true, color:{argb:'FFFFFFFF'} };
      cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
    });
    ws.views = [{ state:'frozen', ySplit:1 }];
  }

  const wsResumen = wb.addWorksheet("Resumen");
  encabezar(wsResumen, ["Colaborador","Fecha de ingreso","Días generados","Períodos","Días tomados","Días pendientes"], [28,16,14,10,14,14]);
  filas.forEach(f => {
    const row = wsResumen.addRow([f.nombre, fechaISOaExcel(f.fechaIngreso), f.diasGenerados, f.cantidadPeriodos, f.diasTomados, f.diasPendientes]);
    row.getCell(2).numFmt = 'dd/mm/yyyy';
    [2,3,4,5,6].forEach(i => { row.getCell(i).alignment = { horizontal:'right' }; });
  });

  const wsPeriodos = wb.addWorksheet("Períodos");
  encabezar(wsPeriodos, ["Colaborador","Fecha inicio","Fecha fin","Días","Observaciones"], [28,14,14,10,45]);
  filas.forEach(f => {
    f.historial.forEach(h => {
      const row = wsPeriodos.addRow([f.nombre, fechaISOaExcel(h.FechaInicio), fechaISOaExcel(h.FechaFin), Number(h.Dias)||0, h.Observaciones || ""]);
      row.getCell(2).numFmt = 'dd/mm/yyyy';
      row.getCell(3).numFmt = 'dd/mm/yyyy';
      [2,3,4].forEach(i => { row.getCell(i).alignment = { horizontal:'right' }; });
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const hoy = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `Vacaciones ${hoy}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// PDF individual por colaborador — pedido explícito del usuario 2026-09-02
// ("por trabajador agrega un PDF con la información de cada uno"). Mismo
// membrete/pie institucional que el resto de los PDF de la app (ver
// informesPDF.js) — resumen de días arriba, tabla de períodos tomados abajo
// (paginada sola por autoTable si el historial es largo).
export async function generarPDFVacacionesColaborador(fila){
  const { doc, autoTable, pageWidth, fecha, dibujarEncabezadoYPie, numerarPaginas } = await prepararDocumentoPDF(`Vacaciones — ${fila.nombre}`);
  dibujarEncabezadoYPie();
  let y = CONTENIDO_Y_INICIAL;

  doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(...TEXTO);
  doc.text(`Bogotá D.C., ${fecha}`, MARGEN, y); y += 9;

  y = dibujarResumenBox(doc, MARGEN, y, pageWidth - MARGEN*2, [
    { label:'Fecha de ingreso', value: fechaCorta(fila.fechaIngreso) },
    { label:'Días generados', value: fila.diasGenerados ?? "—" },
    { label:'Días tomados', value: fila.diasTomados ?? "—" },
    { label:'Días pendientes', value: fila.diasPendientes ?? "—" },
  ]) + 10;

  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...VERDE_OSCURO);
  doc.text('Períodos tomados', MARGEN, y); y += 5;

  if(!fila.historial.length){
    doc.setFont('helvetica','italic'); doc.setFontSize(10); doc.setTextColor(...GRIS_SUAVE);
    doc.text('Sin períodos registrados todavía.', MARGEN, y);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGEN, right: MARGEN, top: CONTENIDO_Y_INICIAL, bottom: 297 - CONTENIDO_Y_MAXIMO },
      head: [["Fecha inicio","Fecha fin","Días","Observaciones"]],
      body: fila.historial.map(h => [fechaCorta(h.FechaInicio), fechaCorta(h.FechaFin), h.Dias ?? "—", h.Observaciones || "—"]),
      foot: [[{ content: `Total: ${fila.diasTomados ?? 0} días en ${fila.historial.length} período${fila.historial.length===1?'':'s'}`, colSpan: 4, styles:{halign:'right', fontStyle:'bold', fillColor:VERDE_CLARO, textColor:VERDE_OSCURO, fontSize:8.5} }]],
      showFoot: 'lastPage',
      styles: { font:'helvetica', fontSize:8.5, cellPadding:2.4, valign:'top', lineColor:BORDE_SUAVE, lineWidth:0.15, textColor:TEXTO },
      headStyles: { fillColor:VERDE_OSCURO, textColor:255, fontStyle:'bold', halign:'center', fontSize:8.5 },
      alternateRowStyles: { fillColor:GRIS_ZEBRA },
      columnStyles: { 0:{cellWidth:26, halign:'right'}, 1:{cellWidth:26, halign:'right'}, 2:{cellWidth:16, halign:'right'} },
      willDrawPage: dibujarEncabezadoYPie,
    });
  }

  numerarPaginas();
  const hoyISO = new Date().toISOString().slice(0,10);
  doc.save(`Vacaciones - ${fila.nombre} - ${hoyISO}.pdf`);
}
