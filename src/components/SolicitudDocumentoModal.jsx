import { useEffect, useMemo, useState } from 'react';
import VistaPreviaCorreo from './VistaPreviaCorreo';
import { IconTextButton } from './IconButton';
import { crearBorradorConImagenesInline, enviarCorreoDirecto, firmaComoImagenInline, mensajeError } from '../lib/graph';
import { construirCorreoSolicitudDocumento, CATEGORIA_SOLICITUD_FACTURA, CATEGORIA_SOLICITUD_ORDEN } from '../lib/correoSolicitudDocumento';
import { destinatariaNovedades, nombreDeSaludo, CORREO_GERENCIA_NOVEDADES } from '../lib/novedadesNomina';

// Se abre al guardar un borrador creado desde «Honorarios por Proceso» (2026-10-29, pedido del usuario): correo de solicitud con el detalle del documento ya guardado.
//   · Factura: para Beatriz, con copia a Gerencia — «solicito generación de factura electrónica».
//   · Orden de compra: para quien se escriba a mano, con copia a Gerencia — «solicito generación de número de orden de compra».
// Sale de la cuenta de Soporte y se ve completo antes de enviarlo.
const REMITENTE_SOPORTE = 'soporte@lexaraabogados.com';
const CLAVE_RECIENTES = 'lexara-oc-destinatarios';
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function leerRecientes(){ try{ const l = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) || '[]'); return Array.isArray(l) ? l : []; }catch(e){ return []; } }

