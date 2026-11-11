import { useEffect, useMemo, useRef, useState } from 'react';
import VistaPreviaCorreo from './VistaPreviaCorreo';
import { IconTextButton } from './IconButton';
import {
  crearBorradorConImagenesInline, enviarCorreoDirecto, listarEnviadosPorCategoria, firmaComoImagenInline, listarSoportesGastosDelMes, descargarSoporteBase64,
  fechaISODeDocumento, ordenCompraNumero, facturaNumero, mensajeError,
} from '../lib/graph';
import { facturaDeOrden } from '../lib/cruceFacturasOrdenes';
import { buscarOrdenDelMes, MESES_NOMBRES } from '../lib/ordenesComprasColmedica';
import {
  construirCorreoFacturasMes, etiquetaMesFacturas, buscarSoportesDeFila, CATEGORIA_FACTURAS_COLMEDICA, MENSAJE_FACTURAS_POR_DEFECTO,
} from '../lib/correoFacturasMes';
import { CORREO_GERENCIA_NOVEDADES, destinatariaNovedades, dma } from '../lib/novedadesNomina';

// Órdenes Colmédica → «Generador de facturas del mes», paso 2 (2026-11-11, pedido del usuario): correo a Beatriz (con copia a Gerencia, desde Soporte) con las facturas generadas a partir de las
// órdenes de compra del mes. Los PDF de cada factura y de cada orden se traen de SharePoint: «ADMINISTRACION / 1 Soportes de gastos MD / {año} / {mes}» (carpeta por la fecha del documento).
// Los PDF de las facturas recién creadas se guardan solos en segundo plano: si aún no aparecen, se vuelve a buscar cada pocos segundos. Se ve todo antes de enviar.
const REMITENTE_SOPORTE = 'soporte@lexaraabogados.com';
const CLAVE_LOCAL = 'lexara-facturas-colmedica-enviadas';
const MAX_INTENTOS = 20;
const mb = n => (n / 1048576 >= 1 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

export default function EnviarFacturasColmedicaModal({ mes, anio, grupos, facturas, ordenesCompra, parejas, colaboradores, config, liveMode, notify, onClose }){
  const etiqueta = etiquetaMesFacturas(anio, mes);
  const beatriz = useMemo(() => destinatariaNovedades(colaboradores), [colaboradores]);
  const [mensaje, setMensaje] = useState(MENSAJE_FACTURAS_POR_DEFECTO);
  const [firma, setFirma] = useState(null);
  const [archivos, setArchivos] = useState([]);           // archivos de las carpetas año/mes de los documentos
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [intentos, setIntentos] = useState(0);
  const [adjuntos, setAdjuntos] = useState([]);           // [{ nombre, contentType, base64, tamano }]
  const [descargando, setDescargando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [accion, setAccion] = useState('');
  const [enviados, setEnviados] = useState([]);
  const [envioLocal, setEnvioLocal] = useState(() => { try{ return JSON.parse(localStorage.getItem(CLAVE_LOCAL) || '{}'); }catch(e){ return {}; } });
  const cacheDescarga = useRef(new Map());

  const filas = useMemo(() => (grupos || []).map(g => {
    const oc = buscarOrdenDelMes(g.cliente, ordenesCompra, mes, anio);
    const factura = oc ? (parejas?.[anio + '-' + mes + '|' + g.cliente] || facturaDeOrden(facturas, oc, ordenesCompra).factura) : null;   // la recién creada para esa orden manda sobre el cruce
    return { cliente: g.cliente, oc, factura };
  }), [grupos, ordenesCompra, facturas, parejas, mes, anio]);
  const conSoportes = useMemo(() => filas.map(f => ({ ...f, ...buscarSoportesDeFila(archivos, f.oc, f.factura) })), [filas, archivos]);
  const completoDocs = filas.length > 0 && filas.every(f => f.oc && f.factura);
  const completoPdf = completoDocs && conSoportes.every(f => f.pdfOrden && f.pdfFactura);

  // Carpetas año/mes de los documentos (la fecha de cada orden y de cada factura), sin repetir: 'AAAA-MM'.
  const claveCarpetas = useMemo(() => {
    const s = new Set();
    filas.forEach(f => { if(f.oc) s.add(fechaISODeDocumento(f.oc).slice(0, 7)); if(f.factura) s.add(fechaISODeDocumento(f.factura).slice(0, 7)); });
    return [...s].sort().join(',');
  }, [filas]);
  const carpetas = claveCarpetas ? claveCarpetas.split(',') : [];

  useEffect(() => { let vivo = true; firmaComoImagenInline('soporte').then(f => { if(vivo) setFirma(f); }).catch(err => console.error('No se pudo leer la firma de Soporte:', err)); return () => { vivo = false; }; }, []);
  useEffect(() => {
    if(!liveMode) return;
    let vivo = true;
    listarEnviadosPorCategoria(CATEGORIA_FACTURAS_COLMEDICA, REMITENTE_SOPORTE).then(l => { if(vivo) setEnviados(l); }).catch(err => console.error('No se pudo revisar los Enviados de Soporte:', err));
    return () => { vivo = false; };
  }, [liveMode, accion]);

  // Busca los PDF en SharePoint; mientras falte alguno repite cada 6 s (hasta ~2 min) porque las copias de las facturas nuevas se suben en segundo plano.
  useEffect(() => {
    if(!liveMode || !completoDocs || !claveCarpetas) return;
    let vivo = true;
    (async () => {
      setBuscando(true);
      try{
        const todos = [];
        for(const c of claveCarpetas.split(',')) todos.push(...await listarSoportesGastosDelMes(config?.GASTOS_SOPORTES_SHARE_URL, c + '-01'));
        if(vivo){ setArchivos(todos); setErrorBusqueda(''); }
      }catch(err){ console.error(err); if(vivo) setErrorBusqueda(mensajeError(err)); }
      finally{ if(vivo) setBuscando(false); }
    })();
    return () => { vivo = false; };
  }, [liveMode, completoDocs, claveCarpetas, intentos]);
  useEffect(() => {
    if(!liveMode || !completoDocs || completoPdf || buscando || intentos >= MAX_INTENTOS) return;
    const t = setTimeout(() => setIntentos(n => n + 1), 6000);
    return () => clearTimeout(t);
  }, [liveMode, completoDocs, completoPdf, intentos, buscando]);

  // Descarga (una sola vez por archivo) los PDF encontrados: primero la factura y luego la orden de cada cliente.
  const aDescargar = useMemo(() => conSoportes.flatMap(f => [f.pdfFactura, f.pdfOrden]).filter(Boolean), [conSoportes]);
  const claveDescarga = aDescargar.map(a => a.driveId + '/' + a.itemId).join('|');
  useEffect(() => {
    if(!liveMode || !aDescargar.length){ setAdjuntos([]); return; }
    let vivo = true;
    (async () => {
      setDescargando(true);
      try{
        const salida = [];
        for(const a of aDescargar){
          const clave = a.driveId + '/' + a.itemId;
          if(!cacheDescarga.current.has(clave)) cacheDescarga.current.set(clave, await descargarSoporteBase64(a.driveId, a.itemId));
          const d = cacheDescarga.current.get(clave);
          salida.push({ nombre: a.nombre, contentType: 'application/pdf', base64: d.base64, tamano: d.tamano });
        }
        if(vivo) setAdjuntos(salida);
      }catch(err){ console.error(err); if(vivo) setErrorBusqueda('No se pudieron descargar los PDF: ' + mensajeError(err)); }
      finally{ if(vivo) setDescargando(false); }
    })();
    return () => { vivo = false; };
  }, [liveMode, claveDescarga]);

  const pesoTotal = adjuntos.reduce((s, a) => s + a.tamano, 0);
  const comunes = { mesIndex0: mes, anio, filas, mensaje, adjuntos };
  const vistaPrevia = useMemo(() => construirCorreoFacturasMes({ ...comunes, srcFirma: firma?.srcVistaPrevia }), [filas, mensaje, adjuntos, firma, mes, anio]);
  const yaEnviado = enviados.find(e => e.asunto.includes(etiqueta)) || (envioLocal[etiqueta] ? { fecha: envioLocal[etiqueta].fecha, para: envioLocal[etiqueta].para } : null);
  const puedeEnviar = completoPdf && !descargando && adjuntos.length === aDescargar.length && adjuntos.length > 0 && !!firma && !accion;

  async function enviar(){
    setConfirmando(false); setAccion('enviando');
    try{
      const real = construirCorreoFacturasMes(comunes);   // recalcula el saludo (días/tardes) al momento de enviar
      await enviarCorreoDirecto({ to: [beatriz.correo], cc: [CORREO_GERENCIA_NOVEDADES], subject: real.asunto, htmlBody: real.html, categorias: [CATEGORIA_FACTURAS_COLMEDICA], desde: REMITENTE_SOPORTE, imagenes: [firma], adjuntos });
      const registro = { ...envioLocal, [etiqueta]: { fecha: new Date().toISOString(), para: [beatriz.correo] } };
      setEnvioLocal(registro);
      try{ localStorage.setItem(CLAVE_LOCAL, JSON.stringify(registro)); }catch(e){ /* sin almacenamiento */ }
      notify?.('✓ Correo de facturas de ' + etiqueta + ' enviado a ' + beatriz.correo + ' con copia a Gerencia, desde ' + REMITENTE_SOPORTE + ', con ' + adjuntos.length + ' adjuntos.', 'success');
      onClose?.();
    }catch(err){
      console.error(err); notify?.('No se pudo enviar el correo: ' + mensajeError(err), 'error');
    }finally{ setAccion(''); }
  }
  async function crearBorrador(){
    setAccion('borrador');
    try{
      const real = construirCorreoFacturasMes(comunes);
      const r = await crearBorradorConImagenesInline({ to: [beatriz.correo], cc: [CORREO_GERENCIA_NOVEDADES], subject: real.asunto, htmlBody: real.html, imagenes: [firma], adjuntos, categorias: [CATEGORIA_FACTURAS_COLMEDICA + ' (borrador)'], buzon: REMITENTE_SOPORTE, caerAlBuzonPropio: true });
      const aviso = r.enBuzonPropio
        ? '⚠ No pude crear el borrador en ' + REMITENTE_SOPORTE + ' (Microsoft no encuentra ese buzón: entra una vez a https://outlook.office.com con esa cuenta para activarlo). Quedó en TUS Borradores, para ' + beatriz.correo + ' con copia a Gerencia: cambia el «De» a Soporte si tienes permiso.'
        : '✓ Borrador creado en los Borradores de ' + REMITENTE_SOPORTE + ', para ' + beatriz.correo + ' con copia a Gerencia.';
      notify?.(aviso + (r.imagenesFallidas?.length ? ' No se pudo adjuntar: ' + r.imagenesFallidas.join(', ') + '.' : ''), (r.enBuzonPropio || r.imagenesFallidas?.length) ? 'info' : 'success');
    }catch(err){
      console.error(err); notify?.('No se pudo crear el borrador: ' + mensajeError(err), 'error');
    }finally{ setAccion(''); }
  }

  const rutaCarpetas = carpetas.length ? carpetas.map(c => c.slice(0, 4) + ' / ' + MESES_NOMBRES[Number(c.slice(5)) - 1]).join(' · ') : String(anio);
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={'Correo de facturas de ' + etiqueta}>
      <div className="confirm-box felicitacion-box" style={{ maxWidth: 980 }}>
        <div className="felicitacion-cab">
          <h3>Correo de facturas a Beatriz — {etiqueta}</h3>
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
        {yaEnviado && <p className="badge badge-verde" style={{ display: 'inline-block', margin: '0 0 8px' }}>✓ Ya se envió el {dma(yaEnviado.fecha)} a {yaEnviado.para.join(', ')}</p>}
        <p className="save-hint" style={{ margin: '0 0 8px' }}>
          <strong>De:</strong> Soporte ({REMITENTE_SOPORTE}) · <strong>Para:</strong> Beatriz ({beatriz.correo}) · <strong>Con copia:</strong> Gerencia ({CORREO_GERENCIA_NOVEDADES}) · <strong>Asunto:</strong> {vistaPrevia.asunto}
        </p>
        <div className="field" style={{ marginBottom: 10 }}>
          <label>Mensaje antes del detalle (saluda «Beatriz, buenos días.» o «Beatriz, buenas tardes.» según la hora)</label>
          <textarea rows={3} value={mensaje} onChange={e => { setMensaje(e.target.value); setConfirmando(false); }} />
        </div>

        <p className="save-hint" style={{ margin: '0 0 4px' }}><strong>Soportes en «ADMINISTRACION / 1 Soportes de gastos MD / {rutaCarpetas}»:</strong></p>
        <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 12.5 }}>
          {conSoportes.map(f => {
            const ok = f.oc && f.factura && f.pdfOrden && f.pdfFactura;
            return (
              <li key={f.cliente} style={{ color: ok ? undefined : '#a3281c' }}>
                {ok ? '✓' : '✗'} {f.cliente} —{' '}
                {!f.oc ? <strong>falta la orden de compra</strong>
                  : !f.factura ? <strong>falta la factura (créala en el paso anterior)</strong>
                  : <>factura <strong>FE {facturaNumero(f.factura)}</strong> {f.pdfFactura ? '✓ PDF' : '(PDF aún no está en la carpeta)'} · orden <strong>{ordenCompraNumero(f.oc)}</strong> {f.pdfOrden ? '✓ PDF' : '(PDF aún no está en la carpeta)'}</>}
              </li>
            );
          })}
          {!filas.length && <li>No hay contestaciones en {etiqueta}.</li>}
        </ul>
        {liveMode && completoDocs && !completoPdf && (
          <p className="save-hint">
            {buscando ? 'Buscando los PDF en SharePoint…' : intentos >= MAX_INTENTOS ? 'No aparecieron todos los PDF. Abre la factura o la orden que falte y usa «Guardar en PDF», o vuelve a buscar.' : 'Esperando que se guarden los PDF (se vuelve a buscar solo)…'}{' '}
            <button type="button" className="btn-secondary" onClick={() => setIntentos(n => (n >= MAX_INTENTOS ? 0 : n + 1))} disabled={buscando}>Buscar de nuevo</button>
          </p>
        )}
        {errorBusqueda && <p className="save-hint" style={{ color: 'var(--rojo, #a3281c)' }}>{errorBusqueda}</p>}
        {descargando && <p className="save-hint">Descargando los PDF…</p>}
        {adjuntos.length > 0 && (
          <p className="save-hint" style={{ margin: '0 0 8px' }}><strong>Adjuntos ({adjuntos.length}, {mb(pesoTotal)}):</strong> {adjuntos.map(a => a.nombre + ' (' + mb(a.tamano) + ')').join(' · ')}</p>
        )}
        <VistaPreviaCorreo titulo="Vista previa del correo de facturas" html={vistaPrevia.html} />
        <div className="confirm-actions" style={{ marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {liveMode ? (
            confirmando ? (
              <>
                <span className="save-hint" style={{ margin: 0 }}>{yaEnviado ? <strong>Ya se envió este mes. </strong> : null}Se enviará un correo real a {beatriz.correo} con copia a Gerencia, desde {REMITENTE_SOPORTE}, con {adjuntos.length} adjuntos.</span>
                <IconTextButton icon="mail" variant="primary" onClick={enviar} disabled={!puedeEnviar}>Sí, enviar</IconTextButton>
                <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)}>Cancelar</button>
              </>
            ) : (
              <>
                <IconTextButton icon="mail" variant="primary" onClick={() => setConfirmando(true)} disabled={!puedeEnviar}>{accion === 'enviando' ? 'Enviando…' : 'Enviar a Beatriz'}</IconTextButton>
                <button type="button" className="btn-secondary" onClick={crearBorrador} disabled={!puedeEnviar}>{accion === 'borrador' ? 'Creando…' : 'Solo crear borrador'}</button>
                {!completoPdf && filas.length > 0 && <span className="save-hint" style={{ margin: 0, color: '#a3281c' }}>Se habilita cuando estén todas las facturas, las órdenes y sus PDF.</span>}
              </>
            )
          ) : <span className="save-hint" style={{ margin: 0 }}>En modo demo solo se ve la vista previa; el envío requiere la sesión real.</span>}
        </div>
      </div>
    </div>
  );
}
