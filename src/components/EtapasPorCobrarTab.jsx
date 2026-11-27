import { useEffect, useMemo, useRef, useState } from 'react';
import ValidarEtapaModal from './ValidarEtapaModal';
import { stripHtml, mensajeError, parseMonto, fmtMonto, leerCorreosBandeja, listarValidacionesCobro, claveValidacionCobro } from '../lib/graph';
import { CORREO_GERENCIA_ACCESO } from '../lib/solicitudAccesoExpediente';
import { consultarRama, numerosDelProceso } from '../lib/ramaJudicial';
import { procesosDeCorreo } from '../lib/ramaResumen';
import { etiquetaEtapa } from '../lib/propuestaServicios';
import { etapasDeContratosMensuales, CONTRATOS_MENSUALES, etapasSinCobrar, reglaDeEtapa, detectarEnActuaciones, detectarEnHistorico, detectarPoderEnCorreos, borradorDeCobro } from '../lib/etapasPorCobrar';

// «Etapas por cobrar» (2026-11-27, pedido del usuario). En Informes se REVISA (qué etapas de las formas de pago ya pasaron y todavía no tienen factura ni orden de compra) y en Administración, además,
// se GENERA la orden de compra o la factura de esa etapa (abre el borrador ya lleno; no se guarda hasta «Guardar cambios»). Se revisan todos los procesos que tienen etapas sin cobrar. Es una pista con su evidencia:
// nunca marca «cumplida» ni factura sola.
const dma = f => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || ''); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };
const CLAVE_SMMLV = 'lexara-smmlv';