export default function SolicitudDocumentoModal({ tipo, documento, clientes, colaboradores, liveMode, notify, onClose }){
  const esFactura = tipo === 'factura';
  const [firma, setFirma] = useState(null);
  const [paraManual, setParaManual] = useState('');
  const [recientes] = useState(leerRecientes);
  const [confirmando, setConfirmando] = useState(false);
  const [accion, setAccion] = useState('');

  const beatriz = useMemo(() => destinatariaNovedades(colaboradores), [colaboradores]);
  const para = esFactura ? beatriz.correo : paraManual.trim();
  const paraValido = CORREO_VALIDO.test(para);
  const cliente = useMemo(() => (clientes || []).find(c => String(c.id) === String(documento?.CodigoCliente)) || null, [clientes, documento]);
  const pila = esFactura ? nombreDeSaludo() : '';

  useEffect(() => {
    let vivo = true;
    firmaComoImagenInline('soporte').then(f => { if(vivo) setFirma(f); }).catch(err => console.error('No se pudo leer la firma de Soporte:', err));
    return () => { vivo = false; };
  }, []);

  const vistaPrevia = useMemo(() => construirCorreoSolicitudDocumento({ tipo, documento, cliente, pilaDestinatario: pila, srcFirma: firma?.srcVistaPrevia }), [tipo, documento, cliente, pila, firma]);
  const correoReal = useMemo(() => construirCorreoSolicitudDocumento({ tipo, documento, cliente, pilaDestinatario: pila }), [tipo, documento, cliente, pila]);
  const categoria = esFactura ? CATEGORIA_SOLICITUD_FACTURA : CATEGORIA_SOLICITUD_ORDEN;
  const etiquetaDoc = esFactura ? 'factura electrónica' : 'número de orden de compra';

  function recordarDestinatario(){
    if(esFactura) return;
    try{ localStorage.setItem(CLAVE_RECIENTES, JSON.stringify([para, ...recientes.filter(x => x.toLowerCase() !== para.toLowerCase())].slice(0, 8))); }catch(e){ /* sin almacenamiento */ }
  }
  async function enviar(){
    setConfirmando(false); setAccion('enviando');
    try{
      if(!firma) throw new Error('La imagen de la firma de Soporte aún no se ha cargado; espera un momento e inténtalo de nuevo.');
      await enviarCorreoDirecto({ to: [para], cc: [CORREO_GERENCIA_NOVEDADES], subject: correoReal.asunto, htmlBody: correoReal.html, categorias: [categoria], desde: REMITENTE_SOPORTE, imagenes: [firma] });
      recordarDestinatario();
      notify?.('✓ Solicitud de ' + etiquetaDoc + ' enviada a ' + para + ' con copia a Gerencia, desde ' + REMITENTE_SOPORTE + '.', 'success');
      onClose?.();
    }catch(err){
      console.error(err); notify?.('No se pudo enviar el correo: ' + mensajeError(err), 'error');
    }finally{ setAccion(''); }
  }
  async function crearBorrador(){
    setAccion('borrador');
    try{
      if(!firma) throw new Error('La imagen de la firma de Soporte aún no se ha cargado; espera un momento e inténtalo de nuevo.');
      const r = await crearBorradorConImagenesInline({ to: [para], cc: [CORREO_GERENCIA_NOVEDADES], subject: correoReal.asunto, htmlBody: correoReal.html, imagenes: [firma], categorias: [categoria + ' (borrador)'], buzon: REMITENTE_SOPORTE, caerAlBuzonPropio: true });
      recordarDestinatario();
      notify?.(r.enBuzonPropio
        ? '⚠ No pude crear el borrador en ' + REMITENTE_SOPORTE + ' (Microsoft no encuentra ese buzón: entra una vez a https://outlook.office.com con esa cuenta para activarlo). Quedó en TUS Borradores, para ' + para + ' con copia a Gerencia: cambia el «De» a Soporte si tienes permiso.'
        : '✓ Borrador creado en los Borradores de ' + REMITENTE_SOPORTE + ', para ' + para + ' con copia a Gerencia.', r.enBuzonPropio ? 'info' : 'success');
    }catch(err){
      console.error(err); notify?.('No se pudo crear el borrador: ' + mensajeError(err), 'error');
    }finally{ setAccion(''); }
  }

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={'Solicitud de ' + etiquetaDoc}>
      <div className="confirm-box felicitacion-box" style={{ maxWidth: 900 }}>
        <div className="felicitacion-cab">
          <h3>{esFactura ? 'Correo de solicitud de factura electrónica' : 'Correo de solicitud de número de orden de compra'}</h3>
          <button type="button" className="btn-secondary" onClick={onClose}>Ahora no</button>
        </div>
        <p className="save-hint" style={{ margin: '0 0 8px' }}>
          Ya quedó guardado el {esFactura ? 'borrador de factura' : 'borrador de orden de compra'}. Este correo lleva su detalle; revisa y envíalo, o ciérralo si no lo necesitas ahora.
        </p>
        {esFactura ? (
          <p className="save-hint" style={{ margin: '0 0 8px' }}>
            <strong>De:</strong> Soporte ({REMITENTE_SOPORTE}) · <strong>Para:</strong> {beatriz.nombre} ({beatriz.correo}) · <strong>Con copia:</strong> Gerencia ({CORREO_GERENCIA_NOVEDADES}) · <strong>Asunto:</strong> {vistaPrevia.asunto}
          </p>
        ) : (
          <>
            <div className="field" style={{ maxWidth: 420, marginBottom: 8 }}>
              <label>Para (escribe a quién va dirigido)</label>
              <input type="email" list="solicitud-oc-recientes" value={paraManual} onChange={e => { setParaManual(e.target.value); setConfirmando(false); }} placeholder="correo@dominio.com" autoFocus />
              <datalist id="solicitud-oc-recientes">{recientes.map(r => <option key={r} value={r} />)}</datalist>
              {paraManual && !paraValido && <span className="save-hint" style={{ color: '#a3281c' }}>Escribe un correo completo, por ejemplo nombre@empresa.com.</span>}
            </div>
            <p className="save-hint" style={{ margin: '0 0 8px' }}>
              <strong>De:</strong> Soporte ({REMITENTE_SOPORTE}) · <strong>Con copia:</strong> Gerencia ({CORREO_GERENCIA_NOVEDADES}) · <strong>Asunto:</strong> {vistaPrevia.asunto}
            </p>
          </>
        )}
        {(vistaPrevia.sinLineas || vistaPrevia.sinValor) && <p className="save-hint" style={{ color: '#b3590a', margin: '0 0 8px' }}>El documento todavía no tiene valores (Cantidad/Valor unitario, total en $ 0,00). Ábrelo desde la lista, complétalos y guarda antes de enviar este correo.</p>}
        <VistaPreviaCorreo titulo="Vista previa del correo de solicitud" html={vistaPrevia.html} />
        <div className="confirm-actions" style={{ marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {liveMode ? (
            confirmando ? (
              <>
                <span className="save-hint" style={{ margin: 0 }}>Se enviará un correo real a {para} con copia a Gerencia, desde {REMITENTE_SOPORTE}. ¿Enviarlo?</span>
                <IconTextButton icon="mail" variant="primary" onClick={enviar} disabled={!!accion}>Sí, enviar</IconTextButton>
                <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)}>Cancelar</button>
              </>
            ) : (
              <>
                <IconTextButton icon="mail" variant="primary" onClick={() => setConfirmando(true)} disabled={!!accion || !paraValido}>{accion === 'enviando' ? 'Enviando…' : (esFactura ? 'Enviar a ' + nombreDeSaludo() : 'Enviar solicitud')}</IconTextButton>
                <button type="button" className="btn-secondary" onClick={crearBorrador} disabled={!!accion || !paraValido}>{accion === 'borrador' ? 'Creando…' : 'Solo crear borrador'}</button>
              </>
            )
          ) : <span className="save-hint" style={{ margin: 0 }}>En modo demo solo se ve la vista previa; el envío requiere la sesión real.</span>}
        </div>
      </div>
    </div>
  );
}
