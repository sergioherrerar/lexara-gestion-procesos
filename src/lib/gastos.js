// Gastos (Administración) — reemplaza el Excel mensual real ("PAGOS DE
// {MES} {AÑO}.xlsx", una carpeta por mes en OneDrive con ese Excel + los PDF
// de soporte sueltos) por 4 listas reales de SharePoint (ver
// SHAREPOINT_LISTS_CONFIG en config.js): Proveedores Gastos MD (persiste
// entre meses), Cuentas de Cobro MD / Pagos por Realizar MD / Gastos MD (se
// reinician cada mes, pedido explícito del usuario 2026-09-01).
//
// Identificación/Entidad/Cuenta/Tipo Cuenta de cada Cuenta de cobro/Pago/
// Gasto NO se guardan repetidos en cada lista — se buscan en vivo acá mismo
// en Proveedores Gastos MD por el nombre de "Pagado a", mismo criterio que
// el VLOOKUP del Excel real (ver buscarProveedor).
//
// Las 3 listas fijas de abajo (Tipo Documento/Entidad bancaria/Tipo Cuenta)
// son intencionalmente NO una columna Choice estricta de SharePoint — pedido
// explícito del usuario, después de un bug real donde una tilde de más en
// una opción de "Etapa Contrato" (Facturas) bloqueaba el guardado. Dejarlas
// acá en el código, contra una columna de SharePoint de texto simple, evita
// esa clase de error: si algo no cuadra, se corrige en la app sin tocar
// SharePoint.
import { COLOR_ENCABEZADO, fechaISOaExcel } from './informeSOS';

export const TIPO_DOCUMENTO_OPTIONS = ["Factura", "Soporte de pago", "Cuenta de cobro", "Reembolso", "Transporte"];
export const ENTIDAD_BANCARIA_OPTIONS = ["BANCO DE BOGOTA", "BANCOLOMBIA", "BANCO BBVA", "COLPATRIA", "DAVIVIENDA", "FALABELLA", "NEQUI", "NU", "NO APLICA"];
export const TIPO_CUENTA_OPTIONS = ["AHORROS", "CORRIENTE", "NO APLICA"];

// Busca el proveedor por nombre exacto (normalizado: mayúsculas/minúsculas y
// espacios de sobra no importan) — igual que VLOOKUP(C2,'LISTA DE
// DATOS'!...,0) en el Excel real. Devuelve null si no hay match (proveedor
// nuevo, todavía no cargado en Proveedores Gastos MD).
export function buscarProveedor(pagadoA, proveedores){
  const nombre = (pagadoA||"").trim().toLowerCase();
  if(!nombre) return null;
  return (proveedores||[]).find(p => (p.PagadoA||"").trim().toLowerCase() === nombre) || null;
}

// Datos del banco a mostrar junto a un registro (Cuenta de cobro/Pago/
// Gasto) — "—" cuando el proveedor todavía no existe en la lista maestra,
// igual que el "-" que devuelve IFERROR(VLOOKUP(...)) en el Excel.
export function datosBancoProveedor(pagadoA, proveedores){
  const p = buscarProveedor(pagadoA, proveedores);
  return {
    identificacion: p?.Identificacion || "—",
    entidad: p?.Entidad || "—",
    cuenta: p?.Cuenta || "—",
    tipoCuenta: p?.TipoCuenta || "—",
  };
}

// Suma de "Valor a pagar" de una lista de registros (Cuentas de cobro/Pagos
// por realizar/Gastos) — para los totales que se muestran en cada tabla.
export function sumaValores(registros){
  return (registros||[]).reduce((s,r) => s + (Number(r.ValorAPagar)||0), 0);
}

