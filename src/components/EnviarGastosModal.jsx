import { useEffect, useMemo, useState } from 'react';
import VistaPreviaCorreo from './VistaPreviaCorreo';
import { IconTextButton } from './IconButton';
import { crearBorradorConImagenesInline, enviarCorreoDirecto, listarEnviadosPorCategoria, firmaComoImagenInline, crearLinkCarpetaMesGastos, mensajeError } from '../lib/graph';
import { crearExcelRegistrosGastos, crearHTMLRegistrosGastos } from '../lib/gastos';
import { construirCorreoGastos, etiquetaMesGastos, nombreBaseArchivoGastos, CATEGORIA_GASTOS } from '../lib/correoGastos';
import { destinatariaNovedades, nombreDeSaludo, CORREO_GERENCIA_NOVEDADES, MESES_NOMBRES, dma } from '../lib/novedadesNomina';

// Gastos → «Enviar gastos del mes» (2026-10-29, pedido del usuario): arma el correo con la lista de los gastos hechos durante el mes y el enlace de cada soporte en el
// cuerpo, con el Excel y el HTML adjuntos, para Beatriz con copia a Gerencia. Sale SIEMPRE de la cuenta de Soporte (como el de Novedades de nómina) y se ve completo
// —vista previa y adjuntos— antes de enviarlo.
const REMITENTE_SOPORTE = 'soporte@lexaraabogados.com';
const CLAVE_LOCAL = 'lexara-gastos-enviados';

