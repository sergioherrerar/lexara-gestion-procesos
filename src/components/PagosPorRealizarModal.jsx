import { useEffect, useMemo, useState } from 'react';
import { IconTextButton } from './IconButton';
import { crearBorradorConImagenesInline, enviarCorreoDirecto, listarEnviadosPorCategoria, firmaComoImagenInline, mensajeError } from '../lib/graph';
import { construirCorreoPagosPorRealizar, pagosDelDia, diaInicialPagos, CATEGORIA_PAGOS_POR_REALIZAR } from '../lib/correoPagosPorRealizar';
import { CORREO_GERENCIA_NOVEDADES, dma } from '../lib/novedadesNomina';

// Gastos → «Pagos por realizar» (2026-10-29, pedido del usuario): correo de Soporte para Gerencia con los pagos de UN día (el que se elige acá) y los datos de la cuenta de
// cada proveedor, para poder hacerles el pago. Se ve completo antes de enviarlo; el envío pide confirmación.
const REMITENTE_SOPORTE = 'soporte@lexaraabogados.com';
const CLAVE_LOCAL = 'lexara-pagos-por-realizar-enviados';

export default function PagosPorRealizarModal({ registros, proveedores, liveMode, notify, onClose }){
  const [dia, setDia] = useState(() => diaInicialPagos(registros));
  const [firma, setFirma] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [accion, setAccion] = useState('');
  const [enviados, setEnviados] = useState([]);
  const [envioLocal, setEnvioLocal] = useState(() => { try{ return JSON.parse(localStorage.getItem(CLAVE_LOCAL) || '{}'); }catch(e){ return {}; } });

  useEffect(() => {
    let vivo = true;
    firmaComoImagenInline('soporte').then(f => { if(vivo) setFirma(f); }).catch(err => console.error('No se pudo leer la firma de Soporte:', err));
    return () => { vivo = false; };
  }, []);
  useEffect(() => {
    if(!liveMode) return;
    let vivo = true;
    listarEnviadosPorCategoria(CATEGORIA_PAGOS_POR_REALIZAR, REMITENTE_SOPORTE).then(l => { if(vivo) setEnviados(l); }).catch(err => console.error('No se pudo revisar los Enviados de Soporte:', err));
    return () => { vivo = false; };
  }, [liveMode, accion]);

  const filas = useMemo(() => pagosDelDia(registros, dia), [registros, dia]);
  const vistaPrevia = useMemo(() => construirCorreoPagosPorRealizar({ filas, proveedores, diaISO: dia, srcFirma: firma?.srcVistaPrevia }), [filas, proveedores, dia, firma]);
  const correoReal = useMemo(() => construirCorreoPagosPorRealizar({ filas, proveedores, diaISO: dia }), [filas, proveedores, dia]);
  const clave = dma(dia);
  const yaEnviado = enviados.find(e => e.asunto.includes(clave)) || (envioLocal[dia] ? { fecha: envioLocal[dia].fecha, para: envioLocal[dia].para } : null);

  async function enviar(){
    setConfirmando(false); setAccion('enviando');
    try{
      if(!firma) throw new Error('La imagen de la firma de Soporte aún no se ha cargado; espera un momento e inténtalo de nuevo.');
      await enviarCorreoDirecto({ to: [CORREO_GERENCIA_NOVEDADES], subject: correoReal.asunto, htmlBody: correoReal.html, categorias: [CATEGORIA_PAGOS_POR_REALIZAR], desde: REMITENTE_SOPORTE, imagenes: [firma] });
      const registro = { ...envioLocal, [dia]: { fecha: new Date().toISOString(), para: [CORREO_GERENCIA_NOVEDADES] } };
      setEnvioLocal(registro);
      try{ localStorage.setItem(CLAVE_LOCAL, JSON.stringify(registro)); }catch(e){ /* sin almacenamiento */ }
      notify?.('✓ Pagos por realizar del ' + clave + ' enviados a Gerencia (' + CORREO_GERENCIA_NOVEDADES + '), desde ' + REMITENTE_SOPORTE + '.', 'success');
      onClose?.();
    }catch(err){
      console.error(err); notify?.('No se pudo enviar el correo: ' + mensajeError(err), 'error');
    }finally{ setAccion(''); }
  }
  async function crearBorrador(){
    setAccion('borrador');
    try{
      if(!firma) throw new Error('La imagen de la firma de Soporte aún no se ha cargado; espera un momento e inténtalo de nuevo.');
      const r = await crearBorradorConImagenesInline({ to: [CORREO_GERENCIA_NOVEDADES], subject: correoReal.asunto, htmlBody: correoReal.html, imagenes: [firma], categorias: [CATEGORIA_PAGOS_POR_REALIZAR + ' (borrador)'], buzon: REMITENTE_SOPORTE, caerAlBuzonPropio: true });
      notify?.(r.enBuzonPropio
        ? '⚠ No pude crear el borrador en ' + REMITENTE_SOPORTE + ' (Microsoft no encuentra ese buzón: entra una vez a https://outlook.office.com con esa cuenta para activarlo). Quedó en TUS Borradores, para ' + CORREO_GERENCIA_NOVEDADES + ': cambia el «De» a Soporte si tienes permiso.'
        : '✓ Borrador creado en los Borradores de ' + REMITENTE_SOPORTE + ', para ' + CORREO_GERENCIA_NOVEDADES + '.', r.enBuzonPropio ? 'info' : 'success');
    }catch(err){
      console.error(err); notify?.('No se pudo crear el borrador: ' + mensajeError(err), 'error');
    }finally{ setAccion(''); }
  }

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="Pagos por realizar">
      <div className="confirm-box felicitacion-box" style={{ maxWidth: 1000 }}>
        <div className="felicitacion-cab">
          <h3>Pagos por realizar</h3>
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
          <div className="field" style={{ maxWidth: 190 }}>
            <label>Día de los pagos</label>
            <input type="date" value={dia} onChange={e => { setDia(e.target.value); setConfirmando(false); }} />
          </div>
          <p className="save-hint" style={{ margin: 0, flex: 1, minWidth: 220 }}>
            {filas.length ? <><strong>{filas.length}</strong> pago{filas.length === 1 ? '' : 's'} registrado{filas.length === 1 ? '' : 's'} el {clave}.</> : <>No hay pagos registrados el {clave}: elige otro día.</>}
          </p>
        </div>
        {yaEnviado && <p className="badge badge-verde" style={{ display: 'inline-block', margin: '0 0 8px' }}>✓ Ya se envió el {dma(yaEnviado.fecha)} a {yaEnviado.para.join(', ')}</p>}
        <p className="save-hint" style={{ margin: '0 0 8px' }}>
          <strong>De:</strong> Soporte ({REMITENTE_SOPORTE}) · <strong>Para:</strong> Gerencia ({CORREO_GERENCIA_NOVEDADES}) · <strong>Asunto:</strong> {vistaPrevia.asunto}
          {vistaPrevia.sinCuenta.length > 0 && <span style={{ color: '#b3590a' }}> · Sin datos bancarios: {vistaPrevia.sinCuenta.join(', ')} (agrégalos en Proveedores)</span>}
        </p>
        <iframe title="Vista previa del correo de pagos por realizar" className="felicitacion-vista" srcDoc={vistaPrevia.html} sandbox="" />
        <div className="confirm-actions" style={{ marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {liveMode ? (
            confirmando ? (
              <>
                <span className="save-hint" style={{ margin: 0 }}>{yaEnviado ? <strong>Ya se envió este día. </strong> : null}Se enviará un correo real a {CORREO_GERENCIA_NOVEDADES}, desde {REMITENTE_SOPORTE}. ¿Enviarlo?</span>
                <IconTextButton icon="mail" variant="primary" onClick={enviar} disabled={!!accion}>Sí, enviar</IconTextButton>
                <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)}>Cancelar</button>
              </>
            ) : (
              <>
                <IconTextButton icon="mail" variant="primary" onClick={() => setConfirmando(true)} disabled={!!accion || !filas.length}>{accion === 'enviando' ? 'Enviando…' : 'Enviar a Gerencia'}</IconTextButton>
                <button type="button" className="btn-secondary" onClick={crearBorrador} disabled={!!accion || !filas.length}>{accion === 'borrador' ? 'Creando…' : 'Solo crear borrador'}</button>
              </>
            )
          ) : <span className="save-hint" style={{ margin: 0 }}>En modo demo solo se ve la vista previa; el envío requiere la sesión real.</span>}
        </div>
      </div>
    </div>
  );
}
