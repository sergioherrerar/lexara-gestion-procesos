import { Fragment, useEffect, useMemo, useState } from 'react';
import VistaPreviaCorreo from './VistaPreviaCorreo';
import { IconTextButton } from './IconButton';
import { crearAdjuntosNovedades } from '../lib/excelNovedades';
import { crearBorradorConImagenesInline, enviarCorreoDirecto, listarEnviadosPorCategoria, firmaComoImagenInline, fmtMonto, mensajeError } from '../lib/graph';
import {
  MESES_NOMBRES, CATEGORIA_NOVEDADES, CORREO_GERENCIA_NOVEDADES, destinatariaNovedades,
  armarNovedades, construirCorreoNovedades, etiquetaCiclo, dma, nombreDeSaludo,
} from '../lib/novedadesNomina';

// Administración → «Novedades de nómina» (2026-10-29, pedido del usuario): reúne en una sola vista lo que se le reporta cada mes a Beatriz (contadora contratista)
// y arma el correo para ella, con copia a Gerencia. Se envía el día 29: así todo lo que pasó hasta el 28 queda dentro del ciclo.
// Siempre se ve la información y la vista previa del correo ANTES de enviarlo (pedido del usuario: «siempre con la vista de la información»).
const peso = n => '$ ' + fmtMonto(n);
const num = n => String(Math.round((Number(n) || 0) * 100) / 100).replace('.', ',');

function Tarjeta({ titulo, valor, detalle }){
  return (
    <div style={{ flex: '1 1 190px', padding: '12px 16px', background: 'var(--gris-claro)', borderRadius: 10 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--texto-suave)' }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--verde-oscuro)', margin: '2px 0' }}>{valor}</div>
      <div style={{ fontSize: 12, color: 'var(--texto-suave)' }}>{detalle}</div>
    </div>
  );
}

const REMITENTE_SOPORTE = 'soporte@lexaraabogados.com';

