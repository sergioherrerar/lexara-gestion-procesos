import { stripHtml, parseMonto, fmtMonto, estadoBadgeClass } from './graph';

// Informe HTML por Cliente — pedido explícito del usuario 2026-08-25: en vez
// de un portal con inicio de sesión para que cada cliente vea solo sus
// propios procesos (que hubiera requerido invitarlos como usuarios de
// Microsoft y un modelo de permisos nuevo por fila, no solo por módulo),
// se optó por lo mismo que ya se hizo para el Dashboard — un archivo .html
// autocontenido, generado bajo demanda por el despacho y enviado por correo
// al cliente. Más simple, sin exponer credenciales de SharePoint a nadie
// externo, y reutiliza el mismo patrón ya probado en exportarDashboardHTML.js.
//
// A diferencia del export del Dashboard, este NO tiene filtros ni gráficos
// interactivos — es una "ficha de cuenta" fija: cuántos procesos tiene ese
// cliente, cuáles están vigentes/terminados, el valor total de cartera, la
// lista de sus procesos, y un botón grande para pagar (portal de Davivienda,
// ver INITIAL_CONFIG.DAVIVIENDA_PAGOS_URL en config.js).

const VERDE_OSCURO = '004941';
const GRIS_SUAVE = '5c6b68';
const GRIS_LINEA = 'e4e4e1';
const TEXTO = '1c2624';

