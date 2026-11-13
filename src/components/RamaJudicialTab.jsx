import { useState, useEffect, useMemo, useCallback } from 'react';
import { stripHtml } from '../lib/graph';
import {
  numerosDelProceso, consultarRama, fechaDMA, resumenAnotacion, esDeTramite, yaEstaEnHistorico,
  actuacionesNuevas, htmlRenglones, actualizacionDesdeRama, ultimaActualizacionDesdeRama, abrirEnRamaJudicial,
} from '../lib/ramaJudicial';

// Pestaña «Rama Judicial» de la ficha del proceso (2026-11-13): lee las actuaciones del proceso en la Consulta Nacional Unificada de la Rama
// (por el «No. completo» y los números del «Histórico números completos») y permite pasarlas al Histórico en el mismo formato por renglones
// («DD-MM-AAAA Actuación: anotación»). Nunca guarda sola: agrega los renglones al Histórico del formulario y se guardan con «Guardar cambios».
const POR_PAGINA = 25;

function FilaActuacion({ act, nuevo, enHistorico, canWrite, onAgregar }){
  const [abierta, setAbierta] = useState(false);
  const nota = String(act.anotacion || '').replace(/\s+/g, ' ').trim();
  const corta = nota.length > 140 ? nota.slice(0, 137).replace(/\s+\S*$/, '') + '…' : nota;
  return (
    <tr className={esDeTramite(act) ? 'rama-tramite' : ''}>
      <td className="rama-fecha">{fechaDMA(act.fecha)}</td>
      <td className="rama-act">
        <strong>{act.actuacion}</strong>
        {nuevo && <span className="badge badge-verde rama-nuevo">Nueva</span>}
        {enHistorico && <span className="rama-ya">ya en el Histórico</span>}
      </td>
      <td className="rama-nota">
        {abierta ? nota : corta}
        {nota.length > 140 && <button type="button" className="rama-mas" onClick={() => setAbierta(v => !v)}>{abierta ? 'ver menos' : 'ver más'}</button>}
      </td>
      <td className="rama-acc">
        {canWrite && !enHistorico && <button type="button" className="btn-secondary rama-btn" onClick={() => onAgregar(act)} title="Agrega este renglón al final del Histórico">Al Histórico</button>}
      </td>
    </tr>
  );
}

