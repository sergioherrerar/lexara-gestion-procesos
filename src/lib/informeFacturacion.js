// Exportación a Excel de Facturación y Órdenes de compra, desde el módulo
// Informes — mismo estilo institucional que los demás Excel de la app
// (encabezado verde `#004941`, blanco negrita, fila congelada), pero sin
// atarse a ninguna Entidad: exporta la lista completa tal cual está
// cargada. Pedido explícito del usuario 2026-08-16.
// Ver CHANGELOG y [[project_informes_modulo]].
import {
  parseMonto, clienteForFactura, clienteForOrdenCompra, facturaNumero, ordenCompraNumero,
  computeFacturaTotals, computeOrdenCompraTotals, facturaForOrdenCompra,
} from './graph';
import { buscarFacturasParaOrdenes } from './cruceFacturasOrdenes';

const COLOR_ENCABEZADO = "FF004941"; // var(--verde-oscuro), mismo verde institucional de siempre.

function fechaISOaExcel(iso){
  if(!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if(!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}

function fechaDeDiaMesAnio(oc){
  const d = Number(oc && oc.Dia), m = Number(oc && oc.Mes), a = Number(oc && oc.Anio);
  if(!d || !m || !a) return null;
  const f = new Date(a, m - 1, d);
  return f.getMonth() === m - 1 ? f : null;
}

function estilizarEncabezado(row){
  row.height = 30;
  row.eachCell(cell => {
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb: COLOR_ENCABEZADO} };
    cell.font = { name:'Aptos Narrow', size:11, bold:true, color:{argb:'FFFFFFFF'} };
    cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
  });
}
function estilizarFila(row){
  row.eachCell(cell => { cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true }; });
}
async function descargarWorkbook(wb, nombreArchivo){
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const hoy = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `${nombreArchivo} ${hoy}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function generarInformeFacturasExcel(facturas, clientes){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Facturación");

  const columnas = ["No. Factura","Contrato","Proceso","Cliente","Fecha","Etapa contrato","Estado","Subtotal","IVA","Total","Valor a pagar"];
  const anchos = [14, 16, 20, 30, 14, 24, 14, 18, 16, 18, 18];
  ws.columns = columnas.map((c,i) => ({ width: anchos[i] }));
  estilizarEncabezado(ws.addRow(columnas));

  facturas.forEach(f => {
    const cliente = clienteForFactura(clientes, f);
    const totales = computeFacturaTotals(f);
    const valorAPagar = parseMonto(f.ValorAPagar) > 0 ? parseMonto(f.ValorAPagar) : totales.total;
    const row = ws.addRow([
      facturaNumero(f), f.Contrato || "", f.Proceso || "", cliente?.RazonSocial || "", fechaISOaExcel(f.Fecha),
      f.EtapaContrato || "", f.EstadoFactura || "", totales.subtotal, totales.iva, totales.total, valorAPagar,
    ]);
    estilizarFila(row);
  });

  ["Subtotal","IVA","Total","Valor a pagar"].forEach(header => {
    const idx = columnas.indexOf(header) + 1;
    ws.getColumn(idx).numFmt = '"$"#,##0.00';
  });
  ws.getColumn(columnas.indexOf("Fecha")+1).numFmt = 'dd/mm/yyyy';

  ws.views = [{ state:'frozen', ySplit:1 }];
  await descargarWorkbook(wb, "Informe Facturación");
}

// `cruce` (opcional): Map id de la orden → { factura, metodo } de buscarFacturasParaOrdenes (cruceFacturasOrdenes.js). Sin él se usa solo el cruce exacto de siempre.
// Las facturas encontradas con un criterio flexible (no «Exacto») quedan con la celda de «Cruce» resaltada para que se revisen.
export async function generarInformeOrdenesCompraExcel(ordenesCompra, clientes, facturas, cruce){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Órdenes de compra");
  // El Excel y el portal muestran la misma factura: sin un cruce dado, se usa el mismo cruce flexible que ve el portal.
  cruce = cruce || buscarFacturasParaOrdenes(ordenesCompra, facturas);

  const columnas = ["No. Orden","Contrato","Proceso","Cliente","Fecha","Etapa contrato","Subtotal","IVA","Total","Valor a pagar","Factura relacionada","Fecha factura","Cruce"];
  const anchos = [14, 16, 20, 30, 14, 24, 18, 16, 18, 18, 18, 16, 16];
  ws.columns = columnas.map((c,i) => ({ width: anchos[i] }));
  estilizarEncabezado(ws.addRow(columnas));

  ordenesCompra.forEach(oc => {
    const cliente = clienteForOrdenCompra(clientes, oc);
    const totales = computeOrdenCompraTotals(oc);
    const valorAPagar = parseMonto(oc.ValorAPagar) > 0 ? parseMonto(oc.ValorAPagar) : totales.total;
    const hallado = cruce ? cruce.get(oc.id) : null;
    const facturaRelacionada = hallado ? hallado.factura : facturaForOrdenCompra(facturas, oc);
    const metodo = hallado ? hallado.metodo : (facturaRelacionada ? "Exacto" : "");
    // La orden a veces trae la fecha solo en Día / Mes / Año y la columna Fecha vacía.
    const fechaOrden = fechaISOaExcel(oc.Fecha) || fechaDeDiaMesAnio(oc);
    const row = ws.addRow([
      ordenCompraNumero(oc), oc.Contrato || "", oc.Proceso || "", cliente?.RazonSocial || "", fechaOrden,
      oc.EtapaContrato || "", totales.subtotal, totales.iva, totales.total, valorAPagar,
      facturaRelacionada ? facturaNumero(facturaRelacionada) : "—",
      facturaRelacionada ? fechaISOaExcel(facturaRelacionada.Fecha) : null,
      metodo,
    ]);
    estilizarFila(row);
    if(metodo && metodo !== "Exacto"){
      row.getCell(columnas.indexOf("Cruce") + 1).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFFF2CC'} };
    }
  });

  ["Subtotal","IVA","Total","Valor a pagar"].forEach(header => {
    const idx = columnas.indexOf(header) + 1;
    ws.getColumn(idx).numFmt = '"$"#,##0.00';
  });
  ws.getColumn(columnas.indexOf("Fecha")+1).numFmt = 'dd/mm/yyyy';
  ws.getColumn(columnas.indexOf("Fecha factura")+1).numFmt = 'dd/mm/yyyy';

  ws.views = [{ state:'frozen', ySplit:1 }];
  await descargarWorkbook(wb, "Informe Ordenes de Compra");
}