function escapeHtml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function generarInformeClienteHTML(procesos, cliente, daviviendaUrl){
  const nombreCliente = (cliente||"").trim();
  const propios = procesos.filter(p => (p.Cliente||"").trim() === nombreCliente);

  const filas = propios.map(p => ({
    radicado: p.Radicado || "Sin radicado",
    despacho: `${p.Despacho||""}${p.NumeroDespacho ? ' · '+p.NumeroDespacho : ''}`.trim() || "Sin dato",
    estado: stripHtml(p.Estado) || "Sin novedades registradas.",
    // Histórico: el log cronológico completo del proceso — campo DISTINTO de
    // Estado (que es la novedad más reciente), ver [[project_procesos_extended_fields]].
    // Pedido explícito del usuario 2026-08-25 ("coloca el histórico").
    historico: stripHtml(p.Historico) || "Sin histórico registrado.",
    badge: estadoBadgeClass(p.EstadoVT, p.FechaUltimoEstado, p.Estado),
    estadoVT: stripHtml(p.EstadoVT) || "Sin dato",
    terminado: (stripHtml(p.EstadoVT)||"").toLowerCase().includes('termin'),
    valorCartera: parseMonto(p.ValorCarteraActual || p.ValorActualDemanda),
  })).sort((a,b) => a.radicado.localeCompare(b.radicado));

  const activos = filas.filter(f => !f.terminado).length;
  const terminados = filas.length - activos;
  const valorCarteraTotal = filas.reduce((s,f) => s + f.valorCartera, 0);

  const fechaLarga = new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'long', year:'numeric' });
  const iconoSvg = '<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 30 L50 50 L80 30" stroke="currentColor" stroke-width="14" fill="none" stroke-linecap="square"/><path d="M20 70 L50 50 L80 70" stroke="currentColor" stroke-width="14" fill="none" stroke-linecap="square"/></svg>';

  const tarjetasHtml = filas.map(f => `
    <div class="proceso-card">
      <div class="proceso-card-head">
        <div>
          <div class="proceso-card-radicado">${escapeHtml(f.radicado)}</div>
          <div class="proceso-card-despacho">${escapeHtml(f.despacho)}</div>
        </div>
        <span class="badge ${f.badge}">${escapeHtml(f.estadoVT)}</span>
      </div>
      <div class="proceso-card-body">
        <div class="proceso-card-col">
          <div class="proceso-card-col-title">Estado actual</div>
          <p>${escapeHtml(f.estado)}</p>
        </div>
        <div class="proceso-card-col">
          <div class="proceso-card-col-title">Histórico</div>
          <p>${escapeHtml(f.historico)}</p>
        </div>
      </div>
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Informe de procesos — ${escapeHtml(nombreCliente)}</title>
<style>
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Inter:wght@400;500;600;700&display=swap');
    :root{
      --verde-oscuro:#004941; --verde-oscuro-2:#003630; --verde-claro:#52bbb5;
      --naranja:#ef7d00; --gris-claro:#f4f4f2; --gris-linea:#e4e4e1;
      --texto:#1c2624; --texto-suave:#5c6b68;
      --font-display:'Fraunces', Georgia, serif; --font-body:'Inter', Arial, sans-serif; --font-mono:'Inter', monospace;
      --radius:12px; --shadow:0 1px 3px rgba(0,20,18,.08);
    }
    *{box-sizing:border-box;}
    body{margin:0; font-family:var(--font-body); background:var(--gris-claro); color:var(--texto); -webkit-font-smoothing:antialiased;}
    .header{background:radial-gradient(circle at 15% 20%, var(--verde-oscuro-2), var(--verde-oscuro) 65%); color:#fff; padding:26px 28px;}
    .header .marca{display:flex; align-items:center; gap:10px; margin-bottom:14px;}
    .header .marca svg{width:22px; height:22px; color:#fff;}
    .header .marca span{font-weight:700; letter-spacing:.06em; font-size:13px; text-transform:uppercase;}
    .header h1{font-family:var(--font-display); font-size:23px; font-weight:600; margin:0 0 4px;}
    .header p{margin:0; font-size:12.5px; color:rgba(255,255,255,.75);}
    .contenido{max-width:1000px; margin:0 auto; padding:24px 20px 60px;}
    .kpi-grid{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:22px;}
    .kpi{background:#fff; border:1px solid var(--gris-linea); border-radius:var(--radius); box-shadow:var(--shadow); padding:16px 18px;}
    .kpi .label{font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--texto-suave); margin-bottom:6px;}
    .kpi .valor{font-family:var(--font-display); font-size:24px; font-weight:600; color:var(--verde-oscuro);}
    .pago{background:#fff; border:1px solid var(--gris-linea); border-radius:var(--radius); box-shadow:var(--shadow); padding:22px; text-align:center; margin-bottom:26px;}
    .pago p{margin:0 0 14px; color:var(--texto-suave); font-size:13.5px;}
    .btn-pagar{display:inline-block; background:var(--verde-oscuro); color:#fff !important; text-decoration:none; font-weight:700; font-size:15px; padding:14px 34px; border-radius:8px; letter-spacing:.02em;}
    .btn-pagar:hover{background:var(--verde-oscuro-2);}
    .panel{background:#fff; border:1px solid var(--gris-linea); border-radius:var(--radius); box-shadow:var(--shadow); overflow:hidden;}
    .panel-head{padding:16px 20px; border-bottom:1px solid var(--gris-linea);}
    .panel-head h3{font-family:var(--font-display); font-size:16px; font-weight:600; margin:0; color:var(--verde-oscuro);}
    .panel-body{padding:16px 20px;}
    .badge{display:inline-flex; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; white-space:nowrap; flex-shrink:0;}
    .badge-verde{background:#e3efee; color:var(--verde-oscuro);}
    .badge-naranja{background:#fdf1e2; color:#b3590a;}
    .badge-rojo{background:#fbe4e2; color:#a3281c;}
    .badge-gris{background:#eceeed; color:var(--texto-suave);}
    /* Una tarjeta por proceso — Estado actual e Histórico completo, uno al
       lado del otro en pantallas anchas (en vez de una tabla, que dejaba el
       texto largo apretado en una columna angosta). */
    .proceso-card{border:1px solid var(--gris-linea); border-radius:var(--radius); margin-bottom:14px; overflow:hidden;}
    .proceso-card:last-child{margin-bottom:0;}
    .proceso-card-head{display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 18px; background:var(--gris-claro); border-bottom:1px solid var(--gris-linea);}
    .proceso-card-radicado{font-weight:700; color:var(--verde-oscuro); font-size:14px;}
    .proceso-card-despacho{font-size:12px; color:var(--texto-suave); margin-top:2px;}
    .proceso-card-body{display:grid; grid-template-columns:1fr 1fr; gap:0;}
    .proceso-card-col{padding:14px 18px;}
    .proceso-card-col:first-child{border-right:1px solid var(--gris-linea);}
    .proceso-card-col-title{font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--texto-suave); font-weight:700; margin-bottom:6px;}
    .proceso-card-col p{margin:0; font-size:13px; line-height:1.55; color:var(--texto);}
    .empty-state{padding:40px 20px; text-align:center; color:var(--texto-suave); font-size:13.5px;}
    footer{max-width:1000px; margin:0 auto; padding:20px 20px 30px; font-size:11.5px; color:var(--texto-suave); text-align:center;}
    @media (max-width:640px){ .kpi-grid{grid-template-columns:repeat(2,1fr);} .proceso-card-body{grid-template-columns:1fr;} .proceso-card-col:first-child{border-right:none; border-bottom:1px solid var(--gris-linea);} }
  </style>
</head>
<body>
  <div class="header">
    <div class="marca">${iconoSvg}<span>MD Abogados SAS</span></div>
    <h1>Informe de procesos — ${escapeHtml(nombreCliente)}</h1>
    <p>Generado el ${escapeHtml(fechaLarga)} · Lexara Abogados</p>
  </div>
  <div class="contenido">
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Total de procesos</div><div class="valor">${filas.length}</div></div>
      <div class="kpi"><div class="label">Vigentes</div><div class="valor">${activos}</div></div>
      <div class="kpi"><div class="label">Terminados</div><div class="valor">${terminados}</div></div>
      <div class="kpi"><div class="label">Valor cartera actual</div><div class="valor" style="font-size:17px;">$ ${fmtMonto(valorCarteraTotal)}</div></div>
    </div>
    ${daviviendaUrl ? `<div class="pago">
      <p>Puedes realizar el pago de tus obligaciones con MD Abogados SAS a través de nuestro portal seguro con Davivienda.</p>
      <a class="btn-pagar" href="${escapeHtml(daviviendaUrl)}" target="_blank" rel="noopener noreferrer">Pagar factura</a>
    </div>` : ''}
    <div class="panel">
      <div class="panel-head"><h3>Detalle de procesos</h3></div>
      ${filas.length ? `<div class="panel-body">${tarjetasHtml}</div>` : `<div class="empty-state">No hay procesos registrados para este cliente.</div>`}
    </div>
  </div>
  <footer>MD Abogados SAS · Este informe se generó automáticamente con corte a la fecha indicada arriba y es solo para consulta — no reemplaza la comunicación directa con el despacho.</footer>
</body>
</html>`;

  descargarHTML(html, nombreCliente);
}

function descargarHTML(html, nombreCliente){
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const hoy = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `Informe de procesos - ${nombreCliente} - ${hoy}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
