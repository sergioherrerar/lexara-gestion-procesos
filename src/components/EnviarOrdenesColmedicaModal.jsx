import { useEffect, useMemo, useState } from 'react';
import VistaPreviaCorreo from './VistaPreviaCorreo';
import { createPortal } from 'react-dom';
import { IconTextButton } from './IconButton';
import { OrdenCompraHoja, emptyForm, computeLive, fechaDeImpresion } from './OrdenCompraHoja';
import {
  crearBorradorConImagenesInline, enviarCorreoDirecto, listarEnviadosPorCategoria, firmaComoImagenInline,
  clienteForOrdenCompra, facturaForOrdenCompra, ordenCompraNumero, nombreArchivoSeguro, mensajeError,
} from '../lib/graph';
import { facturaDeOrden } from '../lib/cruceFacturasOrdenes';
import { generarPdfBytesDesdeNodo, precargarImagen, precalentarLibreriasPdf } from '../lib/generarPdfDocumento';
import { obtenerQrRedesDataUrl } from '../lib/qr';
import { crearExcelClientesTutelas } from '../lib/informeClientesTutelas';
import { MESES_NOMBRES } from '../lib/ordenesComprasColmedica';
import {
  construirCorreoOrdenesColmedica, etiquetaMesOrdenes, CORREO_DANIA_COLMEDICA, CATEGORIA_ORDENES_COLMEDICA, MENSAJE_POR_DEFECTO, saludoSegunHora,
} from '../lib/correoOrdenesColmedica';
import { CORREO_GERENCIA_NOVEDADES, dma } from '../lib/novedadesNomina';
import membrete from '../assets/Membrete Lexara.png';

// Órdenes Colmédica → «Enviar correo a Dania» (2026-10-29, pedido del usuario): mensaje de apertura (editable) + relación de las contestaciones del mes por Colmédica, Aliansalud y
// Unidad Médica de Diagnóstico, con adjuntos: la orden de compra (PDF) y el Excel de cada cliente. Para Dania, con copia a Gerencia, desde Soporte. Se ve todo antes de enviar.
// Las órdenes de compra deben estar GUARDADAS (Generar borrador → Guardar cambios): sus PDF salen de las órdenes reales, con su número.
const REMITENTE_SOPORTE = 'soporte@lexaraabogados.com';
const CLAVE_LOCAL = 'lexara-ordenes-colmedica-enviadas';