export default function RamaJudicialTab({ proceso, historico, fechaEstado, canWrite, config, notify, onAgregarAlHistorico, onActualizar }){
  const { principal, historicos } = useMemo(() => numerosDelProceso(proceso), [proceso]);
  const radicados = useMemo(() => [principal, ...historicos].filter(Boolean), [principal, historicos]);
  const [buscarHist, setBuscarHist] = useState(false);   // false: solo el número principal; true: también los del histórico
  const [resultados, setResultados] = useState({});   // radicado -> { cargando, error, datos }
  const [verTodo, setVerTodo] = useState({});
  const [conTramite, setConTramite] = useState(false);
  const url = config?.RAMA_JUDICIAL_URL;

  const cargar = useCallback(async (rad, forzar) => {
    setResultados(prev => ({ ...prev, [rad]: { ...(prev[rad] || {}), cargando: true, error: '' } }));
    try{
      const datos = await consultarRama(url, rad, { forzar });
      setResultados(prev => ({ ...prev, [rad]: { cargando: false, error: '', datos } }));
    }catch(e){
      setResultados(prev => ({ ...prev, [rad]: { cargando: false, error: e.message || String(e), datos: prev[rad]?.datos } }));
    }
  }, [url]);

  // Al abrir la pestaña se consulta primero el número principal (el servidor limita las consultas y se recuerdan 10 minutos).
  useEffect(() => { if(principal) cargar(principal, false); }, [principal, cargar]);

  // Si el principal no aparece en la Rama, se pasa solo a los números del histórico.
  const resPrincipal = resultados[principal];
  useEffect(() => {
    if(resPrincipal?.datos && !resPrincipal.error && (resPrincipal.datos.procesos || []).length === 0 && historicos.length) setBuscarHist(true);
  }, [resPrincipal, historicos.length]);

  // Los números del histórico se consultan uno tras otro (nunca todos a la vez), después del principal.
  useEffect(() => {
    if(!buscarHist) return undefined;
    let cancelado = false;
    (async () => { for(const h of historicos){ if(cancelado) break; await cargar(h, false); } })();
    return () => { cancelado = true; };
  }, [buscarHist, historicos, cargar]);

  if(!radicados.length){
    return <div className="empty-state empty-state-compact">Este proceso no tiene un «No. completo» de 23 dígitos, así que no se puede consultar en la Rama Judicial.</div>;
  }

  function agregar(acts){
    if(!acts.length) return;
    onAgregarAlHistorico(htmlRenglones(acts));
    notify?.(acts.length === 1 ? 'Se agregó 1 renglón al Histórico. Presione «Guardar cambios» para guardarlo.' : `Se agregaron ${acts.length} renglones al Histórico. Presione «Guardar cambios» para guardarlos.`, 'success');
  }

  // Actualización completa: renglones nuevos en el Histórico + Estado y Fecha Estado con lo más reciente + marca de «Actualizado desde la Rama».
  function actualizarTodo(acts){
    const r = actualizacionDesdeRama(acts, historico, fechaEstado);
    onActualizar({ historicoHtml: r.historicoHtml, estado: r.estado, fechaEstado: r.fechaEstado });
    const partes = [];
    if(r.nuevas.length) partes.push(r.nuevas.length === 1 ? '1 renglón nuevo en el Histórico' : `${r.nuevas.length} renglones nuevos en el Histórico`);
    if(r.estado) partes.push('Estado y Fecha Estado actualizados');
    notify?.((partes.length ? partes.join(' y ') : 'Sin novedades; se anotó la revisión en el Histórico') + '. Presione «Guardar cambios» para guardarlo.', 'success');
  }
  const ultimaRev = ultimaActualizacionDesdeRama(historico);

  return (
    <div className="field-section rama-tab">
      <p className="rama-fuente">Fuente: Consulta Nacional Unificada de la Rama Judicial (pública). Aquí solo se lee; para dejar algo en el Histórico use «Al Histórico» y luego «Guardar cambios».</p>
      <p className="rama-ultima">{ultimaRev ? `Última actualización desde la Rama Judicial: ${ultimaRev}.` : 'Este proceso aún no se ha actualizado desde la Rama Judicial.'}</p>
      <label className="rama-filtro"><input type="checkbox" checked={conTramite} onChange={e => setConTramite(e.target.checked)} /> Mostrar también actuaciones de trámite (envíos, recibos, notificaciones por estado)</label>
      {historicos.length > 0 && !buscarHist && (
        <div className="rama-hist-aviso">
          <span>Este proceso tiene {historicos.length === 1 ? '1 número' : `${historicos.length} números`} en el histórico, que no se consulta{historicos.length === 1 ? '' : 'n'} hasta que usted lo pida.</span>
          <button type="button" className="btn-secondary rama-btn" onClick={() => setBuscarHist(true)}>Consultar también {historicos.length === 1 ? 'el número del histórico' : 'los números del histórico'}</button>
        </div>
      )}
      {radicados.map(rad => {
        const esPrincipal = rad === principal;
        if(!esPrincipal && !resultados[rad] && !buscarHist){
          return (
            <div key={rad} className="rama-bloque rama-bloque-pendiente">
              <div className="rama-cab">
                <h4><span className="rama-tipo">Número del histórico</span> {rad}</h4>
                <span className="rama-cab-acc">
                  <button type="button" className="btn-secondary rama-btn" onClick={() => abrirEnRamaJudicial(proceso, notify, rad)} title="Abre la consulta de la Rama Judicial y copia este radicado">Abrir en la Rama</button>
                  <button type="button" className="btn-secondary rama-btn" onClick={() => cargar(rad, false)}>Consultar este número</button>
                </span>
              </div>
            </div>
          );
        }
        const r = resultados[rad] || { cargando: true };
        const procesos = r.datos?.procesos || [];
        return (
          <div key={rad} className="rama-bloque">
            <div className="rama-cab">
              <h4><span className={'rama-tipo' + (esPrincipal ? ' principal' : '')}>{esPrincipal ? 'Número principal' : 'Número del histórico'}</span> {rad}</h4>
              <span className="rama-cab-acc">
                <button type="button" className="btn-secondary rama-btn" onClick={() => abrirEnRamaJudicial(proceso, notify, rad)} title="Abre la consulta de la Rama Judicial y copia este radicado">Abrir en la Rama</button>
                <button type="button" className="btn-secondary rama-btn" onClick={() => cargar(rad, true)} disabled={r.cargando}>{r.cargando ? 'Consultando…' : 'Actualizar'}</button>
              </span>
            </div>
            {r.error && <div className="rama-error" role="alert">{r.error}</div>}
            {!r.datos && r.cargando && <div className="rama-cargando">Consultando la Rama Judicial…</div>}
            {r.datos && procesos.length === 0 && <div className="empty-state empty-state-compact">La Rama Judicial no devolvió ningún proceso con este número.</div>}
            {procesos.map(p => {
              const acts = p.actuaciones || [];
              const nuevas = actuacionesNuevas(acts, historico);
              const idsNuevas = new Set(nuevas.map(a => a.consecutivo));
              const visibles = acts.filter(a => conTramite || !esDeTramite(a));
              const tope = verTodo[rad + p.idProceso] ? visibles.length : POR_PAGINA;
              return (
                <div key={p.idProceso} className="rama-proceso">
                  <dl className="rama-datos">
                    <div><dt>Despacho</dt><dd>{p.despacho || '—'}</dd></div>
                    <div><dt>Departamento</dt><dd>{p.departamento || '—'}</dd></div>
                    <div><dt>Radicación</dt><dd>{fechaDMA(p.fechaProceso) || '—'}</dd></div>
                    <div><dt>Última actuación</dt><dd>{fechaDMA(p.fechaUltimaActuacion) || '—'}</dd></div>
                    <div className="rama-ancho"><dt>Sujetos procesales</dt><dd>{p.sujetos || '—'}</dd></div>
                  </dl>
                  {p.esPrivado && <div className="rama-error">Este proceso es privado (reserva): la Rama no muestra sus actuaciones.</div>}
                  {p.error && <div className="rama-error">{p.error}</div>}
                  {!p.esPrivado && (
                    <>
                      <div className="rama-resumen">
                        <span>{p.totalActuaciones} actuaciones en la Rama{acts.length < p.totalActuaciones ? ` (se muestran las ${acts.length} más recientes)` : ''}.</span>
                        {nuevas.length > 0 && <strong className="rama-hay-nuevas">{nuevas.length} {nuevas.length === 1 ? 'novedad' : 'novedades'} para el Histórico</strong>}
                        {canWrite && (() => {
                          const u = actualizacionDesdeRama(acts, historico, fechaEstado);
                          return u.hayCambios
                            ? <button type="button" className="btn-primary rama-btn" onClick={() => actualizarTodo(acts)} title="Agrega los renglones nuevos al Histórico y pone en Estado y Fecha Estado lo más reciente de la Rama">Actualizar Histórico y Estado{nuevas.length ? ` (${nuevas.length})` : ''}</button>
                            : <span className="rama-al-dia">Estado e Histórico al día</span>;
                        })()}
                      </div>
                      <div className="table-wrap">
                        <table className="rama-tabla">
                          <thead><tr><th>Fecha</th><th>Actuación</th><th>Anotación</th><th></th></tr></thead>
                          <tbody>
                            {visibles.slice(0, tope).map(a => (
                              <FilaActuacion
                                key={a.consecutivo + '-' + a.fecha} act={a} canWrite={canWrite}
                                nuevo={idsNuevas.has(a.consecutivo)} enHistorico={yaEstaEnHistorico(a, historico)}
                                onAgregar={x => agregar([x])}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {visibles.length > tope && <button type="button" className="btn-secondary rama-btn" onClick={() => setVerTodo(v => ({ ...v, [rad + p.idProceso]: true }))}>Ver las {visibles.length - tope} restantes</button>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