// Próximo número consecutivo para "Numero" (Pagos por Realizar / Gastos) —
// pedido explícito del usuario 2026-09-01: al crear un registro nuevo, la
// app propone un número de 5 dígitos (con ceros a la izquierda) para que el
// usuario nombre el PDF de soporte con el mismo número al subirlo a la
// carpeta del mes. Es UN SOLO consecutivo compartido entre las dos listas
// (no uno por lista) — así nunca se repite el mismo número entre un "Pago
// por realizar" y un "Gasto", evitando choques de nombre de archivo dentro
// de la misma carpeta del mes. Ignora los "Numero" viejos importados del
// Excel real (alfanuméricos como "RDL1801", o de más de 5 dígitos como
// "70940076") — son de otro esquema, no de este consecutivo nuevo.
export function siguienteNumeroConsecutivo(pagosPorRealizar, gastos){
  const todos = [...(pagosPorRealizar||[]), ...(gastos||[])];
  const max = todos.reduce((m, r) => {
    const n = String(r.Numero||"").trim();
    if(!/^\d{1,5}$/.test(n)) return m;
    return Math.max(m, Number(n));
  }, 0);
  return String(max+1).padStart(5,'0');
}

// Filtra un arreglo de Cuentas de cobro/Pagos por realizar/Gastos a un mes
// calendario puntual, por "Fecha" — pedido explícito del usuario 2026-09-01
// ("coloca la lista del mes que solo salga ese mes").
export function filtrarPorMes(registros, anio, mesIndex0){
  return (registros||[]).filter(r => {
    const [y,m] = String(r.Fecha||"").split('-').map(Number);
    return y === anio && (m-1) === mesIndex0;
  });
}

// Excel de un mes de Cuentas de cobro/Pagos por realizar/Gastos — pedido
// explícito del usuario 2026-09-01 ("que también exporte el excel del
// mes"). Mismo estilo institucional que los demás Excel de la app (ver
// generarVacacionesExcel en vacaciones.js) — encabezado verde oscuro con
// texto blanco, columnas numéricas/de fecha alineadas a la derecha (ver
// [[feedback_alinear_valores_derecha]]).
export async function generarRegistrosGastosExcel(nombreHoja, filas, proveedores, { conNumero, conTipo } = {}){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombreHoja.slice(0,31));

  const titulos = [
    ...(conNumero ? ["Numero"] : []),
    "Pagado a", "Entidad", "Cuenta", "Tipo Cuenta", "Fecha", "Valor a pagar",
    ...(conTipo ? ["Tipo Documento"] : []),
    "Observación",
  ];
  const anchos = [
    ...(conNumero ? [14] : []),
    28, 18, 18, 14, 14, 16,
    ...(conTipo ? [16] : []),
    40,
  ];
  ws.columns = titulos.map((t,i) => ({ width: anchos[i] || 16 }));
  const headerRow = ws.addRow(titulos);
  headerRow.eachCell(cell => {
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb: COLOR_ENCABEZADO} };
    cell.font = { name:'Calibri', size:11, bold:true, color:{argb:'FFFFFFFF'} };
    cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
  });

  filas.forEach(r => {
    const banco = datosBancoProveedor(r.PagadoA, proveedores);
    const valores = [
      ...(conNumero ? [r.Numero || ""] : []),
      r.PagadoA || "", banco.entidad, banco.cuenta, banco.tipoCuenta,
      fechaISOaExcel(r.Fecha), Number(r.ValorAPagar)||0,
      ...(conTipo ? [r.TipoDocumento || ""] : []),
      r.Observacion || "",
    ];
    const row = ws.addRow(valores);
    const idxFecha = titulos.indexOf("Fecha")+1, idxValor = titulos.indexOf("Valor a pagar")+1;
    row.getCell(idxFecha).numFmt = 'dd/mm/yyyy';
    row.getCell(idxFecha).alignment = { horizontal:'right' };
    row.getCell(idxValor).alignment = { horizontal:'right' };
  });
  const idxValor = titulos.indexOf("Valor a pagar")+1;
  const filaTotal = new Array(titulos.length).fill("");
  filaTotal[0] = "Total";
  filaTotal[idxValor-1] = sumaValores(filas);
  const totalRow = ws.addRow(filaTotal);
  totalRow.getCell(idxValor).alignment = { horizontal:'right' };
  totalRow.font = { bold:true };

  ws.views = [{ state:'frozen', ySplit:1 }];
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreHoja}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
