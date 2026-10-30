import { useEffect, useState } from 'react';
import VistaPreviaCorreo from './VistaPreviaCorreo';
import { prepararFelicitacion } from '../lib/felicitacionCumpleanos';
import { crearBorradorConImagenesInline, programarCorreoDiferido, mensajeError } from '../lib/graph';
import { proximoCumpleanos } from '../lib/cumpleanos';
import { esCuentaDeSoporte, horaDeEnvio, copiaDelEquipo, REMITENTE_AUTOMATICO } from '../lib/felicitacionesAutomaticas';
import { IconTextButton } from './IconButton';

// Vista previa de la felicitación de cumpleaños de un colaborador y creación del borrador en Outlook (nunca la envía).
export default function FelicitacionCumpleanosModal({ colaborador, colaboradores, listas, config, liveMode, notify, onClose }){
  const [estado, setEstado] = useState('preparando');   // preparando | listo | error
  const [datos, setDatos] = useState(null);
  const [creando, setCreando] = useState(false);
  const [creado, setCreado] = useState(null);
  const [error, setError] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [programando, setProgramando] = useState(false);
  const [programada, setProgramada] = useState(false);
  const soporte = esCuentaDeSoporte();
  const copia = copiaDelEquipo(colaborador, colaboradores);
  const p = proximoCumpleanos(colaborador?.FechaNacimiento, new Date());
  const fechaCumple = p ? `${p.fecha.getFullYear()}-${String(p.fecha.getMonth() + 1).padStart(2, '0')}-${String(p.fecha.getDate()).padStart(2, '0')}` : '';

  useEffect(() => {
    let vivo = true;
    prepararFelicitacion({ colaborador, listas, config: liveMode ? config : undefined })
      .then(d => { if(vivo){ setDatos(d); setEstado('listo'); } })
      .catch(err => { console.error(err); if(vivo){ setError(mensajeError(err)); setEstado('error'); } });
    return () => { vivo = false; };
  }, [colaborador?.id]);

  async function programar(){
    setConfirmando(false); setProgramando(true);
    try{
      const { iso } = horaDeEnvio(fechaCumple);
      await programarCorreoDiferido({ to: colaborador.Correo, cc: copia, subject: datos.asunto, htmlBody: datos.html, imagenes: datos.imagenes, enviarEnIso: iso });
      setProgramada(true);
      notify?.('✓ Felicitación PROGRAMADA para ' + colaborador.Correo + ' el ' + fechaCumple + ' a las 7:00 a. m., enviada desde ' + REMITENTE_AUTOMATICO + '.', 'success');
    }catch(err){
      console.error(err);
      notify?.('No se pudo programar el envío: ' + mensajeError(err), 'error');
    }finally{ setProgramando(false); }
  }
  async function crearBorrador(){
    if(!colaborador?.Correo){ notify?.('Este colaborador no tiene correo en su ficha: agrégalo para poder crear el borrador.', 'error'); return; }
    setCreando(true);
    try{
      const r = await crearBorradorConImagenesInline({ to: colaborador.Correo, cc: copia, subject: datos.asunto, htmlBody: datos.html, imagenes: datos.imagenes, categorias: ['Felicitación de cumpleaños'] });
      setCreado(r);
      notify?.('✓ Borrador de la felicitación CREADO en tus Borradores de Outlook, dirigido a ' + colaborador.Correo + '. Revísalo y envíalo ese día.' + (r.imagenesFallidas?.length ? ' No se pudieron adjuntar estas imágenes: ' + r.imagenesFallidas.join(', ') + '.' : ''), r.imagenesFallidas?.length ? 'info' : 'success');
    }catch(err){
      console.error(err);
      notify?.('No se pudo crear el borrador: ' + mensajeError(err), 'error');
    }finally{ setCreando(false); }
  }

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={'Felicitación de cumpleaños de ' + (colaborador?.Nombre || '')}>
      <div className="confirm-box felicitacion-box">
        <div className="felicitacion-cab">
          <h3>Felicitación de cumpleaños — {colaborador?.Nombre}</h3>
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
        {estado === 'preparando' && <p className="save-hint">Preparando el correo y las imágenes…</p>}
        {estado === 'error' && <p className="save-hint" style={{color:'var(--rojo, #a3281c)'}}>No se pudo preparar el correo: {error}</p>}
        {estado === 'listo' && datos && (
          <>
            <p className="save-hint" style={{margin:'0 0 8px'}}>
              <strong>Asunto:</strong> {datos.asunto} · <strong>Para:</strong> {colaborador?.Correo || '(sin correo en la ficha)'} · <strong>Con copia a:</strong> {copia.length ? copia.length + ' del equipo (' + copia.join(', ') + ')' : 'nadie (no hay más colaboradores activos con correo)'}
              {liveMode && <> · {datos.conFoto ? 'Con su foto de SharePoint' : 'Sin foto (no hay una imagen con su nombre de pila en «Fotos correo»)'}</>}
              {datos.aportes.length > 0 &&<> · Aportes encontrados en el portal: {datos.aportes.map(a => a.n + ' de ' + a.label).join(', ')}</>}
            </p>
            <VistaPreviaCorreo titulo="Vista previa de la felicitación" html={datos.htmlVistaPrevia} />
            <div className="confirm-actions" style={{marginTop:12, alignItems:'center', flexWrap:'wrap'}}>
              {creado && <span className="badge badge-verde">Borrador creado</span>}
              {programada && <span className="badge badge-verde">Programada</span>}
              {liveMode && soporte && !confirmando && <IconTextButton icon="mail" variant="primary" onClick={() => setConfirmando(true)} disabled={programando || !colaborador?.Correo || !fechaCumple}>{programando ? 'Programando…' : 'Programar envío automático 7:00 a. m.'}</IconTextButton>}
              {liveMode && soporte && confirmando && (
                <>
                  <span className="save-hint">Se enviará un correo real a {colaborador?.Correo}{copia.length ? ', con copia a ' + copia.length + ' del equipo,' : ''} el {fechaCumple} a las 7:00 a. m. ¿Programarlo?</span>
                  <IconTextButton icon="mail" variant="primary" onClick={programar} disabled={programando}>Sí, programar</IconTextButton>
                  <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)}>Cancelar</button>
                </>
              )}
              {liveMode && !soporte && <span className="save-hint">Para el envío automático inicia sesión con {REMITENTE_AUTOMATICO}.</span>}
              {liveMode
                ? <button type="button" className="btn-secondary" onClick={crearBorrador} disabled={creando || !colaborador?.Correo}>{creando ? 'Creando…' : (creado ? 'Crear otro borrador' : 'Solo crear borrador')}</button>
                : <span className="save-hint">En modo demo solo se ve la vista previa.</span>}
            </div>
            <p className="save-hint" style={{margin:'8px 0 0'}}>
              El envío automático (7:00 a. m. del cumpleaños, desde {REMITENTE_AUTOMATICO}) se programa para todos desde el panel «Envío automático» de la banda de cumpleaños, o solo para esta persona con el botón de arriba. El borrador es opcional: déjalo solo si quieres revisarlo a mano.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
