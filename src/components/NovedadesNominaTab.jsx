import { Fragment, useEffect, useMemo, useState } from 'react';
import { IconTextButton } from './IconButton';
import { crearBorradorCorreo, enviarCorreoDirecto, listarEnviadosPorCategoria, cuentaDelPortal, fmtMonto, mensajeError } from '../lib/graph';
import {
  MESES_NOMBRES, CATEGORIA_NOVEDADES, CORREO_GERENCIA_NOVEDADES, destinatariaNovedades,
  armarNovedades, construirCorreoNovedades, etiquetaCiclo, dma,
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

export default function NovedadesNominaTab({ colaboradores, tutelas, valoresEntidad, horasExtras, vacacionesPeriodos, liveMode, notify }){
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [confirmando, setConfirmando] = useState(false);
  const [accion, setAccion] = useState('');      // 'enviando' | 'borrador' | ''
  const [enviados, setEnviados] = useState([]);
  const [errorEnviados, setErrorEnviados] = useState('');

  const destinatario = useMemo(() => destinatariaNovedades(colaboradores), [colaboradores]);
  const remitente = useMemo(() => {
    const yo = (colaboradores || []).find(c => String(c.Correo || '').trim().toLowerCase() === cuentaDelPortal());
    return yo?.Nombre || 'Equipo Lexara Abogados';
  }, [colaboradores]);

  const novedades = useMemo(
    () => armarNovedades({ anio, mesIndex0: mes, tutelas, valoresEntidad, horasExtras, vacacionesPeriodos, colaboradores }),
    [anio, mes, tutelas, valoresEntidad, horasExtras, vacacionesPeriodos, colaboradores]
  );
  const correo = useMemo(() => construirCorreoNovedades({ novedades, anio, mesIndex0: mes, destinatario, remitente }), [novedades, anio, mes, destinatario, remitente]);
  const etiqueta = etiquetaCiclo(anio, mes);

  // ¿Ya se envió el correo de este ciclo? (se busca en Enviados por la categoría y el asunto)
  useEffect(() => {
    if(!liveMode) return;
    let vivo = true;
    listarEnviadosPorCategoria(CATEGORIA_NOVEDADES)
      .then(l => { if(vivo){ setEnviados(l); setErrorEnviados(''); } })
      .catch(err => { console.error(err); if(vivo) setErrorEnviados(mensajeError(err)); });
    return () => { vivo = false; };
  }, [liveMode, accion]);
  const yaEnviado = enviados.find(e => e.asunto.includes(etiqueta));

  const esHoy29OMas = hoy.getDate() >= 29 && mes === hoy.getMonth() && anio === hoy.getFullYear();
  const anios = [hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1];

  async function enviar(){
    setConfirmando(false); setAccion('enviando');
    try{
      await enviarCorreoDirecto({ to: [destinatario.correo], cc: [CORREO_GERENCIA_NOVEDADES], subject: correo.asunto, htmlBody: correo.html, categorias: [CATEGORIA_NOVEDADES] });
      notify?.('✓ Novedades de nómina de ' + etiqueta + ' enviadas a ' + destinatario.nombre + ' (' + destinatario.correo + ') con copia a Gerencia, desde tu cuenta.', 'success');
    }catch(err){
      console.error(err); notify?.('No se pudo enviar el correo: ' + mensajeError(err), 'error');
    }finally{ setAccion(''); }
  }
  async function crearBorrador(){
    setAccion('borrador');
    try{
      await crearBorradorCorreo({ to: [destinatario.correo], cc: [CORREO_GERENCIA_NOVEDADES], subject: correo.asunto, htmlBody: correo.html, categorias: [CATEGORIA_NOVEDADES + ' (borrador)'] });
      notify?.('✓ Borrador creado en tus Borradores de Outlook, dirigido a ' + destinatario.correo + ' con copia a Gerencia.', 'success');
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
        {errorEnviados && <p className="save-hint" style={{ margin: '0 0 12px' }}>No se pudo revisar si ya se envió: {errorEnviados}</p>}
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
          <strong>Para:</strong> {destinatario.nombre} ({destinatario.correo}) · <strong>Con copia:</strong> Gerencia ({CORREO_GERENCIA_NOVEDADES}) · <strong>Asunto:</strong> {correo.asunto}
        </p>
        <iframe title="Vista previa del correo de novedades de nómina" className="felicitacion-vista" srcDoc={correo.html} sandbox="" style={{ height: 520 }} />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
          {liveMode ? (
            confirmando ? (
              <>
                <span className="save-hint" style={{ margin: 0 }}>
                  {yaEnviado ? <strong>Ya se envió este ciclo. </strong> : null}Se enviará un correo real a {destinatario.correo} con copia a Gerencia, desde tu cuenta. ¿Enviarlo?
                </span>
                <IconTextButton icon="mail" variant="primary" onClick={enviar} disabled={!!accion}>Sí, enviar</IconTextButton>
                <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)}>Cancelar</button>
              </>
            ) : (
              <>
                <IconTextButton icon="mail" variant="primary" onClick={() => setConfirmando(true)} disabled={!!accion}>{accion === 'enviando' ? 'Enviando…' : 'Enviar a ' + destinatario.nombre.split(' ')[0]}</IconTextButton>
                <button type="button" className="btn-secondary" onClick={crearBorrador} disabled={!!accion}>{accion === 'borrador' ? 'Creando…' : 'Solo crear borrador'}</button>
              </>
            )
          ) : <span className="save-hint" style={{ margin: 0 }}>En modo demo solo se ve la información y la vista previa; el envío requiere la sesión real.</span>}
        </div>
      </div>
    </div>
  );
}
