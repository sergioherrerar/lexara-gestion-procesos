import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { stripHtml } from '../lib/graph';
import {
  numerosDelProceso, consultarRama, fechaDMA, resumenAnotacion, esDeTramite, yaEstaEnHistorico,
  actuacionesNuevas, htmlRenglones, renglonHistorico, actualizacionDesdeRama, ultimaActualizacionDesdeRama, abrirEnRamaJudicial,
  agregarLineasAlEstado, fechaMasRecienteDelEstado, mezclarActuaciones, anotacionLimpia, descubrirHermanos,
} from '../lib/ramaJudicial';

// Pestaña «Rama Judicial» de la ficha del proceso (2026-11-13): lee las actuaciones del proceso en la Consulta Nacional Unificada de la Rama
// (por el «No. completo» y los números del «Histórico números completos») y permite pasarlas al Histórico en el mismo formato por renglones
// («DD-MM-AAAA Actuación: anotación»). Nunca guarda sola: agrega los renglones al Histórico del formulario y se guardan con «Guardar cambios».
const POR_PAGINA = 50;

function FilaActuacion({ act, nuevo, enHistorico, canWrite, onAgregar }){
  const [abierta, setAbierta] = useState(false);
  const nota = String(act.anotacion || '').replace(/\s+/g, ' ').trim();
  const corta = anotacionLimpia(nota, 140) || '—';   // la lista muestra la anotación limpia; «ver más» el texto completo de la Rama
  return (
    <tr className={esDeTramite(act) ? 'rama-tramite' : ''}>
      <td className="rama-fecha">{fechaDMA(act.fecha)}</td>
      <td className="rama-act">
        <strong>{act.actuacion}</strong>
        {nuevo && <span className="badge badge-verde rama-nuevo">Nueva</span>}
        {enHistorico && <span className="rama-ya">ya en el Histórico</span>}
      </td>
      <td className="rama-nota">
        {abierta ? (nota || '—') : corta}
        {nota.length > corta.length && <button type="button" className="rama-mas" onClick={() => setAbierta(v => !v)}>{abierta ? 'ver menos' : 'ver más'}</button>}
      </td>
      <td className="rama-term">{fechaDMA(act.fechaInicial) || ''}</td>
      <td className="rama-term">{fechaDMA(act.fechaFinal) || ''}</td>
      <td className="rama-term">{fechaDMA(act.registro) || ''}</td>
      <td className="rama-acc">
        {canWrite && !enHistorico && <button type="button" className="btn-secondary rama-btn" onClick={() => onAgregar(act)} title="Agrega este renglón al final del Histórico y lo pone también en Estado y Fecha Estado">Al Histórico</button>}
      </td>
    </tr>
  );
}

