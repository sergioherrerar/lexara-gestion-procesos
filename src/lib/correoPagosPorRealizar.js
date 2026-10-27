// Correo «Pagos por realizar» (Administración → Egresos → Gastos, 2026-10-29, pedido del usuario): de Soporte para Gerencia. Se elige un día y se filtran todos los pagos
// de ese día; la tabla trae los datos de la cuenta de cada proveedor (identificación, entidad, cuenta y tipo de cuenta) para poder hacerles el pago.
import { fmtMonto, firmaHtml } from './graph';
import { sumaValores, datosBancoProveedor } from './gastos';
import { dma } from './novedadesNomina';

function esc(t){ return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const pesos = n => '$ ' + fmtMonto(n);
const TH = 'padding:8px 10px; background:#004941; color:#ffffff; font-size:12.5px; text-align:left; border:1px solid #004941;';
const TD = 'padding:7px 10px; font-size:12.5px; border:1px solid #e4e4e1; color:#1c2624; vertical-align:top;';

export const CATEGORIA_PAGOS_POR_REALIZAR = 'Pagos por realizar';

export const pagosDelDia = (registros, diaISO) => (registros || []).filter(r => String(r.Fecha || '').slice(0, 10) === diaISO);

// Día más útil para abrir el selector: hoy si hay pagos hoy; si no, el último día con pagos; si no hay ninguno, hoy.
export function diaInicialPagos(registros){
  const d = new Date();
  const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dias = [...new Set((registros || []).map(r => String(r.Fecha || '').slice(0, 10)).filter(Boolean))].sort();
  if(dias.includes(hoy)) return hoy;
  const anterior = dias.filter(x => x <= hoy).pop();
  return anterior || dias.pop() || hoy;
}

// `filas` = los pagos del día elegido. `srcFirma`: cid: en el correo real, data: en la vista previa.
export function construirCorreoPagosPorRealizar({ filas, proveedores, diaISO, pilaDestinataria = 'Mónica', srcFirma }){
  const ordenadas = [...(filas || [])].sort((a, b) => String(a.Numero || '').localeCompare(String(b.Numero || '')) || String(a.PagadoA || '').localeCompare(String(b.PagadoA || '')));
  const total = sumaValores(ordenadas);
  const sinCuenta = [];
  const cuerpo = ordenadas.map(r => {
    const b = datosBancoProveedor(r.PagadoA, proveedores);
    const falta = b.cuenta === '—' || b.entidad === '—';
    if(falta) sinCuenta.push(r.PagadoA || '(sin nombre)');
    return `<tr>
    <td style="${TD}">${esc(r.Numero || '—')}</td>
    <td style="${TD} font-weight:600;">${esc(r.PagadoA || '—')}</td>
    <td style="${TD}">${esc(b.identificacion)}</td>
    <td style="${TD}">${esc(b.entidad)}</td>
    <td style="${TD} white-space:nowrap;">${esc(b.cuenta)}</td>
    <td style="${TD}">${esc(b.tipoCuenta)}</td>
    <td style="${TD} text-align:right; white-space:nowrap; font-weight:600;">${pesos(Number(r.ValorAPagar) || 0)}</td>
    <td style="${TD}">${esc(r.TipoDocumento || '—')}</td>
    <td style="${TD}">${esc(r.Observacion || '—')}</td>
  </tr>`;
  }).join('');
  const tabla = ordenadas.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">
    <tr><th style="${TH}">No.</th><th style="${TH}">Pagar a</th><th style="${TH}">Identificación</th><th style="${TH}">Entidad</th><th style="${TH}">Cuenta</th><th style="${TH}">Tipo cuenta</th><th style="${TH} text-align:right;">Valor a pagar</th><th style="${TH}">Tipo</th><th style="${TH}">Observación</th></tr>
    ${cuerpo}
    <tr><td style="${TD} background:#004941; color:#fff; font-weight:700;" colspan="6">Total a pagar (${ordenadas.length} pago${ordenadas.length === 1 ? '' : 's'})</td><td style="${TD} background:#004941; color:#fff; font-weight:700; text-align:right; white-space:nowrap;">${pesos(total)}</td><td style="${TD} background:#004941;" colspan="2"></td></tr>
  </table>`
    : '<p style="margin:0; font-size:13.5px; color:#5c6b68;">No hay pagos registrados para este día.</p>';
  const asunto = `Pagos por realizar — ${dma(diaISO)}`;
  const html = `<div style="font-family:'Segoe UI', Arial, sans-serif; color:#1c2624; max-width:900px;">
  <p style="margin:0 0 12px; font-size:15px;">Buen día, ${esc(pilaDestinataria)}:</p>
  <p style="margin:0 0 16px; font-size:15px; line-height:1.55;">Estos son los <strong>pagos por realizar del ${dma(diaISO)}</strong>, con los datos de la cuenta de cada uno:</p>
  ${tabla}
  ${sinCuenta.length ? `<p style="margin:8px 0 0; font-size:12.5px; color:#b3590a;">Sin datos bancarios registrados: ${esc([...new Set(sinCuenta)].join(', '))}.</p>` : ''}
  <p style="margin:18px 0 0; font-size:14px; line-height:1.55;">Quedamos atentos para el soporte de cada pago una vez realizados.</p>
  <p style="margin:14px 0 0; font-size:14px;">Cordial saludo,</p>
  ${firmaHtml('soporte', srcFirma)}
</div>`;
  return { asunto, html, sinCuenta: [...new Set(sinCuenta)] };
}
