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
import { fmtDate, fmtMonto } from './graph';

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
// Antes se cruzaba también contra "Pagos por Realizar" (para no repetir el
// consecutivo entre las 2 listas) — esa lista se dejó de usar 2026-09-02
// (pedido explícito del usuario, "todo lo puedo sacar de gastos con los
// filtros"), así que el consecutivo ahora es solo de Gastos.
export function siguienteNumeroConsecutivo(gastos){
  const max = (gastos||[]).reduce((m, r) => {
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

function escapeHtml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// HTML descargable de un mes de Cuentas de cobro/Pagos por realizar/Gastos —
// pedido explícito del usuario 2026-09-01 ("por favor incluye botón exporta
// el HTML"), para enviarlo por correo/WhatsApp a un tercero (ej. la
// contadora externa) — con el link real de cada Soporte Factura/Pago como
// enlace en el que puede hacer clic, sin tener que mandarle los PDF sueltos
// aparte. Mismo estilo institucional que generarInformeClienteHTML.js — un
// .html autocontenido, sin depender de que siga corriendo la app.
export function generarRegistrosGastosHTML(titulo, filas, proveedores, { conNumero, conTipo, conSoportes, linkCarpetaMes, mesLabel } = {}){
  const total = sumaValores(filas);
  const fechaLarga = new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'long', year:'numeric' });

  const filasHtml = filas.map(r => {
    const banco = datosBancoProveedor(r.PagadoA, proveedores);
    return `<tr>
      ${conNumero ? `<td>${escapeHtml(r.Numero||"—")}</td>` : ''}
      <td>${escapeHtml(r.PagadoA)}</td>
      <td>${escapeHtml(banco.entidad)}</td>
      <td>${escapeHtml(fmtDate(r.Fecha))}</td>
      <td class="valor">$ ${fmtMonto(Number(r.ValorAPagar)||0)}</td>
      ${conTipo ? `<td>${escapeHtml(r.TipoDocumento||"—")}</td>` : ''}
      <td>${escapeHtml(r.Observacion||"—")}</td>
      ${conSoportes ? `<td>${r.SoporteFactura ? `<a href="${escapeHtml(r.SoporteFactura)}" target="_blank" rel="noopener noreferrer">Ver factura</a>` : '—'}</td>` : ''}
      ${conSoportes ? `<td>${r.SoportePago ? `<a href="${escapeHtml(r.SoportePago)}" target="_blank" rel="noopener noreferrer">Ver pago</a>` : '—'}</td>` : ''}
    </tr>`;
  }).join('');

  const nCols = 4 + (conNumero?1:0) + (conTipo?1:0) + (conSoportes?2:0);

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(titulo)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Inter:wght@400;500;600;700&display=swap');
  :root{ --verde-oscuro:#004941; --gris-claro:#f4f4f2; --gris-linea:#e4e4e1; --texto:#1c2624; --texto-suave:#5c6b68; --font-display:'Fraunces',Georgia,serif; --font-body:'Inter',Arial,sans-serif; }
  *{box-sizing:border-box;}
  body{margin:0; font-family:var(--font-body); background:var(--gris-claro); color:var(--texto); -webkit-font-smoothing:antialiased;}
  .header{background:var(--verde-oscuro); color:#fff; padding:22px 28px; display:flex; align-items:center; justify-content:space-between; gap:18px; flex-wrap:wrap;}
  .header h1{font-family:var(--font-display); font-size:21px; font-weight:600; margin:0 0 4px;}
  .header p{margin:0; font-size:12.5px; color:rgba(255,255,255,.75);}
  /* Enlace de solo lectura a la carpeta de soportes del mes — pedido
     explícito del usuario 2026-09-02. Fondo claro sobre el verde oscuro del
     encabezado para que se note que es un botón, texto centrado dentro de
     su propia caja. */
  .header-carpeta{
    background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.4); border-radius:10px;
    padding:10px 18px; text-align:center; color:#fff; text-decoration:none; max-width:230px;
    transition:background .15s ease;
  }
  .header-carpeta:hover{background:rgba(255,255,255,.22);}
  .header-carpeta .carpeta-eyebrow{display:block; font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:rgba(255,255,255,.7); margin-bottom:3px;}
  .header-carpeta strong{display:block; font-size:12.5px; font-weight:600; line-height:1.35;}
  .contenido{max-width:1000px; margin:0 auto; padding:22px 20px 50px;}
  .panel{background:#fff; border:1px solid var(--gris-linea); border-radius:12px; box-shadow:0 1px 3px rgba(0,20,18,.08); overflow:hidden;}
  table{width:100%; border-collapse:collapse; font-size:13px;}
  th,td{padding:9px 12px; border-bottom:1px solid var(--gris-linea); text-align:left;}
  th{background:linear-gradient(135deg,#e9f5f3,#f4faf9); color:var(--verde-oscuro); font-size:11px; text-transform:uppercase; letter-spacing:.03em;}
  td.valor, th.valor{text-align:right; white-space:nowrap;}
  tfoot td{font-weight:700; border-bottom:none;}
  a{color:var(--verde-oscuro);}
  .empty-state{padding:30px 20px; text-align:center; color:var(--texto-suave); font-size:13px;}
  footer{max-width:1000px; margin:0 auto; padding:16px 20px 30px; font-size:11px; color:var(--texto-suave); text-align:center;}
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${escapeHtml(titulo)}</h1>
      <p>Generado el ${escapeHtml(fechaLarga)} · Lexara Abogados</p>
    </div>
    ${linkCarpetaMes ? `<a class="header-carpeta" href="${escapeHtml(linkCarpetaMes)}" target="_blank" rel="noopener noreferrer">
      <span class="carpeta-eyebrow">📂 Carpeta de soportes (solo lectura)</span>
      <strong>Gastos generados por MD ABOGADOS durante ${escapeHtml(mesLabel||"el mes seleccionado")}</strong>
    </a>` : ''}
  </div>
  <div class="contenido">
    <div class="panel">
      ${filas.length ? `<table>
        <thead><tr>
          ${conNumero ? '<th>Numero</th>' : ''}
          <th>Pagado a</th><th>Entidad</th><th>Fecha</th><th class="valor">Valor a pagar</th>
          ${conTipo ? '<th>Tipo Documento</th>' : ''}
          <th>Observación</th>
          ${conSoportes ? '<th>Soporte Factura</th>' : ''}
          ${conSoportes ? '<th>Soporte Pago</th>' : ''}
        </tr></thead>
        <tbody>${filasHtml}</tbody>
        <tfoot><tr><td colspan="${nCols-1}" style="text-align:right;">Total</td><td class="valor">$ ${fmtMonto(total)}</td></tr></tfoot>
      </table>` : `<div class="empty-state">No hay registros para mostrar.</div>`}
    </div>
  </div>
  <footer>MD Abogados SAS · Generado automáticamente desde Lexara — Gestión de Procesos.</footer>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${titulo}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