export default function RamaJudicialTab({ proceso, historico, estadoActual, fechaEstado, canWrite, config, notify, onAgregarAlHistorico, onActualizar, onRamaVista }){
  const { principal, historicos } = useMemo(() => numerosDelProceso(proceso), [proceso]);
  const radicados = useMemo(() => [principal, ...historicos].filter(Boolean), [principal, historicos]);
  const [hermanos, setHermanos] = useState({});   // radicado -> otras terminaciones (00-03) que existen en la Rama
  const descubiertos = useRef(new Set());
  const pedidosHermanos = useRef(new Set());
  const [buscarHist, setBuscarHist] = useState(false);   // false: solo el número principal; true: también los del histórico
  const [resultados, setResultados] = useState({});   // radicado -> { cargando, error, datos }
  const [verTodo, setVerTodo] = useState({});
  const [completando, setCompletando] = useState({});   // radicado -> true mientras se traen las actuaciones que faltan
  const [filtroFecha, setFiltroFecha] = useState({ desde: '', hasta: '' });
  const [conTramite, setConTramite] = useState(true);   // por defecto se ven TODAS las actuaciones (las de trámite salen atenuadas), como en la página de la Rama
  const url = config?.RAMA_JUDICIAL_URL;

  // La Rama entrega las actuaciones de 40 en 40: se piden las primeras páginas y, en segundo plano, el resto hasta tenerlas todas.
  const completar = useCallback(async (rad, inicial) => {
    let datos = inicial;
    try{
      for(let vuelta = 0; vuelta < 8; vuelta++){
        const p = datos.procesos?.[0];
        if(!p || p.esPrivado || !p.totalActuaciones || p.actuaciones.length >= p.totalActuaciones) break;
        setCompletando(prev => ({ ...prev, [rad]: true }));
        const desde = Math.floor(p.actuaciones.length / 40) + 1;
        const mas = await consultarRama(url, rad, { forzar: true, paginas: 3, desde });
        const q = mas.procesos?.[0];
        const unidas = mezclarActuaciones(p.actuaciones, q?.actuaciones || []);
        if(unidas.length <= p.actuaciones.length){
          // El servidor es la versión anterior de la consulta (ignora «desde»): se piden de una vez las páginas que permita.
          const todo = await consultarRama(url, rad, { forzar: true, paginas: 6 });
          const t = todo.procesos?.[0];
          const u2 = mezclarActuaciones(p.actuaciones, t?.actuaciones || []);
          if(u2.length > p.actuaciones.length) datos = { ...datos, procesos: [{ ...p, actuaciones: u2 }, ...datos.procesos.slice(1)] };
          setResultados(prev => ({ ...prev, [rad]: { ...(prev[rad] || {}), datos } }));
          break;
        }
        datos = { ...datos, procesos: [{ ...p, actuaciones: unidas }, ...datos.procesos.slice(1)] };
        setResultados(prev => ({ ...prev, [rad]: { ...(prev[rad] || {}), datos } }));
      }
    }catch(e){ /* se queda con lo ya cargado */ }
    finally{ setCompletando(prev => ({ ...prev, [rad]: false })); }
  }, [url]);

  const cargar = useCallback(async (rad, forzar) => {
    setResultados(prev => ({ ...prev, [rad]: { ...(prev[rad] || {}), cargando: true, error: '' } }));
    try{
      const datos = await consultarRama(url, rad, { forzar });
      setResultados(prev => ({ ...prev, [rad]: { cargando: false, error: '', datos } }));
      completar(rad, datos);
      // Cada número completo (principal o del histórico) se busca también con sus otras terminaciones 00, 01, 02 y 03: son procesos distintos.
      if(radicados.includes(rad) && !descubiertos.current.has(rad)){
        descubiertos.current.add(rad);
        descubrirHermanos(url, rad).then(h => { if(h.length) setHermanos(prev => ({ ...prev, [rad]: h })); });
      }
    }catch(e){
      setResultados(prev => ({ ...prev, [rad]: { cargando: false, error: e.message || String(e), datos: prev[rad]?.datos } }));
    }
  }, [url, completar, radicados]);

  // Las otras terminaciones que existen se consultan una tras otra, apenas se descubren.
  useEffect(() => {
    const nuevos = Object.values(hermanos).flat().filter(h => !pedidosHermanos.current.has(h) && !radicados.includes(h));
    if(!nuevos.length) return undefined;
    let cancelado = false;
    (async () => { for(const h of nuevos){ if(cancelado) break; pedidosHermanos.current.add(h); await cargar(h, false); } })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hermanos]);

  // Al abrir la pestaña se consulta primero el número principal (el servidor limita las consultas y se recuerdan 10 minutos).
  useEffect(() => { if(principal) cargar(principal, false); }, [principal, cargar]);

  // Al ver la Rama del proceso, su novedad en la balanza de la cabecera se da por vista.
  useEffect(() => {
    const fecha = resultados[principal]?.datos?.procesos?.[0]?.fechaUltimaActuacion;
    if(principal && fecha && onRamaVista) onRamaVista(principal, fecha);
  }, [resultados, principal, onRamaVista]);

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

  // Cada número con sus otras terminaciones (00-03) que existen, justo debajo.
  const entradas = [];
  radicados.forEach(r => {
    entradas.push({ rad: r, base: r, esBase: true });
    (hermanos[r] || []).filter(h => !radicados.includes(h) && !entradas.some(e => e.rad === h)).forEach(h => entradas.push({ rad: h, base: r, esBase: false }));
  });

  if(!radicados.length){
    return <div className="empty-state empty-state-compact">Este proceso no tiene un «No. completo» de 23 dígitos, así que no se puede consultar en la Rama Judicial.</div>;
  }

  // «Al Histórico» de una fila (2026-11-13, pedido del usuario: «este botón también coloca el dato en Estado»): el renglón va al final del Histórico y la actuación pasa a ser el Estado,
  // con su fecha en Fecha Estado. Al guardar, el Estado anterior se archiva solo en el Histórico, como siempre.
  function agregarUno(act){
    const estado = agregarLineasAlEstado(estadoActual, [renglonHistorico(act, 140)]);
    onActualizar({ historicoHtml: htmlRenglones([act]), estado, fechaEstado: fechaMasRecienteDelEstado(estado) || String(act.fecha || '').slice(0, 10) || null });
    notify?.('Se agregó al Histórico y como línea nueva del Estado, y la Fecha Estado quedó en la más reciente. Presione «Guardar cambios» para guardarlo.', 'success');
  }

  function agregar(acts){
    if(!acts.length) return;
    onAgregarAlHistorico(htmlRenglones(acts));
    notify?.(acts.length === 1 ? 'Se agregó 1 renglón al Histórico. Presione «Guardar cambios» para guardarlo.' : `Se agregaron ${acts.length} renglones al Histórico. Presione «Guardar cambios» para guardarlos.`, 'success');
  }

  // Actualización completa: renglones nuevos en el Histórico + Estado y Fecha Estado con lo más reciente + marca de «Actualizado desde la Rama».
  function actualizarTodo(acts){
    const r = actualizacionDesdeRama(acts, historico, fechaEstado, estadoActual);
    onActualizar({ historicoHtml: r.historicoHtml, estado: r.estado, fechaEstado: r.fechaEstado });
    const partes = [];
    if(r.nuevas.length) partes.push(r.nuevas.length === 1 ? '1 renglón nuevo en el Histórico' : `${r.nuevas.length} renglones nuevos en el Histórico`);
    if(r.estado) partes.push('líneas nuevas en el Estado y Fecha Estado actualizada');
    notify?.((partes.length ? partes.join(' y ') : 'Sin novedades; se anotó la revisión en el Histórico') + '. Presione «Guardar cambios» para guardarlo.', 'success');
  }
  const ultimaRev = ultimaActualizacionDesdeRama(historico);

  return (
    <div className="field-section rama-tab">
      <p className="rama-fuente">Fuente: Consulta Nacional Unificada de la Rama Judicial (pública). Aquí solo se lee; «Al Histórico» deja la actuación en el Histórico y en el Estado, y luego se guarda con «Guardar cambios». De cada número también se buscan las terminaciones 00, 01, 02 y 03 (son procesos distintos: instancias) y salen debajo si existen.</p>
      <p className="rama-ultima">{ultimaRev ? `Última actualización desde la Rama Judicial: ${ultimaRev}.` : 'Este proceso aún no se ha actualizado desde la Rama Judicial.'}</p>
      <div className="rama-fechas">
        <label>Desde <input type="date" value={filtroFecha.desde} onChange={e => setFiltroFecha(f => ({ ...f, desde: e.target.value }))} /></label>
        <label>Hasta <input type="date" value={filtroFecha.hasta} onChange={e => setFiltroFecha(f => ({ ...f, hasta: e.target.value }))} /></label>
        {(filtroFecha.desde || filtroFecha.hasta) && <button type="button" className="rama-mas" onClick={() => setFiltroFecha({ desde: '', hasta: '' })}>Quitar filtro</button>}
      </div>
      <label className="rama-filtro"><input type="checkbox" checked={conTramite} onChange={e => setConTramite(e.target.checked)} /> Mostrar también actuaciones de trámite (envíos, recibos, notificaciones por estado)</label>
      {historicos.length > 0 && !buscarHist && (
        <div className="rama-hist-aviso">
          <span>Este proceso tiene {historicos.length === 1 ? '1 número' : `${historicos.length} números`} en el histórico, que no se consulta{historicos.length === 1 ? '' : 'n'} hasta que usted lo pida.</span>
          <button type="button" className="btn-secondary rama-btn" onClick={() => setBuscarHist(true)}>Consultar también {historicos.length === 1 ? 'el número del histórico' : 'los números del histórico'}</button>
        </div>
      )}
      {entradas.map(({ rad, base, esBase }) => {
        const esPrincipal = rad === principal;
        if(esBase && !esPrincipal && !resultados[rad] && !buscarHist){
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
              <h4><span className={'rama-tipo' + (esPrincipal ? ' principal' : '')} title={esBase ? '' : 'Es un proceso distinto: la misma radicación con otra terminación (instancia)'}>{esBase ? (esPrincipal ? 'Número principal' : 'Número del histórico') : `${base === principal ? 'Principal' : 'Histórico'} · termina en ${rad.slice(-2)}`}</span> {rad}</h4>
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
              const visibles = acts.filter(a => (conTramite || !esDeTramite(a)) && (!filtroFecha.desde || String(a.fecha || '').slice(0, 10) >= filtroFecha.desde) && (!filtroFecha.hasta || String(a.fecha || '').slice(0, 10) <= filtroFecha.hasta));
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
                        <span>{p.totalActuaciones} actuaciones en la Rama{completando[rad] ? ` (cargando el resto: ${acts.length} de ${p.totalActuaciones}…)` : acts.length < p.totalActuaciones ? ` (se muestran las ${acts.length} más recientes: para ver todas hay que actualizar la consulta en Netlify)` : ''}.</span>
                        {nuevas.length > 0 && <strong className="rama-hay-nuevas">{nuevas.length} {nuevas.length === 1 ? 'novedad' : 'novedades'} para el Histórico</strong>}
                        {canWrite && (() => {
                          const u = actualizacionDesdeRama(acts, historico, fechaEstado, estadoActual);
                          return u.hayCambios
                            ? <button type="button" className="btn-primary rama-btn" onClick={() => actualizarTodo(acts)} title="Agrega los renglones nuevos al Histórico y pone en Estado y Fecha Estado lo más reciente de la Rama">Actualizar Histórico y Estado{nuevas.length ? ` (${nuevas.length})` : ''}</button>
                            : <span className="rama-al-dia">Estado e Histórico al día</span>;
                        })()}
                      </div>
                      <div className="table-wrap">
                        <table className="rama-tabla">
                          <thead><tr><th>Fecha</th><th>Actuación</th><th>Anotación</th><th>Inicia término</th><th>Finaliza término</th><th>Registro</th><th></th></tr></thead>
                          <tbody>
                            {visibles.slice(0, tope).map(a => (
                              <FilaActuacion
                                key={a.consecutivo + '-' + a.fecha} act={a} canWrite={canWrite}
                                nuevo={idsNuevas.has(a.consecutivo)} enHistorico={yaEstaEnHistorico(a, historico)}
                                onAgregar={agregarUno}
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
