import { useMemo, useRef, useState } from 'react';
import { leerInformesRDL, mensajeError } from '../lib/graph';
import { CORREO_GERENCIA_ACCESO } from '../lib/solicitudAccesoExpediente';
import { consultarRama, numerosDelProceso, radicadosDelProceso } from '../lib/ramaJudicial';
import { leerArchivoVigilancia } from '../lib/revisionProcesos';
import { parsearInformeRDL, compararCobertura, rangoDelMes, c21De } from '../lib/coberturaRDL';
import { generarExcelCobertura } from '../lib/coberturaRDLExcel';
import { hoyISO } from '../lib/ramaResumen';
import { IconTextButton } from './IconButton';

// «Cobertura RDL» (Informes → Herramientas, 2026-11-27): compara los informes diarios que manda RDL (vigilancia judicial, cobra por proceso cada mes) con lo que dice la Rama de cada proceso vigente.
// Reglas acordadas: periodo = el mes en curso; «no reportó» = pasaron 2 días hábiles desde la actuación; cuentan solo las actuaciones importantes. Solo lee (correo y Rama): no cambia nada.
const dma = f => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : '—'; };
const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const c21sDe = p => radicadosDelProceso(p).map(c21De).filter(Boolean);
const principalC21 = p => c21De(numerosDelProceso(p).principal);

function Tabla({ titulo, ayuda, filas, columnas, vacio, abierta = false }){
  const [ver, setVer] = useState(abierta);
  return (
    <section className="rama-seccion cob-seccion">
      <button type="button" className="cob-cab" onClick={() => setVer(v => !v)} aria-expanded={ver}>
        <strong>{titulo}</strong> <span className={'badge ' + (filas.length ? 'badge-naranja' : 'badge-verde')}>{filas.length}</span>
        <span className="cob-mas">{ver ? 'ocultar' : 'ver'}</span>
      </button>
      {ayuda && <p className="rama-res-suave" style={{ margin: '2px 0 6px' }}>{ayuda}</p>}
      {ver && (filas.length === 0 ? <div className="empty-state empty-state-compact">{vacio}</div> : (
        <div className="table-wrap"><table className="rama-tabla"><thead><tr>{columnas.map(c => <th key={c.t} className={c.der ? 'rama-num' : ''}>{c.t}</th>)}</tr></thead>
          <tbody>{filas.slice(0, 300).map((f, i) => <tr key={i}>{columnas.map(c => <td key={c.t} className={c.der ? 'rama-num' : ''}>{c.v(f)}</td>)}</tr>)}</tbody></table>
          {filas.length > 300 && <p className="rama-res-suave">Se muestran las primeras 300; el Excel trae todas.</p>}
        </div>
      ))}
    </section>
  );
}
const enlaceDrive = u => u ? <a href={u} target="_blank" rel="noopener noreferrer">Abrir carpeta de RDL</a> : '—';

