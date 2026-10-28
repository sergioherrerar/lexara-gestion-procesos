// Correo de «Órdenes Colmédica» (Administración → Facturación → Órdenes Colmédica, 2026-10-29, pedido del usuario): va para Dania (Colmédica) con copia a Gerencia, desde Soporte.
// Mensaje de apertura (editable) + la relación de las contestaciones hechas durante el mes por Colmédica, Aliansalud y Unidad Médica de Diagnóstico (cantidad y valor por tipo),
// y adjuntos: la orden de compra (PDF) y el Excel de cada uno de esos clientes. Mes calendario completo (día 1 al 30/31), igual que la pestaña.
import { fmtMonto, firmaHtml } from './graph';
import { MESES_NOMBRES } from './ordenesComprasColmedica';

export const CORREO_DANIA_COLMEDICA = 'daniacp@colmedica.com';
export const CATEGORIA_ORDENES_COLMEDICA = 'Órdenes Colmédica';
export const MENSAJE_POR_DEFECTO = 'Adjunto envío soportes para autorización de emisión de facturas electrónicas del grupo Colmédica.';

function esc(t){ return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const pesos = n => '$ ' + fmtMonto(n);
const TH = 'padding:8px 10px; background:#004941; color:#ffffff; font-size:12.5px; text-align:left; border:1px solid #004941;';
const TD = 'padding:7px 10px; font-size:13px; border:1px solid #e4e4e1; color:#1c2624;';

// «Buenos días» hasta el mediodía y «buenas tardes» después (según la hora de quien lo envía).
export function saludoSegunHora(fecha = new Date()){
  return fecha.getHours() < 12 ? 'buenos días' : 'buenas tardes';
}
export const etiquetaMesOrdenes = (anio, mesIndex0) => `${MESES_NOMBRES[mesIndex0]} de ${anio}`;

// `detalle` = calcularDetalleValoresPorCliente(...).detalle: [{ cliente, filas:[{ tipoRespuesta, cantidad, total }], totalCliente }].
// `adjuntos` = [{ nombre }] solo para listarlos en el texto. `srcFirma`: cid: en el correo real, data: en la vista previa.
export function construirCorreoOrdenesColmedica({ mesIndex0, anio, detalle, totalGeneral, mensaje, adjuntos, srcFirma, fecha }){
  const etiqueta = etiquetaMesOrdenes(anio, mesIndex0);
  const parrafos = String(mensaje || '').split(/\n{1,}/).map(p => p.trim()).filter(Boolean);
  const cuerpoTabla = (detalle || []).map(g => {
    const filas = g.filas.map(f => `<tr><td style="${TD}">${esc(g.cliente)}</td><td style="${TD}">${esc(f.tipoRespuesta)}</td><td style="${TD} text-align:right;">${f.cantidad}</td><td style="${TD} text-align:right; white-space:nowrap;">${pesos(f.total)}</td></tr>`).join('');
    const cant = g.filas.reduce((s, f) => s + f.cantidad, 0);
    return filas + `<tr><td style="${TD} background:#e3efee; font-weight:700;" colspan="2">Total ${esc(g.cliente)}</td><td style="${TD} background:#e3efee; font-weight:700; text-align:right;">${cant}</td><td style="${TD} background:#e3efee; font-weight:700; text-align:right; white-space:nowrap;">${pesos(g.totalCliente)}</td></tr>`;
  }).join('');
  const cantidadTotal = (detalle || []).reduce((s, g) => s + g.filas.reduce((a, f) => a + f.cantidad, 0), 0);
  const tabla = (detalle || []).length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">
    <tr><th style="${TH}">Cliente</th><th style="${TH}">Tipo de contestación</th><th style="${TH} text-align:right;">Cantidad</th><th style="${TH} text-align:right;">Valor</th></tr>
    ${cuerpoTabla}
    <tr><td style="${TD} background:#004941; color:#fff; font-weight:700;" colspan="2">Total general</td><td style="${TD} background:#004941; color:#fff; font-weight:700; text-align:right;">${cantidadTotal}</td><td style="${TD} background:#004941; color:#fff; font-weight:700; text-align:right; white-space:nowrap;">${pesos(totalGeneral)}</td></tr>
  </table>`
    : '<p style="margin:0; font-size:13.5px; color:#5c6b68;">No hubo contestaciones en este mes.</p>';
  const asunto = `Soportes para autorización de emisión de facturas electrónicas — Grupo Colmédica — ${etiqueta}`;
  const html = `<div style="font-family:'Segoe UI', Arial, sans-serif; color:#1c2624; max-width:820px;">
  <p style="margin:0 0 12px; font-size:15px;">Dra. Carolina, ${saludoSegunHora(fecha)}.</p>
  ${parrafos.map(p => `<p style="margin:0 0 12px; font-size:15px; line-height:1.55;">${esc(p)}</p>`).join('')}
  <p style="margin:18px 0 4px; font-size:16px; font-weight:700; color:#004941;">Relación de contestaciones hechas durante ${esc(etiqueta)}</p>
  <p style="margin:0 0 10px; font-size:12.5px; color:#5c6b68;">Colmédica, Aliansalud y Unidad Médica y de Diagnóstico · mes calendario completo, por fecha de vencimiento</p>
  ${tabla}
  ${(adjuntos || []).length ? `<p style="margin:16px 0 0; font-size:13.5px; line-height:1.55; color:#1c2624;"><strong>Adjuntos:</strong> ${(adjuntos || []).map(a => esc(a.nombre)).join(' · ')}</p>` : ''}
  <p style="margin:16px 0 0; font-size:14px;">Cordial saludo,</p>
  ${firmaHtml('soporte', srcFirma)}
</div>`;
  return { asunto, html };
}
