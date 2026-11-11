// Correo de solicitud de un documento creado desde «Honorarios por Proceso» (Administración → Facturación, 2026-10-29, pedido del usuario):
//   · Factura        → Para: Beatriz, con copia a Gerencia: «solicito generación de factura electrónica» con el detalle de la factura.
//   · Orden de compra → Para: quien se escriba a mano, con copia a Gerencia: «solicito generación de número de orden de compra» con el detalle de la orden.
// Se arma DESPUÉS de guardar el borrador (ya con Cantidad/Valor completos). Sale de la cuenta de Soporte, con su firma.
import { facturaLineItems, computeFacturaTotals, ordenCompraNumero, fmtMonto, parseMonto, firmaHtml, firmaComoImagenInline, crearBorradorConImagenesInline, nombrePdfDocumento, aplicarReglaContrato } from './graph';
import { dma, destinatariaNovedades, nombreDeSaludo, CORREO_GERENCIA_NOVEDADES } from './novedadesNomina';

function esc(t){ return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const pesos = n => '$ ' + fmtMonto(n);
const TH = 'padding:8px 10px; background:#004941; color:#ffffff; font-size:12.5px; text-align:left; border:1px solid #004941;';
const TD = 'padding:7px 10px; font-size:13px; border:1px solid #e4e4e1; color:#1c2624; vertical-align:top;';
const TDE = 'padding:8px 12px; width:34%; background:#f4f4f2; color:#5c6b68; font-size:13px; border:1px solid #e4e4e1;';

// Las etapas del contrato se guardan sin tilde («Administracion Proceso», así están las opciones en SharePoint); en el correo se muestran bien escritas y con la primera letra en mayúscula.
const PALABRAS_CON_TILDE = { administracion: 'Administración', admision: 'Admisión', asesoria: 'Asesoría', asesorias: 'Asesorías', auditoria: 'Auditoría', conciliacion: 'Conciliación', contestacion: 'Contestación', excepcion: 'Excepción', oposicion: 'Oposición', radicacion: 'Radicación', reposicion: 'Reposición', recurso: 'Recurso', articulo: 'Artículo', pruebas: 'Pruebas' };
export function conTildes(texto){
  const t = String(texto ?? '').trim().replace(/\b[A-Za-zÁÉÍÓÚáéíóúñÑ]+\b/g, w => PALABRAS_CON_TILDE[w.toLowerCase()] || w);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

// Saludo del correo de la factura (2026-11-11, pedido del usuario): «Beatriz, buenos días.» hasta el mediodía y «Beatriz, buenas tardes.» después, según la hora de quien lo crea.
export function saludoFactura(nombre, fecha = new Date()){
  const saludo = fecha.getHours() < 12 ? 'buenos días' : 'buenas tardes';
  return nombre ? esc(nombre) + ', ' + saludo + '.' : saludo.charAt(0).toUpperCase() + saludo.slice(1) + '.';
}

export const CATEGORIA_SOLICITUD_FACTURA = 'Solicitud de factura electrónica';
export const CATEGORIA_SOLICITUD_ORDEN = 'Solicitud de orden de compra';

function fechaDelDocumento(d){
  const dia = String(d.Dia || '').padStart(2, '0'), mes = String(d.Mes || '').padStart(2, '0'), anio = String(d.Anio || '');
  return dia && mes && anio ? `${dia}/${mes}/${anio}` : (d.Fecha ? dma(d.Fecha) : '—');
}

// `tipo`: 'factura' | 'ordenCompra'. `cliente`: el registro del cliente (RazonSocial, Nit…) o null.
export function construirCorreoSolicitudDocumento({ tipo, documento, cliente, pilaDestinatario, srcFirma }){
  const d = documento || {};
  const esFactura = tipo === 'factura';
  const lineas = facturaLineItems(d).filter(li => li.Descripcion || parseMonto(li.Cantidad) || parseMonto(li.ValorUnitario) || li.Total);
  const { subtotal, iva, total } = computeFacturaTotals(d);
  const retIva = parseMonto(d.RetIva);
  const razon = cliente?.RazonSocial || '';
  const referencia = esFactura ? (d.Factura ? `Solicitud de factura No. ${d.Factura}` : '') : ordenCompraNumero(d);
  const fila = (etiqueta, valor) => valor ? `<tr><td style="${TDE}">${etiqueta}</td><td style="${TD}">${valor}</td></tr>` : '';
  const filasLinea = lineas.map(li => `<tr>
    <td style="${TD}">${esc(li.Descripcion || '—')}</td>
    <td style="${TD} text-align:right;">${esc(li.Cantidad || '—')}</td>
    <td style="${TD} text-align:right; white-space:nowrap;">${parseMonto(li.ValorUnitario) ? pesos(parseMonto(li.ValorUnitario)) : '—'}</td>
    <td style="${TD} text-align:right; white-space:nowrap;">${pesos(li.Total)}</td>
  </tr>`).join('');
  const totalFila = (etiqueta, valor, fuerte) => `<tr><td style="${TD} text-align:right; ${fuerte ? 'background:#004941; color:#fff; font-weight:700;' : 'font-weight:600;'}" colspan="3">${etiqueta}</td><td style="${TD} text-align:right; white-space:nowrap; ${fuerte ? 'background:#004941; color:#fff; font-weight:700;' : 'font-weight:600;'}">${pesos(valor)}</td></tr>`;
  const detalle = lineas.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; margin:14px 0 0;">
    <tr><th style="${TH}">Descripción</th><th style="${TH} text-align:right;">Cantidad</th><th style="${TH} text-align:right;">Valor unitario</th><th style="${TH} text-align:right;">Total</th></tr>
    ${filasLinea}
    ${totalFila('Subtotal', subtotal)}
    ${totalFila('IVA', iva)}
    ${retIva > 0 ? totalFila('Retención de IVA', retIva) : ''}
    ${totalFila('Total', total, true)}
  </table>`
    : '<p style="margin:14px 0 0; font-size:13.5px; color:#b3590a;">El documento aún no tiene líneas de detalle.</p>';
  const asunto = esFactura
    // 2026-11-11 (pedido del usuario): «Emisión de factura electrónica» + cliente resumido + etapa + número corto, igual que el nombre del PDF (sin repetir Proceso y Etapa).
    ? ('Emisión de factura electrónica ' + nombrePdfDocumento('', cliente, null, aplicarReglaContrato(d).EtapaContrato, aplicarReglaContrato(d).Proceso)).trim()
    : `Solicitud de número de orden de compra${razon ? ' — ' + razon : ''}${d.Contrato ? ' — Contrato ' + d.Contrato : ''}`;
  const html = `<div style="font-family:'Segoe UI', Arial, sans-serif; color:#1c2624; max-width:760px;">
  <p style="margin:0 0 12px; font-size:15px;">${esFactura ? saludoFactura(pilaDestinatario) : (pilaDestinatario ? `Buen día, ${esc(pilaDestinatario)}:` : 'Buen día,')}</p>
  <p style="margin:0 0 14px; font-size:15px; line-height:1.55;">${esFactura
    ? 'Por favor <strong>emitir factura electrónica</strong> con el siguiente detalle:'
    : 'Solicito la <strong>generación del número de orden de compra</strong> con el siguiente detalle:'}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">
    ${fila('Cliente', razon ? esc(razon) : '')}
    ${fila('NIT', cliente?.Nit ? esc(cliente.Nit) : '')}
    ${fila('Contrato', d.Contrato ? esc(d.Contrato) : '')}
    ${fila('Proceso', d.Proceso ? esc(conTildes(d.Proceso)) : '')}
    ${fila('Etapa del contrato', d.EtapaContrato ? esc(conTildes(d.EtapaContrato)) : '')}
    ${fila('Ciudad', d.Ciudad ? esc(d.Ciudad) : '')}
    ${fila('Fecha', fechaDelDocumento(d))}
    ${fila('Referencia en el portal', referencia ? esc(referencia) : '')}
    ${fila('Observación', d.Observacion ? esc(d.Observacion) : '')}
  </table>
  ${detalle}
  <p style="margin:18px 0 0; font-size:14px; line-height:1.55;">Quedo atento a la confirmación. Gracias.</p>
  <p style="margin:14px 0 0; font-size:14px;">Cordial saludo,</p>
  ${firmaHtml('soporte', srcFirma)}
</div>`;
  return { asunto, html, sinLineas: !lineas.length, sinValor: !(total > 0) };
}

// Crea DE UNA VEZ el borrador del correo de solicitud (2026-11-03, pedido del usuario: ícono de correo en las tablas de Facturas y Órdenes de compra, y al guardar un borrador de
// «Honorarios por Proceso»): factura → Para Beatriz con copia a Gerencia; orden de compra → sin destinatario (queda abierto para escribirlo) con copia a Gerencia.
// Queda en los Borradores de Soporte (si Microsoft no encuentra ese buzón, en los de quien entró; el resultado lo dice en enBuzonPropio).
const REMITENTE_SOPORTE = 'soporte@lexaraabogados.com';
function bytesABase64(bytes){
  let bin = '';
  for(let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export async function crearBorradorSolicitudDocumento({ tipo, documento, clientes, colaboradores, pdf }){
  const esFactura = tipo === 'factura';
  const firma = await firmaComoImagenInline('soporte');
  const cliente = (clientes || []).find(c => String(c.id) === String(documento?.CodigoCliente)) || null;
  const beatriz = destinatariaNovedades(colaboradores);
  const correo = construirCorreoSolicitudDocumento({ tipo, documento, cliente, pilaDestinatario: esFactura ? nombreDeSaludo() : '' });
  const r = await crearBorradorConImagenesInline({
    to: esFactura ? [beatriz.correo] : [], cc: [CORREO_GERENCIA_NOVEDADES], subject: correo.asunto, htmlBody: correo.html, imagenes: [firma],
    adjuntos: pdf ? [{ nombre: pdf.nombre, contentType: 'application/pdf', base64: bytesABase64(pdf.bytes), tamano: pdf.bytes.length }] : [],
    categorias: [(esFactura ? CATEGORIA_SOLICITUD_FACTURA : CATEGORIA_SOLICITUD_ORDEN) + ' (borrador)'], buzon: REMITENTE_SOPORTE, caerAlBuzonPropio: true,
  });
  return { ...r, para: esFactura ? beatriz.correo : '', remitente: REMITENTE_SOPORTE };
}
