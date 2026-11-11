// Correo de «Generador de facturas del mes» (Órdenes Colmédica, 2026-11-11, pedido del usuario): va para Beatriz (contadora) con copia a Gerencia, desde Soporte. Lista las facturas generadas a
// partir de las órdenes de compra del mes (Cliente · Orden de compra · Factura · Total) y lleva adjuntos los PDF de las facturas y de las órdenes que están en SharePoint:
// «ADMINISTRACION / 1 Soportes de gastos MD / {año} / {mes}» (el año y el mes son los de la fecha de cada documento, así que en 2027 se usa la carpeta 2027 sola).
import { fmtMonto, firmaHtml, parseMonto, computeFacturaTotals, ordenCompraNumero, facturaNumero } from './graph';
import { MESES_NOMBRES } from './ordenesComprasColmedica';
import { saludoFactura } from './correoSolicitudDocumento';

export const CATEGORIA_FACTURAS_COLMEDICA = 'Facturas Colmédica';
export const MENSAJE_FACTURAS_POR_DEFECTO = 'Por favor emitir las facturas electrónicas del Grupo Colmédica con el siguiente detalle. Adjunto las solicitudes de factura y las órdenes de compra.';

function esc(t){ return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const TH = 'padding:8px 10px; background:#004941; color:#ffffff; font-size:12.5px; text-align:left; border:1px solid #004941;';
const TD = 'padding:7px 10px; font-size:13px; border:1px solid #e4e4e1; color:#1c2624;';

export const etiquetaMesFacturas = (anio, mesIndex0) => `${MESES_NOMBRES[mesIndex0]} de ${anio}`;

/** Borrador de la factura de una orden de compra, ya como payload para SharePoint (mismos campos que «generar factura» de la orden; fecha = hoy). */
export function payloadFacturaDesdeOrden(oc, fecha = new Date()){
  const p = {
    CodigoCliente: parseMonto(oc.CodigoCliente), Contrato: oc.Contrato || '', Proceso: oc.Proceso || '', EtapaContrato: oc.EtapaContrato || '', Observacion: oc.Observacion || '',
    Dia: fecha.getDate(), Mes: fecha.getMonth() + 1, Anio: fecha.getFullYear(),
  };
  [1, 2, 3, 4, 5, 6].forEach(n => {
    p['Descripcion' + n] = oc['Descripcion' + n] || '';
    p['Cantidad' + n] = parseMonto(oc['Cantidad' + n]);
    p['ValorUnitario' + n] = parseMonto(oc['ValorUnitario' + n]);
  });
  return p;
}

/** ¿El nombre de archivo es el del documento `prefijo` (p. ej. «FE 828» o «OC-2026-0257»)? El número debe terminar ahí (FE 82 no es FE 828). */
export function archivoEsDeDocumento(nombre, prefijo){
  const n = String(nombre || '').trim().toLowerCase(), p = String(prefijo || '').trim().toLowerCase();
  if(!p || !n.startsWith(p)) return false;
  const sig = n.charAt(p.length);
  return sig === '' || sig === ' ' || sig === '.';
}

/** Busca, en la lista de archivos de la carpeta del mes, el PDF de la factura y el de la orden. */
export function buscarSoportesDeFila(archivos, oc, factura){
  const pdfs = (archivos || []).filter(a => /\.pdf$/i.test(a.nombre));
  return {
    pdfOrden: oc ? pdfs.find(a => archivoEsDeDocumento(a.nombre, ordenCompraNumero(oc))) || null : null,
    pdfFactura: factura ? pdfs.find(a => archivoEsDeDocumento(a.nombre, 'FE ' + facturaNumero(factura))) || null : null,
  };
}

// `filas` = [{ cliente, oc, factura }]; `adjuntos` = [{ nombre }]. `srcFirma`: cid: en el correo real, data: en la vista previa.
export function construirCorreoFacturasMes({ mesIndex0, anio, filas, mensaje, adjuntos, srcFirma, fecha }){
  const etiqueta = etiquetaMesFacturas(anio, mesIndex0);
  const parrafos = String(mensaje || '').split(/\n{1,}/).map(p => p.trim()).filter(Boolean);
  const total = f => (f?.factura ? computeFacturaTotals(f.factura).total : 0);
  const cuerpo = (filas || []).map(f => `<tr><td style="${TD}">${esc(f.cliente)}</td><td style="${TD}">${esc(f.oc ? ordenCompraNumero(f.oc) : '—')}</td><td style="${TD}">${esc(f.factura ? 'FE ' + facturaNumero(f.factura) : '—')}</td><td style="${TD} text-align:right; white-space:nowrap;">$ ${fmtMonto(total(f))}</td></tr>`).join('');
  const totalGeneral = (filas || []).reduce((s, f) => s + total(f), 0);
  const tabla = (filas || []).length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">
    <tr><th style="${TH}">Cliente</th><th style="${TH}">Orden de compra</th><th style="${TH}">Factura</th><th style="${TH} text-align:right;">Total con IVA</th></tr>
    ${cuerpo}
    <tr><td style="${TD} background:#004941; color:#fff; font-weight:700;" colspan="3">Total general</td><td style="${TD} background:#004941; color:#fff; font-weight:700; text-align:right; white-space:nowrap;">$ ${fmtMonto(totalGeneral)}</td></tr>
  </table>`
    : '<p style="margin:0; font-size:13.5px; color:#5c6b68;">No hay facturas para este mes.</p>';
  const asunto = `Emisión de facturas electrónicas Grupo Colmédica ${etiqueta}`;
  const html = `<div style="font-family:'Segoe UI', Arial, sans-serif; color:#1c2624; max-width:820px;">
  <p style="margin:0 0 12px; font-size:15px;">${saludoFactura('Beatriz', fecha)}</p>
  ${parrafos.map(p => `<p style="margin:0 0 12px; font-size:15px; line-height:1.55;">${esc(p)}</p>`).join('')}
  <p style="margin:18px 0 4px; font-size:16px; font-weight:700; color:#004941;">Facturas de ${esc(etiqueta)}</p>
  <p style="margin:0 0 10px; font-size:12.5px; color:#5c6b68;">Generadas a partir de las órdenes de compra del mes</p>
  ${tabla}
  ${(adjuntos || []).length ? `<p style="margin:16px 0 0; font-size:13.5px; line-height:1.55; color:#1c2624;"><strong>Adjuntos:</strong> ${(adjuntos || []).map(a => esc(a.nombre)).join(' · ')}</p>` : ''}
  <p style="margin:16px 0 0; font-size:14px;">Cordial saludo,</p>
  ${firmaHtml('soporte', srcFirma)}
</div>`;
  return { asunto, html };
}