export default function CoberturaRDLTab({ procesos, config, notify, liveMode }){
  const hoy = hoyISO();
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [buzon, setBuzon] = useState(CORREO_GERENCIA_ACCESO || 'gerencia@lexaraabogados.com');
  const [archivo, setArchivo] = useState(null);
  const [filasExcel, setFilasExcel] = useState(null);
  const [fase, setFase] = useState('');
  const [progreso, setProgreso] = useState({ hecho: 0, total: 0 });
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [aviso, setAviso] = useState('');
  const [generando, setGenerando] = useState(false);
  const cancelar = useRef(false);
  const url = config?.RAMA_JUDICIAL_URL;
  const ocupado = !!fase;
  const vigentes = useMemo(() => (procesos || []).filter(p => String(p.EstadoVT || '').trim().toUpperCase() === 'VIGENTE'), [procesos]);

  async function subirExcel(e){
    const f = e.target.files?.[0]; if(!f) return;
    try{ const filas = await leerArchivoVigilancia(f); setArchivo(f.name); setFilasExcel(filas); notify?.(`Excel de RDL leído: ${filas.length} procesos.`, 'success'); }
    catch(err){ notify?.('No se pudo leer el Excel: ' + mensajeError(err), 'error'); }
    e.target.value = '';
  }

  async function comparar(){
    setError(''); setResultado(null); setAviso(''); cancelar.current = false;
    const [anio, m] = mes.split('-').map(Number);
    const rango = rangoDelMes(anio, m, hoy);
    try{
      // 1) Informes diarios de RDL del periodo
      setFase('correos');
      let crudos = [];
      if(liveMode) crudos = await leerInformesRDL(buzon, rango.ini);
      else notify?.('Modo demo: no hay buzón real; se usan datos de ejemplo.', 'info');
      const informes = crudos.filter(i => i.recibido >= rango.ini).map(i => ({ recibido: i.recibido, filas: parsearInformeRDL(i.html, i.recibido) }));
      if(liveMode && !informes.length){ setError(`No encontré informes de RDL en ${buzon} desde ${dma(rango.ini)}. Revise el buzón o el mes.`); setFase(''); return; }

      // 2) Actuaciones de la Rama de cada proceso vigente (de a 4; se puede cancelar)
      setFase('rama');
      const objetivos = []; const vistos = new Set();
      vigentes.forEach(p => { const rad = numerosDelProceso(p).principal; const k = c21De(rad); if(rad.length === 23 && k && !vistos.has(k)){ vistos.add(k); objetivos.push({ k, rad }); } });
      setProgreso({ hecho: 0, total: objetivos.length });
      const mapa = {}; const fallos = []; let indice = 0, hechos = 0;
      if(liveMode && url){
        await Promise.all(Array.from({ length: 4 }, async () => {
          while(indice < objetivos.length && !cancelar.current){
            const o = objetivos[indice++];
            try{ const d = await consultarRama(url, o.rad, { paginas: 1 }); const pr = d.procesos && d.procesos[0]; if(pr) mapa[o.k] = pr.actuaciones || []; else fallos.push(o); }
            catch(e){ fallos.push(o); }
            hechos++; setProgreso({ hecho: hechos, total: objetivos.length });
          }
        }));
      }else{
        // Demo: unas actuaciones de ejemplo para ver la pantalla
        objetivos.slice(0, 3).forEach((o, i) => { mapa[o.k] = [{ fecha: `${rango.ini.slice(0, 8)}0${i + 2}`, actuacion: i === 1 ? 'SENTENCIA' : 'AUTO REQUIERE', anotacion: '' }]; });
      }
      if(cancelar.current){ setAviso('Se canceló la consulta a la Rama antes de terminar: el resultado solo cubre los procesos ya consultados.'); }
      if(fallos.length) setAviso(a => (a ? a + ' ' : '') + `${fallos.length} procesos no se pudieron consultar en la Rama (quedan fuera de la comparación).`);

      // 3) Comparar
      const r = compararCobertura({ informes, procesos, actuacionesRama: mapa, filasExcel, mes: { ini: rango.ini, fin: rango.hasta }, hoy, gracia: 2, c21sProceso: p => { const t = c21sDe(p); const pr = principalC21(p); return pr ? [pr, ...t.filter(x => x !== pr)] : t; } });
      r.rango = rango; setResultado(r);
      notify?.(`Comparación lista: ${r.resumen.noReportadas} actuaciones importantes sin reportar por RDL.`, r.resumen.noReportadas ? 'info' : 'success');
    }catch(err){
      console.error(err); setError(mensajeError(err));
    }finally{ setFase(''); }
  }

  async function descargar(){
    if(!resultado) return;
    setGenerando(true);
    try{ await generarExcelCobertura(`Cobertura RDL ${mes}`, resultado, resultado.rango); }
    finally{ setGenerando(false); }
  }

  const R = resultado;
  const [anioSel, mesSel] = mes.split('-').map(Number);
  return (
    <div className="panel">
      <div className="panel-head"><h3>Cobertura de la vigilancia (RDL)</h3></div>
      <p className="save-hint" style={{ margin: '0 0 12px' }}>
        RDL cobra por proceso cada mes y envía cada día el «Informe de novedades judiciales». Aquí se comparan esos informes con lo que dice la Rama de cada proceso vigente, para saber qué actuaciones importantes <strong>no reportó</strong> (pasados 2 días hábiles), cuáles reportó tarde, a qué procesos cobra sin reportar nada, y cuáles ya terminaron. <strong>Solo lee: no cambia nada del correo ni del portal.</strong>
      </p>
      <div className="rama-fechas" style={{ marginBottom: 10 }}>
        <label>Mes <input type="month" value={mes} onChange={e => setMes(e.target.value)} disabled={ocupado} /></label>
        <label>Buzón de los informes <input type="text" value={buzon} onChange={e => setBuzon(e.target.value)} style={{ minWidth: 250 }} disabled={ocupado} /></label>
        <label className="btn-secondary" style={{ cursor: ocupado ? 'default' : 'pointer' }}>{filasExcel ? 'Cambiar Excel mensual de RDL' : 'Subir Excel mensual de RDL (opcional)'}<input type="file" accept=".xlsx" onChange={subirExcel} disabled={ocupado} style={{ display: 'none' }} /></label>
        {archivo && <span className="save-hint">{archivo}</span>}
      </div>
      <div className="rama-fechas">
        <button type="button" className="btn-primary rama-btn" onClick={comparar} disabled={ocupado}>{fase === 'correos' ? 'Leyendo los informes de RDL…' : fase === 'rama' ? `Consultando la Rama… ${progreso.hecho} de ${progreso.total}` : `Comparar ${NOMBRE_MES[(mesSel || 1) - 1]} ${anioSel || ''}`}</button>
        {fase === 'rama' && <button type="button" className="btn-secondary rama-btn" onClick={() => { cancelar.current = true; }}>Cancelar y ver lo que lleva</button>}
        <span className="save-hint">{vigentes.length} procesos vigentes en el portal · «no reportó» = 2 días hábiles · solo actuaciones importantes</span>
      </div>
      {fase === 'rama' && progreso.total > 0 && <div className="cob-barra" role="progressbar" aria-valuemin={0} aria-valuemax={progreso.total} aria-valuenow={progreso.hecho}><span style={{ width: Math.round(progreso.hecho / progreso.total * 100) + '%' }} /></div>}
      {error && <div className="rama-error" role="alert" style={{ marginTop: 10 }}><strong>No se pudo comparar.</strong> {error}</div>}
      {aviso && <div className="rama-hist-aviso" style={{ marginTop: 10 }}><span>{aviso}</span></div>}

      {R && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '16px 0 10px' }}>
            <span className="badge badge-alerta">{R.resumen.noReportadas} importantes sin reportar</span>
            <span className="badge badge-naranja">{R.resumen.tardias} reportadas tarde</span>
            <span className="badge badge-naranja">{R.resumen.sinNovedadRDL} procesos sin ninguna novedad de RDL</span>
            <span className="badge badge-gris">{R.resumen.cobradosSinNovedad} del Excel sin novedad</span>
            <span className="badge badge-gris">{R.resumen.terminadosQueReporta} terminados que reporta</span>
            <span className="badge badge-gris">{R.resumen.enRdlNoPortal} reportados que no están en el portal</span>
            <span className="badge badge-verde">{R.resumen.reportadas} reportadas a tiempo</span>
          </div>
          <p className="rama-res-suave">{R.resumen.informesLeidos} informes de RDL leídos ({dma(R.rango.ini)} a {dma(R.rango.hasta)}) · {R.resumen.procesosReportadosPorRDL} procesos reportados por RDL · {R.resumen.procesosVigentesComparados} procesos vigentes comparados contra la Rama · {R.resumen.importantesEnRama} actuaciones importantes en la Rama · {R.resumen.enPlazo} dentro del plazo de 2 días hábiles (todavía no cuentan).</p>
          <div style={{ margin: '8px 0 14px' }}><IconTextButton icon="excel" variant="secondary" onClick={descargar} disabled={generando}>{generando ? 'Generando…' : 'Descargar Excel'}</IconTextButton></div>

          <Tabla titulo="Actuaciones importantes que RDL no reportó" abierta ayuda="Están en la Rama, pasaron 2 días hábiles y RDL no las trajo en ningún informe del periodo. Es la evidencia para reclamar el seguimiento."
            filas={R.noReportadas} vacio="RDL reportó todas las actuaciones importantes."
            columnas={[{ t: 'Proceso', v: f => <><strong>{f.proceso.Radicado}</strong><br /><span className="rama-res-suave">{f.proceso.Demandante || ''}</span></> }, { t: 'Fecha', v: f => dma(f.fecha) }, { t: 'Actuación en la Rama', v: f => f.actuacion }, { t: 'Debió reportarla el', v: f => dma(f.limite) }, { t: 'Carpeta de RDL', v: f => enlaceDrive(f.drive) }]} />
          <Tabla titulo="Reportadas tarde" ayuda="RDL sí las reportó, pero pasados más de 2 días hábiles."
            filas={R.tardias} vacio="No hay actuaciones reportadas con retraso."
            columnas={[{ t: 'Proceso', v: f => f.proceso.Radicado }, { t: 'Actuación', v: f => f.actuacion }, { t: 'Fecha', v: f => dma(f.fecha) }, { t: 'La reportó el', v: f => dma(f.recibido) }, { t: 'Días hábiles de retraso', der: true, v: f => f.retraso }]} />
          <Tabla titulo="Procesos con novedades importantes y ninguna novedad de RDL" ayuda="En el mes la Rama muestra actuaciones importantes y RDL no trajo nada de ese proceso: probablemente no lo están vigilando."
            filas={R.sinNovedadRDL} vacio="Todos los procesos con novedades aparecen en los informes de RDL."
            columnas={[{ t: 'Proceso', v: f => <><strong>{f.proceso.Radicado}</strong><br /><span className="rama-res-suave">{f.proceso.Demandante || ''}</span></> }, { t: 'Actuaciones importantes en la Rama', der: true, v: f => f.importantes }]} />
          <Tabla titulo="Procesos del Excel mensual sin ninguna novedad de RDL" ayuda={filasExcel ? 'RDL los incluye en su Excel (los cobra) y no reportó nada de ellos en el mes. La columna dice si la Rama sí tuvo movimiento.' : 'Suba el Excel mensual de RDL para ver esta lista.'}
            filas={R.cobradosSinNovedad} vacio={filasExcel ? 'Todos los procesos del Excel tuvieron alguna novedad.' : 'Falta el Excel mensual de RDL.'}
            columnas={[{ t: 'Radicado', v: f => f.radicado }, { t: 'Consecutivo', v: f => f.consecutivo }, { t: 'Demandante', v: f => f.demandante }, { t: 'Movimiento en la Rama', der: true, v: f => f.movimientoRama == null ? 'no consultado' : f.movimientoRama }]} />
          <Tabla titulo="Terminados en el portal que RDL sigue reportando" ayuda="Si los cobra, hay que pedirle que los saque de la vigilancia."
            filas={R.terminadosQueReporta} vacio="RDL no reportó procesos terminados."
            columnas={[{ t: 'Proceso', v: f => f.proceso.Radicado }, { t: 'Radicado', v: f => f.radicado }, { t: 'Última novedad', v: f => dma(f.ultima) }, { t: 'Carpeta de RDL', v: f => enlaceDrive(f.drive) }]} />
          <Tabla titulo="RDL los reporta y no están en el portal" filas={R.enRdlNoPortal} vacio="Todos los procesos que RDL reportó están en el portal."
            columnas={[{ t: 'Radicado', v: f => f.radicado }, { t: 'Despacho', v: f => f.despacho }, { t: 'Demandante', v: f => f.demandante }, { t: 'Última novedad', v: f => dma(f.ultima) }, { t: 'Carpeta de RDL', v: f => enlaceDrive(f.drive) }]} />
        </>
      )}
    </div>
  );
}
