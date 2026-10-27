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
export const ENTIDAD_BANCARIA_OPTIONS = ["BANCO DE BOGOTA", "BANCOLOMBIA", "BANCO BBVA", "CAJA SOCIAL", "COLPATRIA", "DAVIVIENDA", "FALABELLA", "NEQUI", "NU", "NO APLICA"];
export const TIPO_CUENTA_OPTIONS = ["AHORROS", "CORRIENTE", "NO APLICA"];

// Las cuentas de cobro casi nunca tienen documento (las genera Siigo y no se tiene acceso a ellas): en esos gastos el Soporte Factura se muestra como «No aplica» y solo se espera el soporte de pago.
export const esCuentaDeCobro = r => String((r && r.TipoDocumento) || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim() === 'cuenta de cobro';

// ¿Ya existe este proveedor? (2026-10-20, pedido del usuario: el formulario dejó crear DOS veces a Miguel Angel Torres Ospina). Se compara por NOMBRE (sin tildes, mayúsculas ni
// espacios de sobra) y por IDENTIFICACIÓN (solo letras y números; se ignoran las muy cortas o vacías). `idPropio` excluye al registro que se está editando.
const claveTexto = t => String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const claveId = t => String(t||'').toLowerCase().replace(/[^a-z0-9]/g, '');
export function proveedorRepetido(proveedores, datos, idPropio = null){
  const nombre = claveTexto(datos && datos.PagadoA);
  const ident = claveId(datos && datos.Identificacion);
  for(const p of proveedores || []){
    if(idPropio != null && String(p.id) === String(idPropio)) continue;
    if(nombre && claveTexto(p.PagadoA) === nombre) return { proveedor: p, por: 'nombre' };
    if(ident.length >= 5 && claveId(p.Identificacion) === ident) return { proveedor: p, por: 'identificación' };
  }
  return null;
}

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
// El Excel se arma en `crearExcelRegistrosGastos` (devuelve los bytes) para poder adjuntarlo a un correo (2026-10-29, correo de gastos del mes a Beatriz);
// `generarRegistrosGastosExcel` es el mismo Excel como descarga. Con `conSoportes` agrega las columnas «Soporte Factura»/«Soporte Pago» con el enlace real de cada una.
export async function generarRegistrosGastosExcel(nombreHoja, filas, proveedores, opciones = {}){
  const buffer = await crearExcelRegistrosGastos(nombreHoja, filas, proveedores, opciones);
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
export async function crearExcelRegistrosGastos(nombreHoja, filas, proveedores, { conNumero, conTipo, conSoportes } = {}){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombreHoja.slice(0,31));

  const titulos = [
    ...(conNumero ? ["Numero"] : []),
    "Pagado a", "Entidad", "Cuenta", "Tipo Cuenta", "Fecha", "Valor a pagar",
    ...(conTipo ? ["Tipo Documento"] : []),
    "Observación",
    ...(conSoportes ? ["Soporte Factura", "Soporte Pago"] : []),
  ];
  const anchos = [
    ...(conNumero ? [14] : []),
    28, 18, 18, 14, 14, 16,
    ...(conTipo ? [16] : []),
    40,
    ...(conSoportes ? [16, 16] : []),
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
      ...(conSoportes ? [r.SoporteFactura ? { text: 'Ver factura', hyperlink: r.SoporteFactura } : "", r.SoportePago ? { text: 'Ver pago', hyperlink: r.SoportePago } : ""] : []),
    ];
    const row = ws.addRow(valores);
    const idxFecha = titulos.indexOf("Fecha")+1, idxValor = titulos.indexOf("Valor a pagar")+1;
    row.getCell(idxFecha).numFmt = 'dd/mm/yyyy';
    row.getCell(idxFecha).alignment = { horizontal:'right' };
    row.getCell(idxValor).alignment = { horizontal:'right' };
    if(conSoportes) ["Soporte Factura", "Soporte Pago"].forEach(t => { const c = row.getCell(titulos.indexOf(t)+1); if(c.value) c.font = { color: { argb: 'FF1D5FA3' }, underline: true }; });
  });
  const idxValor = titulos.indexOf("Valor a pagar")+1;
  const filaTotal = new Array(titulos.length).fill("");
  filaTotal[0] = "Total";
  filaTotal[idxValor-1] = sumaValores(filas);
  const totalRow = ws.addRow(filaTotal);
  totalRow.getCell(idxValor).alignment = { horizontal:'right' };
  totalRow.font = { bold:true };

  ws.views = [{ state:'frozen', ySplit:1 }];
  return wb.xlsx.writeBuffer();
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
export function generarRegistrosGastosHTML(titulo, filas, proveedores, opciones = {}){
  const html = crearHTMLRegistrosGastos(titulo, filas, proveedores, opciones);
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
// Mismo HTML como texto, para adjuntarlo a un correo (2026-10-29).
export function crearHTMLRegistrosGastos(titulo, filas, proveedores, { conNumero, conTipo, conSoportes, linkCarpetaMes, mesLabel } = {}){
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
  /* Aptos (pedido explícito 2026-09-07): fuente local de Microsoft 365/
     Windows 11, no existe como fuente web — cae a Georgia/Arial si el
     equipo no la tiene. */
  :root{ --verde-oscuro:#004941; --gris-claro:#f4f4f2; --gris-linea:#e4e4e1; --texto:#1c2624; --texto-suave:#5c6b68; --font-display:'Aptos Display','Aptos',Georgia,serif; --font-body:'Aptos',Arial,sans-serif; }
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
  return html;
}

// ---------------------------------------------------------------------------------------------------------------------
// Buscar los soportes de un mes automáticamente (2026-10-20, pedido del usuario): en la carpeta de soportes del mes los PDF suelen llamarse como el documento y el
// proveedor — «Factura Claro», «Factura Cendiatra», «Tu Factura ETB Octubre de 2026» — y el comprobante de pago «Soporte Claro». Se empareja cada gasto con su
// archivo por el NOMBRE DEL PROVEEDOR y por la palabra del tipo de documento; solo se asigna si el emparejamiento es claro (un único archivo, que no reclame otro gasto).
const PALABRAS_VACIAS = new Set(['sas', 's', 'a', 'sa', 'ltda', 'de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'para', 'por', 'con', 'grupo', 'empresa', 'servicios', 'cia', 'co', 'inc', 'pbc']);
const palabrasDe = t => claveTexto(t).split(/[^a-z0-9ñ]+/).filter(Boolean);
export function palabrasProveedor(nombre){
  return [...new Set(palabrasDe(nombre).filter(w => w.length >= 3 && !PALABRAS_VACIAS.has(w)))];
}
// Palabras del tipo de documento que debe decir el archivo de la factura (Factura → «factura»; Cuenta de cobro → «cuenta»+«cobro»…).
function palabrasTipoDocumento(tipo){
  const t = claveTexto(tipo);
  if(!t || t === 'soporte de pago') return ['factura'];
  return palabrasDe(t).filter(w => w.length >= 3 && w !== 'de');
}
// Puntaje de un archivo para un proveedor: fracción de las palabras del proveedor que aparecen en el nombre (0 si ninguna o menos de la mitad).
// `unicas`: palabras del proveedor que NO están en el nombre de ningún otro proveedor registrado (p. ej. «miguel» en «Soporte pago Miguel»): con una sola de esas basta, aunque el
// archivo no traiga el nombre completo (las personas suelen aparecer solo con el nombre o el apellido).
function puntajeProveedor(nombreArchivo, palabras, unicas){
  if(!palabras.length) return 0;
  const enArchivo = new Set(palabrasDe(nombreArchivo));
  const encontradas = palabras.filter(w => enArchivo.has(w));
  const fraccion = encontradas.length / palabras.length;
  if(encontradas.length >= 1 && fraccion >= 0.5) return fraccion;
  if(encontradas.length >= 1 && unicas && encontradas.every(w => unicas.has(w) && w.length >= 4)) return fraccion;
  return 0;
}
/**
 * Propone, para cada gasto, el archivo de la factura y el del pago.
 * @param archivos  [{ nombre, url, driveId, itemId }] de la carpeta del mes
 * @param registros [{ id, PagadoA, TipoDocumento }]
 * @returns { propuestas: Map<id, { factura?: archivo, pago?: archivo }>, ambiguos: number }
 */
export function emparejarSoportes(archivos, registros, proveedores = null){
  const crudas = [];
  let ambiguos = 0;
  // Cuántos proveedores registrados llevan cada palabra: las que solo lleva uno identifican a ese proveedor.
  const frecuencia = new Map();
  (proveedores || []).forEach(p => palabrasProveedor(p.PagadoA).forEach(w => frecuencia.set(w, (frecuencia.get(w) || 0) + 1)));
  for(const r of registros){
    const palabras = palabrasProveedor(r.PagadoA);
    const unicas = proveedores ? new Set(palabras.filter(w => (frecuencia.get(w) || 0) <= 1)) : null;
    const tipo = palabrasTipoDocumento(r.TipoDocumento);
    const candidatos = (archivos || []).map(a => ({ a, p: puntajeProveedor(a.nombre, palabras, unicas), n: new Set(palabrasDe(a.nombre)) })).filter(c => c.p > 0);
    const elegir = (filtro) => {
      const lista = candidatos.filter(filtro);
      if(!lista.length) return null;
      const mejor = Math.max(...lista.map(c => c.p));
      const top = lista.filter(c => c.p === mejor);
      if(top.length > 1){ ambiguos++; return null; }
      return top[0].a;
    };
    const factura = elegir(c => tipo.every(w => c.n.has(w)));
    const pago = elegir(c => (c.n.has('soporte') || c.n.has('comprobante') || c.n.has('pago')) && !c.n.has('factura'));
    crudas.push({ id: r.id, factura, pago });
  }
  // Un archivo que reclaman dos gastos distintos no se asigna a ninguno (no se sabe cuál es).
  const usos = new Map();
  crudas.forEach(c => ['factura', 'pago'].forEach(k => { if(c[k]) usos.set(c[k].itemId || c[k].url, (usos.get(c[k].itemId || c[k].url) || 0) + 1); }));
  const propuestas = new Map();
  crudas.forEach(c => {
    const p = {};
    ['factura', 'pago'].forEach(k => { if(c[k]){ if(usos.get(c[k].itemId || c[k].url) > 1) ambiguos++; else p[k] = c[k]; } });
    if(p.factura || p.pago) propuestas.set(c.id, p);
  });
  return { propuestas, ambiguos };
}