function bytesABase64(bytes){
  let bin = '';
  for(let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const mb = n => (n / 1048576 >= 1 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

// La orden de compra guardada de un cliente para el mes: su 1ª descripción trae «… {cliente} por las contestaciones de tutelas hechas en el mes de {Mes} del {año}».
function ordenDelMes(grupo, ordenesCompra, mes, anio){
  const marca = `mes de ${MESES_NOMBRES[mes]} del ${anio}`;
  return (ordenesCompra || [])
    .filter(o => { const d = String(o.Descripcion1 || ''); return d.includes(marca) && d.includes(grupo.cliente); })
    .sort((a, b) => Number(b.id) - Number(a.id))[0] || null;
}

export default function EnviarOrdenesColmedicaModal({ mes, anio, grupos, detalle, totalGeneral, tutelasDelMes, valoresEntidad, clientes, facturas, ordenesCompra, liveMode, notify, onClose }){
  const etiqueta = etiquetaMesOrdenes(anio, mes);
  const [mensaje, setMensaje] = useState(MENSAJE_POR_DEFECTO);
  const [estado, setEstado] = useState('preparando');   // preparando | listo | error
  const [error, setError] = useState('');
  const [firma, setFirma] = useState(null);
  const [adjuntos, setAdjuntos] = useState([]);           // [{ nombre, contentType, base64, tamano }]
  const [confirmando, setConfirmando] = useState(false);
  const [accion, setAccion] = useState('');
  const [enviados, setEnviados] = useState([]);
  const [envioLocal, setEnvioLocal] = useState(() => { try{ return JSON.parse(localStorage.getItem(CLAVE_LOCAL) || '{}'); }catch(e){ return {}; } });

  const ordenes = useMemo(() => (grupos || []).map(g => ({ grupo: g, oc: ordenDelMes(g, ordenesCompra, mes, anio) })), [grupos, ordenesCompra, mes, anio]);
  const faltan = ordenes.filter(o => !o.oc);
  const completo = ordenes.length > 0 && faltan.length === 0;
  const hojas = useMemo(() => ordenes.filter(o => o.oc).map(({ grupo, oc }, i) => {
    const form = emptyForm(oc, clientes);
    const linkedCliente = clienteForOrdenCompra(clientes, form);
    const exacta = facturaForOrdenCompra(facturas, form);
    const linkedFactura = exacta || facturaDeOrden(facturas, oc, ordenesCompra).factura;
    return { i, grupo, oc, form, linkedCliente, linkedFactura, totals: computeLive(form) };
  }), [ordenes, clientes, facturas, ordenesCompra]);

  useEffect(() => { let vivo = true; firmaComoImagenInline('soporte').then(f => { if(vivo) setFirma(f); }).catch(err => console.error('No se pudo leer la firma de Soporte:', err)); return () => { vivo = false; }; }, []);
  useEffect(() => {
    if(!liveMode) return;
    let vivo = true;
    listarEnviadosPorCategoria(CATEGORIA_ORDENES_COLMEDICA, REMITENTE_SOPORTE).then(l => { if(vivo) setEnviados(l); }).catch(err => console.error('No se pudo revisar los Enviados de Soporte:', err));
    return () => { vivo = false; };
  }, [liveMode, accion]);

  // Adjuntos: un Excel por cliente y la orden de compra (PDF) de cada uno. Los PDF se sacan de las hojas ocultas dibujadas abajo (mismo diseño que «Guardar en PDF»).
  useEffect(() => {
    let vivo = true;
    (async () => {
      if(!completo){ setEstado('listo'); setAdjuntos([]); return; }
      setEstado('preparando');
      try{
        const salida = [];
        for(const { grupo } of ordenes){
          const delCliente = (tutelasDelMes || []).filter(t => (t.Cliente || '').trim() === grupo.cliente);
          const bytes = new Uint8Array(await crearExcelClientesTutelas(delCliente, valoresEntidad));
          salida.push({ nombre: nombreArchivoSeguro(`Tutelas por Cliente - Colmédica - ${grupo.cliente} - ${MESES_NOMBRES[mes]} ${anio}`) + '.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: bytesABase64(bytes), tamano: bytes.length });
        }
        await new Promise(r => setTimeout(r, 150));   // deja montar las hojas ocultas
        const [qr] = await Promise.all([obtenerQrRedesDataUrl(), precargarImagen(membrete), precalentarLibreriasPdf()]);
        for(const h of hojas){ const img = document.getElementById('oc-colm-qr-' + h.i); if(img) img.src = qr; }
        await precargarImagen(qr);
        const pdfs = [];
        for(const h of hojas){
          const bytes = new Uint8Array(await generarPdfBytesDesdeNodo('oc-colm-hoja-' + h.i));
          pdfs.push({ nombre: nombreArchivoSeguro(`${ordenCompraNumero(h.oc)} ${h.grupo.cliente} - Tutelas ${MESES_NOMBRES[mes]} ${anio}`) + '.pdf', contentType: 'application/pdf', base64: bytesABase64(bytes), tamano: bytes.length });
        }
        if(vivo){ setAdjuntos([...pdfs, ...salida]); setEstado('listo'); }
      }catch(err){ console.error(err); if(vivo){ setError(mensajeError(err)); setEstado('error'); } }
    })();
    return () => { vivo = false; };
  }, [completo, mes, anio]);

  const pesoTotal = adjuntos.reduce((s, a) => s + a.tamano, 0);
  const comunes = { mesIndex0: mes, anio, detalle, totalGeneral, mensaje, adjuntos };
  const vistaPrevia = useMemo(() => construirCorreoOrdenesColmedica({ ...comunes, srcFirma: firma?.srcVistaPrevia }), [detalle, totalGeneral, mensaje, adjuntos, firma, mes, anio]);
  const yaEnviado = enviados.find(e => e.asunto.includes(etiqueta)) || (envioLocal[etiqueta] ? { fecha: envioLocal[etiqueta].fecha, para: envioLocal[etiqueta].para } : null);
  const puedeEnviar = completo && estado === 'listo' && adjuntos.length > 0 && !!firma && !accion;

  async function enviar(){
    setConfirmando(false); setAccion('enviando');
    try{
      const real = construirCorreoOrdenesColmedica(comunes);   // recalcula el saludo (días/tardes) al momento de enviar
      await enviarCorreoDirecto({ to: [CORREO_DANIA_COLMEDICA], cc: [CORREO_GERENCIA_NOVEDADES], subject: real.asunto, htmlBody: real.html, categorias: [CATEGORIA_ORDENES_COLMEDICA], desde: REMITENTE_SOPORTE, imagenes: [firma], adjuntos });
      const registro = { ...envioLocal, [etiqueta]: { fecha: new Date().toISOString(), para: [CORREO_DANIA_COLMEDICA] } };
      setEnvioLocal(registro);
      try{ localStorage.setItem(CLAVE_LOCAL, JSON.stringify(registro)); }catch(e){ /* sin almacenamiento */ }
      notify?.('✓ Correo de Órdenes Colmédica de ' + etiqueta + ' enviado a ' + CORREO_DANIA_COLMEDICA + ' con copia a Gerencia, desde ' + REMITENTE_SOPORTE + ', con ' + adjuntos.length + ' adjuntos.', 'success');
      onClose?.();
    }catch(err){
      console.error(err); notify?.('No se pudo enviar el correo: ' + mensajeError(err), 'error');
    }finally{ setAccion(''); }
  }
  async function crearBorrador(){
    setAccion('borrador');
    try{
      const real = construirCorreoOrdenesColmedica(comunes);
      const r = await crearBorradorConImagenesInline({ to: [CORREO_DANIA_COLMEDICA], cc: [CORREO_GERENCIA_NOVEDADES], subject: real.asunto, htmlBody: real.html, imagenes: [firma], adjuntos, categorias: [CATEGORIA_ORDENES_COLMEDICA + ' (borrador)'], buzon: REMITENTE_SOPORTE, caerAlBuzonPropio: true });
      const aviso = r.enBuzonPropio
        ? '⚠ No pude crear el borrador en ' + REMITENTE_SOPORTE + ' (Microsoft no encuentra ese buzón: entra una vez a https://outlook.office.com con esa cuenta para activarlo). Quedó en TUS Borradores, para ' + CORREO_DANIA_COLMEDICA + ' con copia a Gerencia: cambia el «De» a Soporte si tienes permiso.'
        : '✓ Borrador creado en los Borradores de ' + REMITENTE_SOPORTE + ', para ' + CORREO_DANIA_COLMEDICA + ' con copia a Gerencia.';
      notify?.(aviso + (r.imagenesFallidas?.length ? ' No se pudo adjuntar: ' + r.imagenesFallidas.join(', ') + '.' : ''), (r.enBuzonPropio || r.imagenesFallidas?.length) ? 'info' : 'success');
    }catch(err){
      console.error(err); notify?.('No se pudo crear el borrador: ' + mensajeError(err), 'error');
    }finally{ setAccion(''); }
  }

  const fechaImp = fechaDeImpresion();
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={'Correo de Órdenes Colmédica de ' + etiqueta}>
      <div className="confirm-box felicitacion-box" style={{ maxWidth: 980 }}>
        <div className="felicitacion-cab">
          <h3>Correo de Órdenes Colmédica — {etiqueta}</h3>
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
        {yaEnviado && <p className="badge badge-verde" style={{ display: 'inline-block', margin: '0 0 8px' }}>✓ Ya se envió el {dma(yaEnviado.fecha)} a {yaEnviado.para.join(', ')}</p>}
        <p className="save-hint" style={{ margin: '0 0 8px' }}>
          <strong>De:</strong> Soporte ({REMITENTE_SOPORTE}) · <strong>Para:</strong> Dania ({CORREO_DANIA_COLMEDICA}) · <strong>Con copia:</strong> Gerencia ({CORREO_GERENCIA_NOVEDADES}) · <strong>Asunto:</strong> {vistaPrevia.asunto}
        </p>
        <div className="field" style={{ marginBottom: 10 }}>
          <label>Mensaje antes de la relación (saluda «Dra. Carolina, {saludoSegunHora()}.» según la hora)</label>
          <textarea rows={3} value={mensaje} onChange={e => { setMensaje(e.target.value); setConfirmando(false); }} />
        </div>

        <p className="save-hint" style={{ margin: '0 0 4px' }}><strong>Órdenes de compra del mes:</strong></p>
        <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 12.5 }}>
          {ordenes.map(({ grupo, oc }) => (
            <li key={grupo.cliente} style={{ color: oc ? undefined : '#a3281c' }}>
              {oc ? <>✓ {grupo.cliente} — <strong>{ordenCompraNumero(oc)}</strong></> : <>✗ {grupo.cliente} — <strong>falta guardar su orden de compra</strong> (botón «Generar borrador» de ese cliente → «Guardar cambios»)</>}
            </li>
          ))}
          {!ordenes.length && <li>No hay contestaciones en {etiqueta}.</li>}
        </ul>
        {estado === 'preparando' && <p className="save-hint">Preparando los PDF de las órdenes y los Excel…</p>}
        {estado === 'error' && <p className="save-hint" style={{ color: 'var(--rojo, #a3281c)' }}>No se pudieron preparar los adjuntos: {error}</p>}
        {adjuntos.length > 0 && (
          <p className="save-hint" style={{ margin: '0 0 8px' }}><strong>Adjuntos ({adjuntos.length}, {mb(pesoTotal)}):</strong> {adjuntos.map(a => a.nombre + ' (' + mb(a.tamano) + ')').join(' · ')}</p>
        )}
        <VistaPreviaCorreo titulo="Vista previa del correo de Órdenes Colmédica" html={vistaPrevia.html} />
        <div className="confirm-actions" style={{ marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {liveMode ? (
            confirmando ? (
              <>
                <span className="save-hint" style={{ margin: 0 }}>{yaEnviado ? <strong>Ya se envió este mes. </strong> : null}Se enviará un correo real a {CORREO_DANIA_COLMEDICA} con copia a Gerencia, desde {REMITENTE_SOPORTE}, con {adjuntos.length} adjuntos. ¿Enviarlo?</span>
                <IconTextButton icon="mail" variant="primary" onClick={enviar} disabled={!puedeEnviar}>Sí, enviar</IconTextButton>
                <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)}>Cancelar</button>
              </>
            ) : (
              <>
                <IconTextButton icon="mail" variant="primary" onClick={() => setConfirmando(true)} disabled={!puedeEnviar}>{accion === 'enviando' ? 'Enviando…' : 'Enviar a Dania'}</IconTextButton>
                <button type="button" className="btn-secondary" onClick={crearBorrador} disabled={!puedeEnviar}>{accion === 'borrador' ? 'Creando…' : 'Solo crear borrador'}</button>
                {!completo && ordenes.length > 0 && <span className="save-hint" style={{ margin: 0, color: '#a3281c' }}>Guarda primero las órdenes de compra que faltan.</span>}
              </>
            )
          ) : <span className="save-hint" style={{ margin: 0 }}>En modo demo solo se ve la vista previa; el envío requiere la sesión real.</span>}
        </div>
      </div>
      {/* Hojas de las órdenes de compra (fuera de pantalla): de aquí salen los PDF adjuntos. En el <body> para que nada del modal las recorte. */}
      {completo && createPortal(
        <>
          {hojas.map(h => (
            <OrdenCompraHoja key={h.i} idHoja={'oc-colm-hoja-' + h.i} idQr={'oc-colm-qr-' + h.i} ordenCompra={h.oc} form={h.form} linkedCliente={h.linkedCliente} linkedFactura={h.linkedFactura} totals={h.totals} fechaImpresion={fechaImp} />
          ))}
        </>,
        document.body
      )}
    </div>
  );
}