export default function NovedadesNominaTab({ colaboradores, tutelas, valoresEntidad, horasExtras, vacacionesPeriodos, liveMode, notify }){
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [confirmando, setConfirmando] = useState(false);
  const [accion, setAccion] = useState('');      // 'enviando' | 'borrador' | ''
  const [enviados, setEnviados] = useState([]);
  const [errorEnviados, setErrorEnviados] = useState('');

  const destinatario = useMemo(() => destinatariaNovedades(colaboradores), [colaboradores]);
  // Este correo SIEMPRE sale de la cuenta de Soporte (pedido del usuario 2026-10-29) y cierra con «Cordial saludo,» y la firma de Soporte (imagen real que entregó el usuario).
  const [firma, setFirma] = useState(null);       // { nombre, cid, base64, contentType, srcVistaPrevia }
  useEffect(() => {
    let vivo = true;
    firmaComoImagenInline('soporte').then(f => { if(vivo) setFirma(f); }).catch(err => console.error('No se pudo leer la firma de Soporte:', err));
    return () => { vivo = false; };
  }, []);

  const novedades = useMemo(
    () => armarNovedades({ anio, mesIndex0: mes, tutelas, valoresEntidad, horasExtras, vacacionesPeriodos, colaboradores }),
    [anio, mes, tutelas, valoresEntidad, horasExtras, vacacionesPeriodos, colaboradores]
  );
  // Soportes en Excel del mes (los mismos datos del correo, en cuatro archivos adjuntos). Se rearman cuando cambian el mes o los datos.
  const [adjuntos, setAdjuntos] = useState([]);   // [{ nombre, contentType, base64, tamano }]
  const [generandoAdj, setGenerandoAdj] = useState(true);
  const [errorAdj, setErrorAdj] = useState('');
  useEffect(() => {
    let vivo = true;
    setGenerandoAdj(true); setErrorAdj('');
    crearAdjuntosNovedades({ novedades, tutelas, valoresEntidad, anio, mesIndex0: mes })
      .then(a => { if(vivo){ setAdjuntos(a); setGenerandoAdj(false); } })
      .catch(err => { console.error('No se pudieron armar los Excel de soporte:', err); if(vivo){ setAdjuntos([]); setErrorAdj(mensajeError(err)); setGenerandoAdj(false); } });
    return () => { vivo = false; };
  }, [novedades, tutelas, valoresEntidad, anio, mes]);
  function descargarAdjunto(a){
    const bin = atob(a.base64); const bytes = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: a.contentType }));
    const enlace = document.createElement('a'); enlace.href = url; enlace.download = a.nombre;
    document.body.appendChild(enlace); enlace.click(); enlace.remove(); URL.revokeObjectURL(url);
  }
  const kb = n => Math.max(1, Math.round(n / 1024)) + ' KB';

  // `correo` = la vista previa (la firma como data:) · `correoReal` = el que se envía (la firma adjunta en línea, cid:).
  const correo = useMemo(() => construirCorreoNovedades({ novedades, anio, mesIndex0: mes, destinatario, srcFirma: firma?.srcVistaPrevia, adjuntos }), [novedades, anio, mes, destinatario, firma, adjuntos]);
  const correoReal = useMemo(() => construirCorreoNovedades({ novedades, anio, mesIndex0: mes, destinatario, adjuntos }), [novedades, anio, mes, destinatario, adjuntos]);
  const etiqueta = etiquetaCiclo(anio, mes);

  // ¿Ya se envió el correo de este ciclo? (se busca en Enviados por la categoría y el asunto)
  useEffect(() => {
    if(!liveMode) return;
    let vivo = true;
    listarEnviadosPorCategoria(CATEGORIA_NOVEDADES, REMITENTE_SOPORTE)
      .then(l => { if(vivo){ setEnviados(l); setErrorEnviados(''); } })
      .catch(err => { console.error('No se pudo revisar los Enviados de Soporte:', err); if(vivo) setErrorEnviados(mensajeError(err)); });
    return () => { vivo = false; };
  }, [liveMode, accion]);
  // Además de Enviados de Soporte, se recuerda en este navegador lo que ya se envió desde aquí (por si no se pudiera leer ese buzón).
  const [envioLocal, setEnvioLocal] = useState(() => { try{ return JSON.parse(localStorage.getItem('lexara-novedades-enviadas') || '{}'); }catch(e){ return {}; } });
  const yaEnviado = enviados.find(e => e.asunto.includes(etiqueta)) || (envioLocal[etiqueta] ? { fecha: envioLocal[etiqueta].fecha, para: envioLocal[etiqueta].para } : null);

  const esHoy29OMas = hoy.getDate() >= 29 && mes === hoy.getMonth() && anio === hoy.getFullYear();
  const anios = [hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1];

  async function enviar(){
    setConfirmando(false); setAccion('enviando');
    try{
      if(!firma) throw new Error('La imagen de la firma de Soporte aún no se ha cargado; espera un momento e inténtalo de nuevo.');
      if(!adjuntos.length) throw new Error('Los Excel de soporte aún no están listos' + (errorAdj ? ' (' + errorAdj + ')' : '; espera un momento e inténtalo de nuevo') + '.');
      await enviarCorreoDirecto({ to: [destinatario.correo], cc: [CORREO_GERENCIA_NOVEDADES], subject: correoReal.asunto, htmlBody: correoReal.html, categorias: [CATEGORIA_NOVEDADES], desde: REMITENTE_SOPORTE, imagenes: [firma], adjuntos });
      const registro = { ...envioLocal, [etiqueta]: { fecha: new Date().toISOString(), para: [destinatario.correo] } };
      setEnvioLocal(registro);
      try{ localStorage.setItem('lexara-novedades-enviadas', JSON.stringify(registro)); }catch(e){ /* sin almacenamiento */ }
      notify?.('✓ Novedades de nómina de ' + etiqueta + ' enviadas a ' + destinatario.nombre + ' (' + destinatario.correo + ') con copia a Gerencia, desde ' + REMITENTE_SOPORTE + '.', 'success');
    }catch(err){
      console.error(err); notify?.('No se pudo enviar el correo: ' + mensajeError(err), 'error');
    }finally{ setAccion(''); }
  }
  async function crearBorrador(){
    setAccion('borrador');
    try{
      if(!firma) throw new Error('La imagen de la firma de Soporte aún no se ha cargado; espera un momento e inténtalo de nuevo.');
      if(!adjuntos.length) throw new Error('Los Excel de soporte aún no están listos' + (errorAdj ? ' (' + errorAdj + ')' : '; espera un momento e inténtalo de nuevo') + '.');
      const r = await crearBorradorConImagenesInline({ to: [destinatario.correo], cc: [CORREO_GERENCIA_NOVEDADES], subject: correoReal.asunto, htmlBody: correoReal.html, imagenes: [firma], adjuntos, categorias: [CATEGORIA_NOVEDADES + ' (borrador)'], buzon: REMITENTE_SOPORTE, caerAlBuzonPropio: true });
      notify?.(r.enBuzonPropio
        ? '⚠ No pude crear el borrador en ' + REMITENTE_SOPORTE + ' (Microsoft no encuentra ese buzón: entra una vez a https://outlook.office.com con esa cuenta para activarlo). Quedó en TUS Borradores, dirigido a ' + destinatario.correo + ' con copia a Gerencia: cambia el «De» a Soporte si tienes permiso.'
        : '✓ Borrador creado en los Borradores de ' + REMITENTE_SOPORTE + ', dirigido a ' + destinatario.correo + ' con copia a Gerencia.', r.enBuzonPropio ? 'info' : 'success');
    }catch(err){
      console.error(err); notify?.('No se pudo crear el borrador: ' + mensajeError(err), 'error');
    }finally{ setAccion(''); }
  }

  const { tutelas: nt, horas: nh, vacaciones: nv, rangos } = novedades;
  return (
    <div className="panel">
      <div className="panel-head"><h3>Novedades de nómina</h3></div>
      <div className="panel-body">
        <p style={{ margin: '0 0 16px', color: 'var(--texto-suave)', fontSize: 13 }}>
          Resumen del mes para la nómina: <strong>tutelas contestadas</strong> y <strong>horas extras aprobadas</strong> del 29 del mes anterior al 28 del mes elegido, y <strong>vacaciones</strong> del mes completo (1 al 31).
          El día 29 se envía a {destinatario.nombre} con copia a Gerencia, para que todo lo ocurrido hasta el 28 quede dentro del ciclo.
        </p>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
          <div className="field" style={{ maxWidth: 200 }}>
            <label>Mes de nómina</label>
            <select value={mes} onChange={e => { setMes(Number(e.target.value)); setConfirmando(false); }}>
              {MESES_NOMBRES.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </div>
          <div className="field" style={{ maxWidth: 120 }}>
            <label>Año</label>
            <select value={anio} onChange={e => { setAnio(Number(e.target.value)); setConfirmando(false); }}>
              {anios.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <p className="save-hint" style={{ margin: 0, flex: 1, minWidth: 240 }}>
            Tutelas y horas extras: <strong>{dma(rangos.cortesInicio)} al {dma(rangos.cortesFin)}</strong> · Vacaciones: <strong>{dma(rangos.mesInicio)} al {dma(rangos.mesFin)}</strong>
          </p>
        </div>

        {yaEnviado ? (
          <p className="badge badge-verde" style={{ display: 'inline-block', marginBottom: 14 }}>✓ Ya se envió el {dma(yaEnviado.fecha)} a {yaEnviado.para.join(', ')}</p>
        ) : esHoy29OMas ? (
          <p className="badge badge-naranja" style={{ display: 'inline-block', marginBottom: 14 }}>Hoy toca enviar las novedades de {etiqueta}: el ciclo ya cerró el 28.</p>
        ) : null}
        {errorEnviados && !yaEnviado && (
          <p className="save-hint" style={{ margin: '0 0 12px' }}>
            No pude revisar los Enviados de Soporte para saber si este ciclo ya se mandó (no afecta el envío; antes de enviar te pido confirmación). Detalle: {errorEnviados}
          </p>
        )}
        {nv.pendientes > 0 && (
          <p className="save-hint" style={{ margin: '0 0 12px', color: '#b3590a' }}>
            Hay {nv.pendientes} solicitud(es) de vacaciones sin aprobar en este mes. Apruébalas en Administración → Vacaciones antes de enviar, o saldrán marcadas como pendientes.
          </p>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
          <Tarjeta titulo="Tutelas contestadas" valor={nt.cantidad} detalle={'Valor Abogado: ' + peso(nt.totalGeneral)} />
          <Tarjeta titulo="Horas extras aprobadas" valor={num(nh.totalGeneral) + ' h'} detalle={nh.filas.length + ' colaborador(es) · ' + nh.registros + ' registro(s)'} />
          <Tarjeta titulo="Vacaciones del mes" valor={nv.filas.length} detalle={num(nv.totalDiasEnMes) + ' días en el mes' + (nv.pendientes ? ' · ' + nv.pendientes + ' sin aprobar' : '')} />
        </div>

        <h4 style={{ margin: '0 0 8px', color: 'var(--verde-oscuro)' }}>Consolidado por persona</h4>
        {novedades.consolidado.filas.length ? (
          <div className="table-wrap" style={{ marginBottom: 22 }}>
            <table className="table-compact">
              <thead><tr><th>Persona</th><th style={{ textAlign: 'right' }}>Tutelas contestadas</th><th style={{ textAlign: 'right' }}>Valor Abogado</th><th style={{ textAlign: 'right' }}>Horas extras</th><th style={{ textAlign: 'right' }}>Días de vacaciones</th></tr></thead>
              <tbody>
                {novedades.consolidado.filas.map(f => (
                  <tr key={f.persona}><td className="cliente">{f.persona}</td><td style={{ textAlign: 'right' }}>{f.tutelas || '—'}</td><td style={{ textAlign: 'right' }}>{f.valor ? peso(f.valor) : '—'}</td><td style={{ textAlign: 'right' }}>{f.horas ? num(f.horas) : '—'}</td><td style={{ textAlign: 'right' }}>{f.vacaciones ? num(f.vacaciones) : '—'}</td></tr>
                ))}
                <tr style={{ fontWeight: 700 }}><td>Total general</td><td style={{ textAlign: 'right' }}>{novedades.consolidado.totales.tutelas}</td><td style={{ textAlign: 'right' }}>{peso(novedades.consolidado.totales.valor)}</td><td style={{ textAlign: 'right' }}>{num(novedades.consolidado.totales.horas)}</td><td style={{ textAlign: 'right' }}>{num(novedades.consolidado.totales.vacaciones)}</td></tr>
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state empty-state-compact" style={{ marginBottom: 22 }}>No hay novedades en este período.</div>}

        <h4 style={{ margin: '0 0 8px', color: 'var(--verde-oscuro)' }}>1. Tutelas contestadas</h4>
        {nt.grupos.length ? (
          <div className="table-wrap" style={{ marginBottom: 22 }}>
            <table className="table-compact">
              <thead><tr><th>Abogado</th><th>Tipo de respuesta</th><th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ textAlign: 'right' }}>Valor Abogado</th></tr></thead>
              <tbody>
                {nt.grupos.map(g => (
                  <Fragment key={g.abogado}>
                    {g.filas.map(f => (
                      <tr key={g.abogado + f.tipoRespuesta}><td className="cliente">{g.abogado}</td><td>{f.tipoRespuesta}</td><td style={{ textAlign: 'right' }}>{f.cantidad}</td><td style={{ textAlign: 'right' }}>{peso(f.total)}</td></tr>
                    ))}
                    <tr key={g.abogado + 'total'} style={{ background: 'var(--verde-claro-fondo, #e3efee)', fontWeight: 700 }}>
                      <td colSpan={2}>Total {g.abogado}</td><td style={{ textAlign: 'right' }}>{g.filas.reduce((s, f) => s + f.cantidad, 0)}</td><td style={{ textAlign: 'right' }}>{peso(g.totalAbogado)}</td>
                    </tr>
                  </Fragment>
                ))}
                <tr style={{ fontWeight: 700 }}><td colSpan={2}>Total general</td><td style={{ textAlign: 'right' }}>{nt.cantidad}</td><td style={{ textAlign: 'right' }}>{peso(nt.totalGeneral)}</td></tr>
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state empty-state-compact" style={{ marginBottom: 22 }}>No hubo tutelas contestadas en este período.</div>}

        <h4 style={{ margin: '0 0 8px', color: 'var(--verde-oscuro)' }}>2. Horas extras aprobadas</h4>
        {nh.filas.length ? (
          <div className="table-wrap" style={{ marginBottom: 22 }}>
            <table className="table-compact">
              <thead><tr><th>Colaborador</th><th style={{ textAlign: 'right' }}>Diurnas</th><th style={{ textAlign: 'right' }}>Nocturnas</th><th style={{ textAlign: 'right' }}>Diurnas fest.</th><th style={{ textAlign: 'right' }}>Nocturnas fest.</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
              <tbody>
                {nh.filas.map(f => (
                  <tr key={f.colaborador}><td className="cliente">{f.colaborador}</td><td style={{ textAlign: 'right' }}>{num(f.diurnas)}</td><td style={{ textAlign: 'right' }}>{num(f.nocturnas)}</td><td style={{ textAlign: 'right' }}>{num(f.diurnasFest)}</td><td style={{ textAlign: 'right' }}>{num(f.nocturnasFest)}</td><td style={{ textAlign: 'right' }}><strong>{num(f.total)}</strong></td></tr>
                ))}
                <tr style={{ fontWeight: 700 }}><td colSpan={5}>Total general</td><td style={{ textAlign: 'right' }}>{num(nh.totalGeneral)}</td></tr>
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state empty-state-compact" style={{ marginBottom: 22 }}>No hubo horas extras aprobadas en este período.</div>}

        <h4 style={{ margin: '0 0 8px', color: 'var(--verde-oscuro)' }}>3. Vacaciones</h4>
        {nv.filas.length ? (
          <div className="table-wrap" style={{ marginBottom: 22 }}>
            <table className="table-compact">
              <thead><tr><th>Colaborador</th><th>Inicio</th><th>Fin</th><th style={{ textAlign: 'right' }}>Días solicitados</th><th style={{ textAlign: 'right' }}>Días en el mes</th><th>Estado</th></tr></thead>
              <tbody>
                {nv.filas.map((f, i) => (
                  <tr key={f.colaborador + f.inicio + i}>
                    <td className="cliente">{f.colaborador}</td><td>{dma(f.inicio)}</td><td>{dma(f.fin)}</td>
                    <td style={{ textAlign: 'right' }}>{num(f.diasSolicitados)}</td>
                    <td style={{ textAlign: 'right' }}>{num(f.diasEnMes)}{f.cruzaMes ? ' *' : ''}</td>
                    <td>{f.pendiente ? <span className="badge badge-naranja">Pendiente de aprobación</span> : <span className="badge badge-verde">Aprobada</span>}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}><td colSpan={4}>Total días en el mes</td><td style={{ textAlign: 'right' }}>{num(nv.totalDiasEnMes)}</td><td></td></tr>
              </tbody>
            </table>
            {nv.filas.some(f => f.cruzaMes) && <p className="save-hint" style={{ margin: '6px 0 0' }}>* El período cruza de mes: se cuentan solo los días hábiles que caen dentro de este mes.</p>}
          </div>
        ) : <div className="empty-state empty-state-compact" style={{ marginBottom: 22 }}>No hay vacaciones en este mes.</div>}

        <h4 style={{ margin: '0 0 8px', color: 'var(--verde-oscuro)' }}>Correo para {destinatario.nombre}</h4>
        <p className="save-hint" style={{ margin: '0 0 8px' }}>
          <strong>De:</strong> Soporte ({REMITENTE_SOPORTE}) · <strong>Para:</strong> {destinatario.nombre} ({destinatario.correo}) · <strong>Con copia:</strong> Gerencia ({CORREO_GERENCIA_NOVEDADES}) · <strong>Asunto:</strong> {correo.asunto}
        </p>
        <div style={{ margin: '0 0 8px', fontSize: 12.5 }}>
          <strong>Adjuntos (Excel de soporte del mes{adjuntos.length ? ', ' + adjuntos.length + ' archivos' : ''}):</strong>{' '}
          {generandoAdj ? <span className="save-hint">Preparando los Excel…</span> : errorAdj ? <span style={{ color: '#a3281c' }}>No se pudieron armar: {errorAdj}</span> : (
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8 }}>
              {adjuntos.map(a => (
                <button key={a.nombre} type="button" className="btn-secondary" style={{ fontSize: 11.5, padding: '3px 9px' }} title="Descargar para revisarlo" onClick={() => descargarAdjunto(a)}>
                  {a.nombre} ({kb(a.tamano)})
                </button>
              ))}
            </span>
          )}
        </div>
        <VistaPreviaCorreo titulo="Vista previa del correo de novedades de nómina" html={correo.html} style={{ height: 520 }} />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
          {liveMode ? (
            confirmando ? (
              <>
                <span className="save-hint" style={{ margin: 0 }}>
                  {yaEnviado ? <strong>Ya se envió este ciclo. </strong> : null}Se enviará un correo real a {destinatario.correo} con copia a Gerencia, desde {REMITENTE_SOPORTE}, con {adjuntos.length} Excel de soporte adjuntos. ¿Enviarlo?
                </span>
                <IconTextButton icon="mail" variant="primary" onClick={enviar} disabled={!!accion}>Sí, enviar</IconTextButton>
                <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)}>Cancelar</button>
              </>
            ) : (
              <>
                <IconTextButton icon="mail" variant="primary" onClick={() => setConfirmando(true)} disabled={!!accion || generandoAdj}>{accion === 'enviando' ? 'Enviando…' : 'Enviar a ' + nombreDeSaludo(destinatario)}</IconTextButton>
                <button type="button" className="btn-secondary" onClick={crearBorrador} disabled={!!accion || generandoAdj}>{accion === 'borrador' ? 'Creando…' : 'Solo crear borrador'}</button>
              </>
            )
          ) : <span className="save-hint" style={{ margin: 0 }}>En modo demo solo se ve la información y la vista previa; el envío requiere la sesión real.</span>}
        </div>
      </div>
    </div>
  );
}