function bytesABase64(bytes){
  let bin = '';
  for(let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const kb = n => (n / 1024 < 10 ? (n / 1024).toFixed(1) : Math.round(n / 1024)) + ' KB';

export default function EnviarGastosModal({ filasMes, proveedores, anio, mes, shareUrl, colaboradores, liveMode, notify, onClose }){
  const [estado, setEstado] = useState('preparando');   // preparando | listo | error
  const [error, setError] = useState('');
  const [datos, setDatos] = useState(null);              // { firma, linkCarpetaMes, adjuntos:[{ nombre, contentType, base64, tamano }] }
  const [confirmando, setConfirmando] = useState(false);
  const [accion, setAccion] = useState('');
  const [enviados, setEnviados] = useState([]);
  const [envioLocal, setEnvioLocal] = useState(() => { try{ return JSON.parse(localStorage.getItem(CLAVE_LOCAL) || '{}'); }catch(e){ return {}; } });

  const etiqueta = etiquetaMesGastos(anio, mes);
  const base = nombreBaseArchivoGastos(anio, mes);
  const destinatario = useMemo(() => destinatariaNovedades(colaboradores), [colaboradores]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try{
        const firma = await firmaComoImagenInline('soporte');
        let linkCarpetaMes = null;
        if(liveMode && shareUrl){
          try{ linkCarpetaMes = await crearLinkCarpetaMesGastos(shareUrl, anio, mes); }
          catch(err){ console.error('No se pudo generar el link de la carpeta del mes:', err); }
        }
        const opciones = { conNumero: true, conTipo: true, conSoportes: true };
        const excel = new Uint8Array(await crearExcelRegistrosGastos(base, filasMes, proveedores, opciones));
        const htmlTexto = crearHTMLRegistrosGastos(base, filasMes, proveedores, { ...opciones, linkCarpetaMes, mesLabel: `${MESES_NOMBRES[mes].toLowerCase()} de ${anio}` });
        const htmlBytes = new TextEncoder().encode(htmlTexto);
        const adjuntos = [
          { nombre: base + '.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: bytesABase64(excel), tamano: excel.length },
          { nombre: base + '.html', contentType: 'text/html', base64: bytesABase64(htmlBytes), tamano: htmlBytes.length },
        ];
        if(vivo){ setDatos({ firma, linkCarpetaMes, adjuntos }); setEstado('listo'); }
      }catch(err){ console.error(err); if(vivo){ setError(mensajeError(err)); setEstado('error'); } }
    })();
    return () => { vivo = false; };
  }, [anio, mes]);

  // ¿Ya se envió este mes? (Enviados de Soporte, y lo recordado en este navegador)
  useEffect(() => {
    if(!liveMode) return;
    let vivo = true;
    listarEnviadosPorCategoria(CATEGORIA_GASTOS, REMITENTE_SOPORTE).then(l => { if(vivo) setEnviados(l); }).catch(err => console.error('No se pudo revisar los Enviados de Soporte:', err));
    return () => { vivo = false; };
  }, [liveMode, accion]);
  const yaEnviado = enviados.find(e => e.asunto.includes(etiqueta)) || (envioLocal[etiqueta] ? { fecha: envioLocal[etiqueta].fecha, para: envioLocal[etiqueta].para } : null);

  const comunes = { filas: filasMes, anio, mesIndex0: mes, pilaDestinataria: nombreDeSaludo(), linkCarpetaMes: datos?.linkCarpetaMes, nombreExcel: base + '.xlsx', nombreHtml: base + '.html' };
  const vistaPrevia = useMemo(() => datos ? construirCorreoGastos({ ...comunes, srcFirma: datos.firma.srcVistaPrevia }) : null, [datos, filasMes]);
  const correoReal = useMemo(() => datos ? construirCorreoGastos(comunes) : null, [datos, filasMes]);

  async function enviar(){
    setConfirmando(false); setAccion('enviando');
    try{
      await enviarCorreoDirecto({ to: [destinatario.correo], cc: [CORREO_GERENCIA_NOVEDADES], subject: correoReal.asunto, htmlBody: correoReal.html, categorias: [CATEGORIA_GASTOS], desde: REMITENTE_SOPORTE, imagenes: [datos.firma], adjuntos: datos.adjuntos });
      const registro = { ...envioLocal, [etiqueta]: { fecha: new Date().toISOString(), para: [destinatario.correo] } };
      setEnvioLocal(registro);
      try{ localStorage.setItem(CLAVE_LOCAL, JSON.stringify(registro)); }catch(e){ /* sin almacenamiento */ }
      notify?.('✓ Gastos de ' + etiqueta + ' enviados a ' + destinatario.nombre + ' (' + destinatario.correo + ') con copia a Gerencia, desde ' + REMITENTE_SOPORTE + ', con el Excel y el HTML adjuntos.', 'success');
      onClose?.();
    }catch(err){
      console.error(err); notify?.('No se pudo enviar el correo: ' + mensajeError(err), 'error');
    }finally{ setAccion(''); }
  }
  async function crearBorrador(){
    setAccion('borrador');
    try{
      const r = await crearBorradorConImagenesInline({ to: [destinatario.correo], cc: [CORREO_GERENCIA_NOVEDADES], subject: correoReal.asunto, htmlBody: correoReal.html, imagenes: [datos.firma], adjuntos: datos.adjuntos, categorias: [CATEGORIA_GASTOS + ' (borrador)'], buzon: REMITENTE_SOPORTE, caerAlBuzonPropio: true });
      const aviso = r.enBuzonPropio
        ? '⚠ No pude crear el borrador en ' + REMITENTE_SOPORTE + ' (Microsoft no encuentra ese buzón: entra una vez a https://outlook.office.com con esa cuenta para activarlo). Quedó en TUS Borradores, para ' + destinatario.correo + ' con copia a Gerencia: cambia el «De» a Soporte si tienes permiso.'
        : '✓ Borrador creado en los Borradores de ' + REMITENTE_SOPORTE + ', para ' + destinatario.correo + ' con copia a Gerencia.';
      notify?.(aviso + (r.imagenesFallidas?.length ? ' No se pudo adjuntar: ' + r.imagenesFallidas.join(', ') + '.' : ''), (r.enBuzonPropio || r.imagenesFallidas?.length) ? 'info' : 'success');
    }catch(err){
      console.error(err); notify?.('No se pudo crear el borrador: ' + mensajeError(err), 'error');
    }finally{ setAccion(''); }
  }

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={'Enviar gastos de ' + etiqueta}>
      <div className="confirm-box felicitacion-box" style={{ maxWidth: 940 }}>
        <div className="felicitacion-cab">
          <h3>Enviar gastos de {etiqueta}</h3>
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
        {estado === 'preparando' && <p className="save-hint">Preparando el correo, el Excel y el HTML…</p>}
        {estado === 'error' && <p className="save-hint" style={{ color: 'var(--rojo, #a3281c)' }}>No se pudo preparar el correo: {error}</p>}
        {estado === 'listo' && datos && (
          <>
            {yaEnviado && <p className="badge badge-verde" style={{ display: 'inline-block', margin: '0 0 8px' }}>✓ Ya se envió el {dma(yaEnviado.fecha)} a {yaEnviado.para.join(', ')}</p>}
            <p className="save-hint" style={{ margin: '0 0 6px' }}>
              <strong>De:</strong> Soporte ({REMITENTE_SOPORTE}) · <strong>Para:</strong> {destinatario.nombre} ({destinatario.correo}) · <strong>Con copia:</strong> Gerencia ({CORREO_GERENCIA_NOVEDADES}) · <strong>Asunto:</strong> {vistaPrevia.asunto}
            </p>
            <p className="save-hint" style={{ margin: '0 0 8px' }}>
              <strong>Adjuntos:</strong> {datos.adjuntos.map(a => a.nombre + ' (' + kb(a.tamano) + ')').join(' · ')} · {filasMes.length} gasto{filasMes.length === 1 ? '' : 's'} del mes
              {!datos.linkCarpetaMes && liveMode ? ' · sin enlace a la carpeta de soportes (aún no existe la carpeta de este mes)' : ''}
            </p>
            <VistaPreviaCorreo titulo="Vista previa del correo de gastos" html={vistaPrevia.html} />
            <div className="confirm-actions" style={{ marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {liveMode ? (
                confirmando ? (
                  <>
                    <span className="save-hint" style={{ margin: 0 }}>{yaEnviado ? <strong>Ya se envió este mes. </strong> : null}Se enviará un correo real a {destinatario.correo} con copia a Gerencia, desde {REMITENTE_SOPORTE}. ¿Enviarlo?</span>
                    <IconTextButton icon="mail" variant="primary" onClick={enviar} disabled={!!accion}>Sí, enviar</IconTextButton>
                    <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <IconTextButton icon="mail" variant="primary" onClick={() => setConfirmando(true)} disabled={!!accion || !filasMes.length}>{accion === 'enviando' ? 'Enviando…' : 'Enviar a ' + nombreDeSaludo()}</IconTextButton>
                    <button type="button" className="btn-secondary" onClick={crearBorrador} disabled={!!accion || !filasMes.length}>{accion === 'borrador' ? 'Creando…' : 'Solo crear borrador'}</button>
                  </>
                )
              ) : <span className="save-hint" style={{ margin: 0 }}>En modo demo solo se ve la vista previa; el envío requiere la sesión real.</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
