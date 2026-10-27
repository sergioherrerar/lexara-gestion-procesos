// Correo de «Gastos del mes» (Administración → Egresos → Gastos, 2026-10-29, pedido del usuario): la lista de los gastos hechos durante el mes, con el enlace de cada
// soporte (factura y pago) en el cuerpo, más el Excel y el HTML adjuntos. Va para Beatriz (contadora) con copia a Gerencia, desde la cuenta de Soporte y con su firma.
import { fmtMonto, firmaHtml } from './graph';
import { sumaValores } from './gastos';
import { MESES_NOMBRES, dma } from './novedadesNomina';

function esc(t){ return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const pesos = n => '$ ' + fmtMonto(n);
const TH = 'padding:8px 10px; background:#004941; color:#ffffff; font-size:12.5px; text-align:left; border:1px solid #004941;';
const TD = 'padding:7px 10px; font-size:12.5px; border:1px solid #e4e4e1; color:#1c2624; vertical-align:top;';
const ENLACE = 'color:#1d5fa3; text-decoration:underline;';

export const CATEGORIA_GASTOS = 'Gastos del mes';
export const etiquetaMesGastos = (anio, mesIndex0) => `${MESES_NOMBRES[mesIndex0]} de ${anio}`;
export const nombreBaseArchivoGastos = (anio, mesIndex0) => `Gastos ${MESES_NOMBRES[mesIndex0]} ${anio}`;

// `filas` = los gastos del mes (ya filtrados). `srcFirma`: cid: en el correo real, data: en la vista previa.
export function construirCorreoGastos({ filas, anio, mesIndex0, pilaDestinataria = 'Beatriz', linkCarpetaMes, srcFirma, nombreExcel, nombreHtml }){
  const etiqueta = etiquetaMesGastos(anio, mesIndex0);
  const ordenadas = [...(filas || [])].sort((a, b) => String(a.Fecha || '').localeCompare(String(b.Fecha || '')) || String(a.Numero || '').localeCompare(String(b.Numero || '')));
  const total = sumaValores(ordenadas);
  const cuerpoTabla = ordenadas.map(r => `<tr>
    <td style="${TD}">${esc(r.Numero || '—')}</td>
    <td style="${TD}">${esc(r.PagadoA || '—')}</td>
    <td style="${TD}">${dma(r.Fecha)}</td>
    <td style="${TD} text-align:right; white-space:nowrap;">${pesos(Number(r.ValorAPagar) || 0)}</td>
    <td style="${TD}">${esc(r.TipoDocumento || '—')}</td>
    <td style="${TD}">${esc(r.Observacion || '—')}</td>
    <td style="${TD}">${r.SoporteFactura ? `<a href="${esc(r.SoporteFactura)}" style="${ENLACE}">Ver factura</a>` : '—'}</td>
    <td style="${TD}">${r.SoportePago ? `<a href="${esc(r.SoportePago)}" style="${ENLACE}">Ver pago</a>` : '—'}</td>
  </tr>`).join('');
  const tabla = ordenadas.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">
    <tr><th style="${TH}">No.</th><th style="${TH}">Pagado a</th><th style="${TH}">Fecha</th><th style="${TH} text-align:right;">Valor a pagar</th><th style="${TH}">Tipo</th><th style="${TH}">Observación</th><th style="${TH}">Factura</th><th style="${TH}">Pago</th></tr>
    ${cuerpoTabla}
    <tr><td style="${TD} background:#004941; color:#fff; font-weight:700;" colspan="3">Total (${ordenadas.length} gasto${ordenadas.length === 1 ? '' : 's'})</td><td style="${TD} background:#004941; color:#fff; font-weight:700; text-align:right; white-space:nowrap;">${pesos(total)}</td><td style="${TD} background:#004941;" colspan="4"></td></tr>
  </table>`
    : '<p style="margin:0; font-size:13.5px; color:#5c6b68;">No hay gastos registrados en este mes.</p>';
  const sinSoporte = ordenadas.filter(r => !r.SoporteFactura && !r.SoportePago).length;
  const asunto = `Gastos de ${etiqueta} — Lexara Abogados`;
  const html = `<div style="font-family:'Segoe UI', Arial, sans-serif; color:#1c2624; max-width:860px;">
  <p style="margin:0 0 12px; font-size:15px;">Buen día, ${esc(pilaDestinataria)}:</p>
  <p style="margin:0 0 14px; font-size:15px; line-height:1.55;">Te comparto la relación de los <strong>gastos hechos por MD Abogados SAS durante ${esc(etiqueta)}</strong>, con el enlace a la factura y al soporte de pago de cada uno.</p>
  ${linkCarpetaMes ? `<p style="margin:0 0 16px;"><a href="${esc(linkCarpetaMes)}" style="display:inline-block; padding:10px 18px; background:#004941; color:#ffffff; text-decoration:none; border-radius:6px; font-size:14px; font-weight:600;">Abrir la carpeta de soportes de ${esc(etiqueta)}</a></p>` : ''}
  ${tabla}
  ${sinSoporte ? `<p style="margin:8px 0 0; font-size:12.5px; color:#b3590a;">${sinSoporte} gasto${sinSoporte === 1 ? '' : 's'} aún sin soporte asociado.</p>` : ''}
  <p style="margin:18px 0 0; font-size:14px; line-height:1.55;">Adjunto encontrarás el <strong>Excel</strong>${nombreExcel ? ` (${esc(nombreExcel)})` : ''} y el <strong>HTML</strong>${nombreHtml ? ` (${esc(nombreHtml)})` : ''} con el mismo detalle y los enlaces a los soportes.</p>
  <p style="margin:12px 0 0; font-size:14px;">Quedamos atentos a cualquier inquietud.</p>
  <p style="margin:14px 0 0; font-size:14px;">Cordial saludo,</p>
  ${firmaHtml('soporte', srcFirma)}
</div>`;
  return { asunto, html };
}
