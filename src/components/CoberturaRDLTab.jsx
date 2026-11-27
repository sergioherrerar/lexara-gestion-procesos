import { useMemo, useRef, useState } from 'react';
import { leerInformesRDL, mensajeError, getAccount, crearBorradorConImagenesInline, firmaComoImagenInline, firmaHtml } from '../lib/graph';
import { construirCorreoRDL, seccionesDelCorreoRDL, CORREO_RDL } from '../lib/correoRDL';
import { refinarRevision } from '../lib/cruceRDL';
import { CORREO_GERENCIA_ACCESO } from '../lib/solicitudAccesoExpediente';
import { consultarRama, numerosDelProceso, radicadosDelProceso } from '../lib/ramaJudicial';
import { leerArchivoVigilancia, compararConProcesos, generarExcelRevisionProcesos } from '../lib/revisionProcesos';
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

export default function CoberturaRDLTab({ procesos, config, notify, liveMode, onAbrirProceso }){
  const hoy = hoyISO();
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [buzon, setBuzon] = useState(CORREO_GERENCIA_ACCESO || 'gerencia@lexaraabogados.com');
  const [archivo, setArchivo] = useState(null);
  const [revision, setRevision] = useState(null);   // Excel mensual de RDL contra el portal (las 3 diferencias de la antigua «Revisión de Procesos»)
  const [generandoRev, setGenerandoRev] = useState(false);
  const [incluir, setIncluir] = useState(null);   // casillas del correo a RDL: { id: bool } (se inicializan al terminar la comparación)
  const [notaRDL, setNotaRDL] = useState('');
  const [adjuntarExcel, setAdjuntarExcel] = useState(true);
  const [creandoCorreo, setCreandoCorreo] = useState(false);
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
    try{
      const filas = await leerArchivoVigilancia(f); setArchivo(f.name); setFilasExcel(filas);
      const rev = refinarRevision(compararConProcesos(filas, procesos), procesos); setRevision(rev);   // al instante, sin correo ni Rama; con las reglas de Daniel (fuera del portal), ignorados y cruce por otros datos
      notify?.(`Excel de RDL leído: ${filas.length} procesos. Diferencias con el portal: ${rev.noEncontrados.length + rev.terminados.length + rev.faltantesEnArchivo.length}${rev.diferencias.length ? ' · ' + rev.diferencias.length + ' son el mismo proceso con datos distintos' : ''}${rev.fueraDelPortal.length ? ' · ' + rev.fueraDelPortal.length + ' son de seguimiento fuera del portal (no cuentan)' : ''}.`, 'success');
    }
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
        await Promise.all(Array.from({ length: 3 }, async () => {
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
      { const ini = {}; seccionesDelCorreoRDL(r, revision, ((revision && revision.diferencias) || []).length + (r.diferencias || []).length).forEach(s => { ini[s.id] = s.n > 0; }); setIncluir(ini); }
      notify?.(`Comparación lista: ${r.resumen.noReportadas} actuaciones importantes sin reportar por RDL.`, r.resumen.noReportadas ? 'info' : 'success');
    }catch(err){
      console.error(err); setError(mensajeError(err));
    }finally{ setFase(''); }
  }

  async function descargarRevision(){
    if(!revision) return;
    setGenerandoRev(true);
    try{ await generarExcelRevisionProcesos(`Revisión de Procesos ${new Date().toISOString().slice(0, 10)}`, revision, filasExcel, procesos); }
    finally{ setGenerandoRev(false); }
  }
  // ¿RDL cobra este proceso? (está en su Excel mensual)
  const enExcel = useMemo(() => new Set((filasExcel || []).map(f => c21De(f.radicado)).filter(Boolean)), [filasExcel]);
  const cobra = p => !filasExcel ? '—' : (c21sDe(p).some(k => enExcel.has(k)) ? 'Sí' : 'No está en su Excel');
  const abrir = p => onAbrirProceso ? <button type="button" className="celda-enlace" onClick={() => onAbrirProceso(p.id)} title="Abrir este proceso"><strong>{p.Radicado}</strong></button> : <strong>{p.Radicado}</strong>;
  // En las listas del Excel mensual, si el proceso existe en el portal (terminados y vigentes sin incluir), su radicado es un enlace que lo abre.
  const procDeFila = f => (procesos || []).find(p => p.Radicado && (p.Radicado === f.lexara || p.Radicado === f.consecutivo)) || null;
  const celdaRad = f => { const p = onAbrirProceso ? procDeFila(f) : null; return p ? <button type="button" className="celda-enlace" onClick={() => onAbrirProceso(p.id)} title="Abrir este proceso">{f.radicado}</button> : f.radicado; };
  const colsRevAbrir = [{ t: 'Radicado', v: celdaRad }, { t: 'Consecutivo', v: f => f.consecutivo }, { t: 'Demandante', v: f => f.demandante }, { t: 'Demandado', v: f => f.demandado }, { t: 'Apoderado', v: f => f.apoderado }, { t: 'Portal Lexara', v: f => f.lexara }];
  // Lo que no es novedad (seguimiento fuera del portal de Daniel) y lo que es el mismo proceso con datos distintos: del Excel mensual y de los informes diarios juntos
  const diferenciasTodas = [...((revision && revision.diferencias) || []), ...((resultado && resultado.diferencias) || [])];
  const fueraTodas = [...((revision && revision.fueraDelPortal) || []), ...((resultado && resultado.fueraDelPortal) || [])];
  const ignoradosTotal = ((revision && revision.ignorados) || 0) + ((resultado && resultado.ignorados) || 0);
  const colsRev = [{ t: 'Radicado', v: f => f.radicado }, { t: 'Consecutivo', v: f => f.consecutivo }, { t: 'Demandante', v: f => f.demandante }, { t: 'Demandado', v: f => f.demandado }, { t: 'Apoderado', v: f => f.apoderado }, { t: 'Portal Lexara', v: f => f.lexara }];

  // Borrador de correo para RDL con lo bueno y lo que hay que mejorar (queda en los Borradores de Soporte con copia a Gerencia; nunca se envía solo).
  async function crearCorreoParaRDL(){
    if(!resultado || !incluir) return;
    if(!getAccount()){ notify?.('El borrador se crea en el Outlook de Soporte al iniciar sesión con Microsoft; en el modo demo no hay buzón.', 'info'); return; }
    setCreandoCorreo(true);
    try{
      const adjuntos = [];
      if(adjuntarExcel){ try{ adjuntos.push(await generarExcelCobertura(`Vigilancia RDL ${mes}`, resultado, resultado.rango, revision ? { revision } : null, { devolver: true })); }catch(e){ console.error(e); notify?.('No se pudo preparar el Excel para adjuntarlo: ' + mensajeError(e), 'info'); } }
      const cuerpo = construirCorreoRDL({ r: resultado, revision, mes, incluir, nota: notaRDL, hayExcelAdjunto: adjuntos.length > 0, diferencias: diferenciasTodas });
      const firma = await firmaComoImagenInline('soporte').catch(() => null);
      const html = cuerpo.html + (firma ? firmaHtml('soporte', 'cid:' + firma.cid) : '') + '</body></html>';
      const r = await crearBorradorConImagenesInline({ to: [CORREO_RDL], cc: [CORREO_GERENCIA_ACCESO], subject: cuerpo.asunto, htmlBody: html, imagenes: firma ? [firma] : [], adjuntos, categorias: ['Vigilancia RDL (borrador)'], buzon: 'soporte@lexaraabogados.com', caerAlBuzonPropio: true });
      notify?.(r.enBuzonPropio
        ? '⚠ Creé el correo para RDL en TUS Borradores (Microsoft no encontró el buzón de Soporte). Revíselo y envíelo.'
        : '✓ Borrador del correo para RDL creado en los Borradores de Soporte, para ' + CORREO_RDL + ' con copia a Gerencia' + (adjuntos.length ? ' y con el Excel adjunto' : '') + '. Revíselo y envíelo: no se envía solo.', r.enBuzonPropio ? 'info' : 'success');
    }catch(err){ console.error(err); notify?.('No se pudo crear el correo para RDL: ' + mensajeError(err), 'error'); }
    finally{ setCreandoCorreo(false); }
  }

  async function descargar(){
    if(!resultado) return;
    setGenerando(true);
    try{ await generarExcelCobertura(`Vigilancia RDL ${mes}`, resultado, resultado.rango, revision ? { revision } : null); }
    finally{ setGenerando(false); }
  }

  const R = resultado;
  const [anioSel, mesSel] = mes.split('-').map(Number);
  return (
    <div className="panel">
      <div className="panel-head"><h3>Vigilancia RDL</h3></div>
      <p className="save-hint" style={{ margin: '0 0 12px' }}>
        RDL cobra por proceso cada mes y envía cada día el «Informe de novedades judiciales». Aquí se revisa en dos pasos, en la misma pantalla: <strong>1) El Excel mensual de RDL</strong> (lo que ellos dicen vigilar y cobrar) contra el portal: qué procesos no están en el portal, cuáles figuran terminados y siguen cobrando, y qué procesos vigentes no incluyeron. <strong>2) Los informes diarios + la Rama</strong>: qué actuaciones importantes no reportaron (pasados 2 días hábiles), cuáles reportaron tarde, a qué procesos cobran sin reportar nada y cuáles ya terminaron. <strong>Solo lee: no cambia nada del correo ni del portal.</strong>
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

      {revision && (
        <section className="cob-bloque">
          <h4 style={{ margin: '18px 0 6px' }}>1) Excel mensual de RDL contra el portal</h4>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="badge badge-alerta">{revision.noEncontrados.length} no están en el portal</span>
            <span className="badge badge-naranja">{revision.terminados.length} terminados en el portal que RDL cobra</span>
            <span className="badge badge-gris">{revision.faltantesEnArchivo.length} vigentes del portal que RDL no incluyó</span>
          </div>
          <div style={{ marginBottom: 6 }}><IconTextButton icon="excel" variant="secondary" onClick={descargarRevision} disabled={generandoRev}>{generandoRev ? 'Generando…' : 'Descargar Excel de esta revisión'}</IconTextButton></div>
          <Tabla titulo="Procesos del Excel de RDL que NO están en el portal" ayuda="RDL los vigila (y los cobra) y en el portal no existen: o falta crearlos aquí, o RDL tiene procesos que no son nuestros." filas={revision.noEncontrados} vacio="Todos los procesos del Excel están en el portal." columnas={colsRev} />
          <Tabla titulo="Terminados en el portal que RDL sigue reportando y cobrando" ayuda="Hay que pedirle a RDL que los saque de la vigilancia." filas={revision.terminados} vacio="RDL no tiene procesos terminados en su lista." columnas={colsRevAbrir} />
          <Tabla titulo="Vigentes del portal que RDL NO incluyó en su Excel" ayuda="Procesos activos que RDL no está vigilando: ahí no habrá informes diarios." filas={revision.faltantesEnArchivo} vacio="RDL incluyó todos los procesos vigentes del portal." columnas={colsRevAbrir} />
        </section>
      )}

      {R && <h4 style={{ margin: '22px 0 6px' }}>2) Informes diarios de RDL contra la Rama ({NOMBRE_MES[(mesSel || 1) - 1]} {anioSel})</h4>}
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
            columnas={[{ t: 'Proceso', v: f => <>{abrir(f.proceso)}<br /><span className="rama-res-suave">{f.proceso.Demandante || ''}</span></> }, { t: 'Fecha', v: f => dma(f.fecha) }, { t: 'Actuación en la Rama', v: f => f.actuacion }, { t: 'Debió reportarla el', v: f => dma(f.limite) }, { t: '¿RDL lo cobra? (su Excel)', v: f => cobra(f.proceso) }, { t: 'Carpeta de RDL', v: f => enlaceDrive(f.drive) }]} />
          <Tabla titulo="Reportadas tarde" ayuda="RDL sí las reportó, pero pasados más de 2 días hábiles."
            filas={R.tardias} vacio="No hay actuaciones reportadas con retraso."
            columnas={[{ t: 'Proceso', v: f => abrir(f.proceso) }, { t: 'Actuación', v: f => f.actuacion }, { t: 'Fecha', v: f => dma(f.fecha) }, { t: 'La reportó el', v: f => dma(f.recibido) }, { t: 'Días hábiles de retraso', der: true, v: f => f.retraso }]} />
          <Tabla titulo="Procesos con novedades importantes y ninguna novedad de RDL" ayuda="En el mes la Rama muestra actuaciones importantes y RDL no trajo nada de ese proceso: probablemente no lo están vigilando."
            filas={R.sinNovedadRDL} vacio="Todos los procesos con novedades aparecen en los informes de RDL."
            columnas={[{ t: 'Proceso', v: f => <>{abrir(f.proceso)}<br /><span className="rama-res-suave">{f.proceso.Demandante || ''}</span></> }, { t: 'Actuaciones importantes en la Rama', der: true, v: f => f.importantes }]} />
          <Tabla titulo="Procesos del Excel mensual sin ninguna novedad de RDL" ayuda={filasExcel ? 'RDL los incluye en su Excel (los cobra) y no reportó nada de ellos en el mes. La columna dice si la Rama sí tuvo movimiento.' : 'Suba el Excel mensual de RDL para ver esta lista.'}
            filas={R.cobradosSinNovedad} vacio={filasExcel ? 'Todos los procesos del Excel tuvieron alguna novedad.' : 'Falta el Excel mensual de RDL.'}
            columnas={[{ t: 'Radicado', v: f => f.radicado }, { t: 'Consecutivo', v: f => f.consecutivo }, { t: 'Demandante', v: f => f.demandante }, { t: 'Movimiento en la Rama', der: true, v: f => f.movimientoRama == null ? 'no consultado' : f.movimientoRama }]} />
          <Tabla titulo="Terminados en el portal que RDL sigue reportando" ayuda="Si los cobra, hay que pedirle que los saque de la vigilancia."
            filas={R.terminadosQueReporta} vacio="RDL no reportó procesos terminados."
            columnas={[{ t: 'Proceso', v: f => abrir(f.proceso) }, { t: 'Radicado', v: f => onAbrirProceso && f.proceso ? <button type="button" className="celda-enlace" onClick={() => onAbrirProceso(f.proceso.id)} title="Abrir este proceso">{f.radicado}</button> : f.radicado }, { t: 'Última novedad', v: f => dma(f.ultima) }, { t: 'Carpeta de RDL', v: f => enlaceDrive(f.drive) }]} />
          <Tabla titulo="RDL los reporta y no están en el portal" filas={R.enRdlNoPortal} vacio="Todos los procesos que RDL reportó están en el portal."
            columnas={[{ t: 'Radicado', v: f => f.radicado }, { t: 'Despacho', v: f => f.despacho }, { t: 'Demandante', v: f => f.demandante }, { t: 'Última novedad', v: f => dma(f.ultima) }, { t: 'Carpeta de RDL', v: f => enlaceDrive(f.drive) }]} />
          {(diferenciasTodas.length > 0 || fueraTodas.length > 0 || ignoradosTotal > 0) && (
            <section className="cob-bloque" style={{ marginTop: 22 }}>
              <h4 style={{ margin: '0 0 6px' }}>Lo que NO es novedad y los datos por corregir</h4>
              <Tabla titulo="Mismo proceso con datos distintos (para corregir)" ayuda="El portal cruzó estos procesos por el número corto y las partes: son el mismo proceso, pero el radicado no coincide. Hay que corregir el dato en el portal o pedirle a RDL que lo corrija (queda en el correo a RDL)."
                filas={diferenciasTodas} vacio="No hay procesos con datos distintos."
                columnas={[{ t: 'Origen', v: f => f.origen }, { t: 'Radicado de RDL', v: f => f.fila.radicado }, { t: 'Proceso en el portal', v: f => onAbrirProceso ? <button type="button" className="celda-enlace" onClick={() => onAbrirProceso(f.proceso.id)} title="Abrir este proceso"><strong>{f.proceso.Radicado}</strong><br /><span className="rama-res-suave">{f.proceso.Cliente || ''}</span></button> : <strong>{f.proceso.Radicado}</strong> }, { t: 'Radicado del portal', v: f => f.proceso.NoCompleto || '—' }, { t: 'Diferencia', v: f => f.diferencias.length ? f.diferencias.map(d => d.campo).join(', ') : 'Solo coincidieron por el número corto y las partes' }]} />
              <Tabla titulo="Seguimiento fuera del portal (apoderado Daniel): no son novedades" ayuda="RDL los vigila y Lexara les hace seguimiento, pero fuera del portal: se tienen en cuenta y no se marcan como «no están en el portal»."
                filas={fueraTodas} vacio="No hay procesos de seguimiento fuera del portal."
                columnas={[{ t: 'Origen', v: f => f.origen }, { t: 'Radicado', v: f => f.radicado }, { t: 'Demandante', v: f => f.demandante }, { t: 'Demandado', v: f => f.demandado }, { t: 'Apoderado', v: f => f.apoderado }]} />
              {ignoradosTotal > 0 && <p className="rama-res-suave" style={{ margin: '4px 0' }}>{ignoradosTotal} {ignoradosTotal === 1 ? 'proceso se dejó' : 'procesos se dejaron'} por fuera de las novedades (Supersociedades 76534 y 39696).</p>}
            </section>
          )}
          {incluir && (
            <section className="cob-bloque" style={{ marginTop: 22 }}>
              <h4 style={{ margin: '0 0 6px' }}>3) Informar a RDL</h4>
              <p className="rama-res-suave" style={{ margin: '0 0 8px' }}>Arma un <strong>borrador de correo para RDL</strong> con lo que va bien y lo que hay que mejorar. Marque lo que quiere incluir; queda en los Borradores de Soporte, con copia a Gerencia, para que lo revise: <strong>no se envía solo</strong>.</p>
              <div className="cob-checks">
                {seccionesDelCorreoRDL(R, revision, diferenciasTodas.length).map(s => (
                  <label key={s.id} className={'cob-check' + (s.n === 0 ? ' cob-check--vacio' : '')}>
                    <input type="checkbox" checked={!!incluir[s.id]} disabled={s.n === 0} onChange={e => setIncluir(prev => ({ ...prev, [s.id]: e.target.checked }))} />
                    <span><strong className={s.tipo === 'bueno' ? 'cob-bueno' : ''}>{s.tipo === 'bueno' ? '✓ ' : ''}{s.nombre}</strong> <span className="rama-res-suave">({s.id === 'bueno' ? 'reconocimiento' : s.n})</span></span>
                  </label>
                ))}
                <label className="cob-check"><input type="checkbox" checked={adjuntarExcel} onChange={e => setAdjuntarExcel(e.target.checked)} /><span>Adjuntar el Excel con el detalle completo</span></label>
              </div>
              <label style={{ display: 'block', marginTop: 8 }}>Nota adicional (opcional)<textarea rows={2} value={notaRDL} onChange={e => setNotaRDL(e.target.value)} placeholder="Algo más que quiera decirle a RDL" style={{ width: '100%' }} /></label>
              <div style={{ marginTop: 10 }}><button type="button" className="btn-primary rama-btn" onClick={crearCorreoParaRDL} disabled={creandoCorreo || !Object.values(incluir).some(Boolean)}>{creandoCorreo ? 'Creando borrador…' : 'Crear borrador de correo para RDL'}</button></div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