export default function EtapasPorCobrarTab({ modo = 'informes', procesos, formasPago, facturas, ordenesCompra, clientes, config, liveMode, notify, canWrite, onAbrirBorradorOrdenCompra, onAbrirBorradorFactura, onAbrirProceso, onAbrirFormaPago, miNombre, pendientes: pendientesDelPortal, onCrearPendiente }){
  const admin = modo === 'administracion';
  const [resultados, setResultados] = useState(null);   // clave -> { estado: 'pasada'|'sin-evidencia'|'manual', evidencia }
  const [fase, setFase] = useState('');
  const [progreso, setProgreso] = useState({ hecho: 0, total: 0 });
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('pasadas');
  const [smmlv, setSmmlv] = useState(() => { try{ return localStorage.getItem(CLAVE_SMMLV) || ''; }catch(e){ return ''; } });
  const cancelar = useRef(false);
  const [validaciones, setValidaciones] = useState({});   // clave contrato+etapa -> certificación del abogado
  const [validando, setValidando] = useState(null);   // fila que se está validando
  useEffect(() => { if(liveMode){ listarValidacionesCobro(config).then(setValidaciones).catch(e => console.error(e)); } }, [liveMode]);   // eslint-disable-line react-hooks/exhaustive-deps
  const url = config?.RAMA_JUDICIAL_URL;

  const pendientes = useMemo(() => etapasSinCobrar({ formasPago, facturas, ordenesCompra, procesos, parseMonto }), [formasPago, facturas, ordenesCompra, procesos]);
  const conProceso = pendientes.filter(x => x.proceso);
  const deMensuales = useMemo(() => etapasDeContratosMensuales(formasPago), [formasPago]);

  async function revisar(){
    setError(''); setResultados(null); cancelar.current = false;
    try{
      const resultado = {};
      // procesos distintos con etapas sin cobrar
      const porProceso = new Map();
      pendientes.forEach(x => { if(x.proceso){ if(!porProceso.has(x.proceso.id)) porProceso.set(x.proceso.id, { proceso: x.proceso, etapas: [] }); porProceso.get(x.proceso.id).etapas.push(x); } });
      const objetivos = [...porProceso.values()];
      // correos del poder (solo si alguna etapa es «Entrega de poder»)
      let correos = [];
      if(liveMode && pendientes.some(x => reglaDeEtapa(x.etapa)?.tipo === 'poder')){
        setFase('correos');
        try{ const d = new Date(); d.setDate(d.getDate() - 400); correos = await leerCorreosBandeja(CORREO_GERENCIA_ACCESO || 'gerencia@lexaraabogados.com', d.toISOString().slice(0, 10)); }
        catch(e){ console.error(e); setError('No se pudo leer el correo de Gerencia para detectar los poderes: ' + mensajeError(e)); }
      }
      setFase('rama'); setProgreso({ hecho: 0, total: objetivos.length });
      let indice = 0, hechos = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while(indice < objetivos.length && !cancelar.current){
          const o = objetivos[indice++];
          let actuaciones = [];
          if(liveMode && url){
            try{ const rad = numerosDelProceso(o.proceso).principal; if(rad && rad.length === 23){ const d = await consultarRama(url, rad, { paginas: 3 }); actuaciones = (d.procesos && d.procesos[0] && d.procesos[0].actuaciones) || []; } }
            catch(e){ /* sin Rama para este proceso: se mira el Histórico */ }
          }
          const historico = stripHtml(String(o.proceso.Historico || ''));
          o.etapas.forEach(x => {
            const regla = reglaDeEtapa(x.etapa);
            if(!regla){ resultado[x.clave] = { estado: 'manual' }; return; }
            let ev = null;
            if(regla.tipo === 'poder') ev = detectarPoderEnCorreos(correos, o.proceso, procesosDeCorreo);
            else ev = detectarEnActuaciones(regla, actuaciones) || detectarEnHistorico(regla, historico);
            resultado[x.clave] = ev ? { estado: 'pasada', evidencia: ev, nombre: regla.nombre } : { estado: 'sin-evidencia', nombre: regla.nombre };
          });
          hechos++; setProgreso({ hecho: hechos, total: objetivos.length });
        }
      }));
      pendientes.filter(x => !x.proceso).forEach(x => { resultado[x.clave] = { estado: 'sin-proceso' }; });
      setResultados(resultado);
      const n = Object.values(resultado).filter(r => r.estado === 'pasada').length;
      setFiltro(n ? 'pasadas' : 'todas');
      notify?.(`Revisión lista: ${n} etapas ya pasaron y no tienen factura ni orden de compra.`, n ? 'info' : 'success');
    }catch(err){ console.error(err); setError(mensajeError(err)); }
    finally{ setFase(''); }
  }

  function generar(x, tipo){
    const sm = Number(String(smmlv).replace(/\D/g, '')) || 0;
    const datos = borradorDeCobro(x, { smmlv: sm, clientes, etiquetaEtapa, fmtMonto });
    if(tipo === 'orden') onAbrirBorradorOrdenCompra?.(datos); else onAbrirBorradorFactura?.(datos);
    notify?.('Se abrió el borrador de ' + (tipo === 'orden' ? 'la orden de compra' : 'la factura') + ' de la etapa «' + etiquetaEtapa(x.etapa) + '». Revíselo y presione «Guardar cambios»: hasta ahí no se crea nada.' + (sm ? '' : ' Falta el valor: escriba el salario mínimo arriba para que lo calcule, o digítelo en el borrador.'), 'info');
  }
  function guardarSmmlv(v){ setSmmlv(v); try{ localStorage.setItem(CLAVE_SMMLV, v); }catch(e){} }

  const filas = pendientes.filter(x => {
    const r = resultados ? resultados[x.clave] : null;
    if(filtro === 'todas') return true;
    if(!r) return false;
    if(filtro === 'pasadas') return r.estado === 'pasada';
    if(filtro === 'sin') return r.estado === 'sin-evidencia';
    if(filtro === 'manual') return r.estado === 'manual' || r.estado === 'sin-proceso';
    return true;
  });
  const cuenta = k => (resultados ? Object.values(resultados).filter(r => k === 'manual' ? (r.estado === 'manual' || r.estado === 'sin-proceso') : r.estado === k).length : 0);
  const CHIPS = [['pasadas', 'Ya pasaron (por cobrar)', 'pasada'], ['sin', 'Sin evidencia todavía', 'sin-evidencia'], ['manual', 'Para revisar a mano', 'manual'], ['todas', 'Todas', null]];

  return (
    <div className="panel">
      <div className="panel-head"><h3>Etapas por cobrar</h3></div>
      <p className="save-hint" style={{ margin: '0 0 12px' }}>
        Revisa las <strong>formas de pago</strong>: toma cada etapa que todavía <strong>no tiene factura ni orden de compra</strong> y mira en el proceso (actuaciones de la Rama, Histórico y, para la entrega del poder, el correo del cliente) si esa etapa <strong>ya pasó</strong>.
        {admin ? ' Desde aquí se abre el borrador de la orden de compra o de la factura. ' : ' La orden de compra o la factura se generan en Administración → Etapas por cobrar. '}
        Es una pista con su evidencia: <strong>no marca «cumplida» ni factura sola</strong>.
      </p>
      {deMensuales > 0 && <p className="rama-res-suave" style={{ margin: '0 0 8px' }}>No se incluyen los procesos del contrato <strong>{CONTRATOS_MENSUALES.join(', ')}</strong> ({deMensuales} etapas): ese contrato se cobra <strong>mensualmente</strong> y sus etapas ya van incluidas en la mensualidad.</p>}
      <div className="rama-fechas" style={{ marginBottom: 10 }}>
        <button type="button" className="btn-primary rama-btn" onClick={revisar} disabled={!!fase || !pendientes.length}>
          {fase === 'correos' ? 'Leyendo los correos del poder…' : fase === 'rama' ? `Revisando los procesos… ${progreso.hecho} de ${progreso.total}` : 'Revisar etapas'}
        </button>
        {fase === 'rama' && <button type="button" className="btn-secondary rama-btn" onClick={() => { cancelar.current = true; }}>Cancelar y ver lo que lleva</button>}
        <span className="save-hint">{pendientes.length} etapas sin factura ni orden de compra en {new Set(conProceso.map(x => x.proceso.id)).size} procesos{pendientes.length > conProceso.length ? ` · ${pendientes.length - conProceso.length} sin proceso con ese contrato` : ''}</span>
        {admin && <label style={{ marginLeft: 'auto' }}>Salario mínimo ($) <input type="text" inputMode="numeric" value={smmlv} onChange={e => guardarSmmlv(e.target.value)} placeholder="para calcular el valor" style={{ width: 150 }} /></label>}
      </div>
      {fase === 'rama' && progreso.total > 0 && <div className="cob-barra" role="progressbar" aria-valuemin={0} aria-valuemax={progreso.total} aria-valuenow={progreso.hecho}><span style={{ width: Math.round(progreso.hecho / progreso.total * 100) + '%' }} /></div>}
      {error && <div className="rama-error" role="alert" style={{ marginTop: 10 }}><strong>Atención.</strong> {error}</div>}
      {!pendientes.length && <div className="empty-state" style={{ marginTop: 12 }}>Todas las etapas de las formas de pago ya tienen factura u orden de compra.</div>}
      {resultados && (
        <>
          <div className="rama-chips" role="group" aria-label="Filtrar las etapas" style={{ margin: '12px 0 8px' }}>
            {CHIPS.map(([id, nombre, k]) => <button key={id} type="button" className={'rama-chip' + (filtro === id ? ' activo' : '')} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{nombre} <span>{k ? cuenta(k) : pendientes.length}</span></button>)}
          </div>
          {filas.length === 0 ? <div className="empty-state empty-state-compact">No hay etapas en esta vista.</div> : (
            <div className="table-wrap"><table className="rama-tabla"><thead><tr><th>Proceso</th><th>Contrato</th><th>Etapa</th><th className="rama-num">Salarios</th><th>Qué se encontró</th><th></th></tr></thead>
              <tbody>{filas.map(x => {
                const r = resultados[x.clave] || {};
                return (
                  <tr key={x.clave} className={r.estado === 'pasada' ? 'rama-importante' : ''}>
                    <td>{x.proceso
                      ? <button type="button" className="celda-enlace" onClick={() => onAbrirProceso?.(x.proceso.id)} title="Abrir este proceso"><strong>{x.proceso.Radicado}</strong><br /><span className="rama-res-suave">{x.proceso.Cliente || ''}</span></button>
                      : <span className="rama-res-suave">sin proceso con este contrato</span>}</td>
                    <td className="rama-nota">{(() => {
                      const link = x.proceso && x.proceso.LinkContrato ? (typeof x.proceso.LinkContrato === 'object' ? (x.proceso.LinkContrato.Url || '') : String(x.proceso.LinkContrato)) : '';
                      const nombre = x.fp.Contrato || '(sin número de contrato)';
                      if(link) return <a className="celda-enlace" href={link} target="_blank" rel="noopener noreferrer" title="Abrir el contrato (el documento)">{nombre}</a>;
                      if(x.proceso) return <button type="button" className="celda-enlace" onClick={() => onAbrirProceso?.(x.proceso.id)} title="Este proceso no tiene el documento del contrato vinculado: abra el proceso para buscarlo y vincularlo">{nombre}</button>;
                      return <span>{nombre}</span>;
                    })()}</td>
                    <td><button type="button" className="celda-enlace" onClick={() => onAbrirFormaPago?.(x.fp.id)} title="Abrir la forma de pago de este contrato (etapas, valores y facturas)"><strong>{etiquetaEtapa(x.etapa)}</strong></button>{x.cumplidaMarcada && <><br /><span className="badge badge-verde">ya marcada «cumplida»</span></>}</td>
                    <td className="rama-num">{x.salarios ? String(x.salarios).replace('.', ',') : '—'}</td>
                    <td>
                      {r.estado === 'pasada' && <><span className="badge badge-verde">Ya pasó</span> <strong>{r.nombre}</strong><br /><span className="rama-res-suave">{r.evidencia.origen}{r.evidencia.fecha ? ' · ' + dma(r.evidencia.fecha) : ''}: «{r.evidencia.texto}»</span></>}
                      {r.estado === 'sin-evidencia' && <><span className="badge badge-gris">Sin evidencia todavía</span><br /><span className="rama-res-suave">Se busca: {r.nombre}</span></>}
                      {(r.estado === 'manual') && <><span className="badge badge-gris">A mano</span><br /><span className="rama-res-suave">Esta etapa no se puede detectar sola.</span></>}
                      {r.estado === 'sin-proceso' && <span className="badge badge-gris">Sin proceso</span>}
                      {(() => { const v = validaciones[claveValidacionCobro(x.fp.Contrato, x.etapa)]; return v ? <div style={{ marginTop: 6 }}><span className="badge badge-verde">Validada por {v.certificadoPor || 'el abogado'}</span><br /><span className="rama-res-suave">{String(v.fecha || '').split('-').reverse().join('-')} · pieza: {v.pieza && v.pieza.webUrl ? <a href={v.pieza.webUrl} target="_blank" rel="noopener noreferrer">{v.pieza.nombre}</a> : (v.pieza && v.pieza.nombre)}</span></div> : null; })()}
                    </td>
                    <td className="rama-acc">
                      {canWrite && x.proceso && <button type="button" className="rama-btn rama-btn--hist" onClick={() => setValidando({ item: x, resultado: r })} title="Busque en la carpeta del proceso la pieza que demuestra la etapa, certifique que ya pasó y cree el pendiente de solicitar la orden de compra">{validaciones[claveValidacionCobro(x.fp.Contrato, x.etapa)] ? 'Volver a validar' : 'Validar la etapa'}</button>}
                      {admin && canWrite && x.proceso && (r.estado === 'pasada' || r.estado === 'manual' || validaciones[claveValidacionCobro(x.fp.Contrato, x.etapa)]) && <>
                        <button type="button" className="rama-btn rama-btn--crear" onClick={() => generar(x, 'orden')} title="Abre el borrador de la orden de compra de esta etapa; no guarda nada hasta «Guardar cambios»">Orden de compra</button>
                        <button type="button" className="rama-btn rama-btn--crear" onClick={() => generar(x, 'factura')} title="Abre el borrador de la factura de esta etapa; no guarda nada hasta «Guardar cambios»">Factura</button>
                      </>}
                    </td>
                  </tr>
                );
              })}</tbody></table></div>
          )}
        </>
      )}
      {validando && <ValidarEtapaModal liveMode={liveMode} item={validando.item} resultado={validando.resultado} config={config} miNombre={miNombre} pendientes={pendientesDelPortal} onCrearPendiente={onCrearPendiente} notify={notify} onGuardado={v => setValidaciones(prev => ({ ...prev, [claveValidacionCobro(v.contrato, v.etapa)]: v }))} onCerrar={() => setValidando(null)} />}
    </div>
  );
}
