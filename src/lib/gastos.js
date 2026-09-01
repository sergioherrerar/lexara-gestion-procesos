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
