import { useMemo, useState } from 'react';
import { leerCorreosBandeja, leerCuerpoCorreo, mensajeError } from '../lib/graph';
import { ModalCrearDesdeRama, Ico } from './RamaJudicialTab';
import { CORREO_GERENCIA_ACCESO } from '../lib/solicitudAccesoExpediente';
import { clasificarCorreo, procesosDeCorreo, radicadosEnTexto, audienciaRegistrada, TIPOS_CORREO } from '../lib/ramaResumen';

// «Correo de despachos» (2026-11-24, fase 1 de las novedades por correo): los despachos escriben al correo de la apoderada y una regla de Hotmail reenvía todo lo de
// @cendoj.ramajudicial.gov.co a Gerencia. Aquí se LEE esa bandeja (solo lectura: no marca como leído, no mueve ni borra), se identifica de qué proceso del portal habla
// cada correo y de qué clase es (auto, audiencia, traslado…). Todavía no crea nada en el portal: es para comprobar que la lectura y el cruce funcionan.
function hoyMenos(dias){ const d = new Date(); d.setDate(d.getDate() - dias); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function fechaHora(iso){
  if(!iso) return '';
  try{ return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); }catch(e){ return String(iso).slice(0, 16); }
}
function dma(iso){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; }
const COLOR_TIPO = { audiencia: 'naranja', desistimiento: 'naranja', sentencia: 'rojo', traslado: 'naranja', auto: 'verde', oficio: 'verde', notificacion: 'gris', acuse: 'gris', otro: 'gris' };

function esDeDespacho(m, radicados){
  return /ramajudicial|cendoj/i.test(m.remitente + ' ' + m.resumen) || radicados.c21.length > 0 || /^(juzgado|tribunal|oficina|secretar|sala|corte|centro de servicios)/i.test(m.remitenteNombre || '');
}

// Ejemplo para el modo demo (no hay buzón): tres correos inventados con radicados de los procesos de ejemplo.
function ejemploDemo(){
  const ahora = new Date().toISOString();
  return [
    { id: 'demo-1', asunto: 'PROCESO: 05001233300020240030000 AUDIENCIA DESPACHO: Tribunal Administrativo de Ejemplo', remitente: 'secretaria@cendoj.ramajudicial.gov.co', remitenteNombre: 'Tribunal Administrativo de Ejemplo', fecha: ahora, resumen: 'Se fija audiencia inicial para el 15 de diciembre de 2026 a las 9:30 a. m. de manera virtual por Microsoft Teams.', tieneAdjuntos: true, leido: false, enlace: '' },
    { id: 'demo-2', asunto: '*NOTIFICACION* AUTO REQUIERE 11001310500820240010000', remitente: 'j08lctobta@cendoj.ramajudicial.gov.co', remitenteNombre: 'Juzgado 08 Laboral del Circuito', fecha: ahora, resumen: 'Se corre traslado por el término de 3 días hábiles.', tieneAdjuntos: true, leido: false, enlace: '' },
    { id: 'demo-3', asunto: 'Acuse de recibo de radicación de memorial', remitente: 'notificaciones@samai.consejodeestado.gov.co', remitenteNombre: 'Notificaciones SAMAI', fecha: ahora, resumen: 'Acuse de recibo de radicación de memorial.', tieneAdjuntos: false, leido: true, enlace: '' },
  ];
}

// Fecha (yyyy-mm-dd) en hora de Bogotá de un instante ISO.
function isoBogota(iso){
  try{ const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); return p; }catch(e){ return String(iso || '').slice(0, 10); }
}

export default function CorreosDespachosTab({ procesos, liveMode, notify, canWrite, tiposAccion, colaboradores, audiencias, terminos, onCrearAudiencia, onCrearTermino, onCreateTipoTermino }){
  const [buzon, setBuzon] = useState(CORREO_GERENCIA_ACCESO || 'gerencia@lexaraabogados.com');
  const [desde, setDesde] = useState(hoyMenos(7));
  const [mensajes, setMensajes] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('despachos');
  const [cuerpos, setCuerpos] = useState({});   // id del correo -> texto completo (solo de los correos de despachos; la vista previa trae 255 caracteres)
  const [crear, setCrear] = useState(null);   // { tipo, proceso, act, inicial, origen:'correo' }: ventana de crear audiencia/término
  const puedeCrear = !!(canWrite && onCrearAudiencia && onCrearTermino);

  async function leer(){
    setCargando(true); setError('');
    try{
      const lista = liveMode ? await leerCorreosBandeja(buzon, desde) : ejemploDemo();
      setMensajes(lista);
      setCuerpos({});
      if(liveMode){
        // Texto completo solo de los que parecen de un despacho y no son acuses (máx. 40; de a 4 a la vez): ahí viene la fecha de la audiencia o los días del término.
        const candidatos = lista.filter(m => !/^(respuesta automatica|automatic reply|delivered|entregado)/i.test(m.asunto) && esDeDespacho(m, radicadosEnTexto(m.asunto + ' ' + m.resumen))).slice(0, 40);
        (async () => {
          for(let i = 0; i < candidatos.length; i += 4){
            const grupo = candidatos.slice(i, i + 4);
            const textos = await Promise.all(grupo.map(m => leerCuerpoCorreo(buzon, m.id)));
            setCuerpos(prev => { const n = { ...prev }; grupo.forEach((m, k) => { if(textos[k]) n[m.id] = textos[k]; }); return n; });
          }
        })();
      }
      notify?.(liveMode ? `Se leyeron ${lista.length} correos de ${buzon} (solo lectura).` : 'Modo demo: correos de ejemplo (no hay buzón real).', 'success');
    }catch(err){
      console.error(err);
      setError(mensajeError(err));
    }finally{ setCargando(false); }
  }

  const filas = useMemo(() => (mensajes || []).map(m => {
    const completo = m.resumen + ' ' + (cuerpos[m.id] || '');
    const texto = m.asunto + ' ' + completo;
    const rad = radicadosEnTexto(texto);
    const cls = clasificarCorreo(m.asunto, completo, m.remitente + ' ' + m.remitenteNombre);
    return { ...m, rad, cls, procesos: cls.ruido ? [] : procesosDeCorreo(texto, procesos), despacho: esDeDespacho(m, rad), conTexto: !!cuerpos[m.id] };
  }), [mensajes, procesos, cuerpos]);

  function abrirCrear(tipo, f, proceso){
    const recibido = isoBogota(f.fecha);
    const act = { actuacion: f.asunto.replace(/\s+/g, ' ').trim(), fecha: recibido };
    const inicial = tipo === 'audiencias'
      ? { fecha: f.cls.audiencia.fecha, hora: f.cls.audiencia.hora || '', observacion: ('Correo del despacho ' + dma(recibido) + ' · ' + act.actuacion + (f.cls.audiencia.modalidad ? ' — ' + f.cls.audiencia.modalidad : '')).slice(0, 250), textoSugerencia: f.cls.audiencia.tipo || act.actuacion }
      : { fecha: recibido, diasHabiles: f.cls.terminoDias, observacion: ('Correo del despacho ' + dma(recibido) + ' · ' + act.actuacion + ' — término de ' + f.cls.terminoDias + ' días').slice(0, 250), textoSugerencia: act.actuacion };
    setCrear({ tipo, proceso, act, inicial, origen: 'correo' });
  }

  const conteo = useMemo(() => ({
    todos: filas.length,
    despachos: filas.filter(f => f.despacho && !f.cls.ruido).length,
    conProceso: filas.filter(f => f.procesos.length).length,
    sinProceso: filas.filter(f => f.despacho && !f.cls.ruido && !f.procesos.length).length,
    importantes: filas.filter(f => f.cls.importante).length,
    acuses: filas.filter(f => f.cls.ruido).length,
  }), [filas]);
  const visibles = filas.filter(f => ({
    todos: true, despachos: f.despacho && !f.cls.ruido, conProceso: f.procesos.length > 0, sinProceso: f.despacho && !f.cls.ruido && !f.procesos.length, importantes: f.cls.importante, acuses: f.cls.ruido,
  }[filtro]));
  const FILTROS = [['despachos', 'Correos de despachos'], ['importantes', 'Importantes'], ['conProceso', 'Con proceso del portal'], ['sinProceso', 'Sin proceso'], ['acuses', 'Acuses y automáticos'], ['todos', 'Todos']];

  return (
    <div className="field-section">
      <p className="rama-fuente">Aquí aparecen los correos que los juzgados y despachos envían a nuestro correo de notificaciones (Gerencia). El portal los lee, dice de qué proceso es cada uno y de qué se trata (auto, audiencia, traslado…). <strong>Solo lee: no borra, no mueve ni cambia nada del correo.</strong> Cuando el correo trae una audiencia o un término, aparece el botón para abrir el formulario ya lleno; <strong>no se guarda nada hasta que usted presione «Agregar»</strong>.</p>
      <div className="rama-fechas">
        <label>Buzón <input type="text" value={buzon} onChange={e => setBuzon(e.target.value)} style={{ minWidth: 260 }} /></label>
        <label>Desde <input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></label>
        <button type="button" className="btn-primary rama-btn" onClick={leer} disabled={cargando}>{cargando ? 'Leyendo…' : (liveMode ? 'Leer correo de Gerencia' : 'Ver ejemplo (modo demo)')}</button>
      </div>
      {error && <div className="rama-error" role="alert"><strong>No se pudo leer el correo de Gerencia.</strong> {/403|Access is denied/i.test(error) ? 'Su usuario no tiene permiso para ver ese correo: pídale a Soporte que le dé acceso.' : 'Intente de nuevo en un momento; si sigue igual, avise a Soporte.'}<br /><span className="rama-res-suave">Detalle técnico: {error}</span></div>}
      {mensajes && (
        <>
          <div className="rama-chips" role="group" aria-label="Filtrar los correos">
            {FILTROS.map(([id, nombre]) => <button key={id} type="button" className={'rama-chip' + (filtro === id ? ' activo' : '')} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{nombre} <span>{conteo[id === 'acuses' ? 'acuses' : id]}</span></button>)}
          </div>
          {liveMode && mensajes.length === 0 && <div className="rama-hist-aviso"><span><strong>Todavía no hay correos para mostrar.</strong> Puede ser que aún no haya llegado ninguno desde que se activó el reenvío, o que el rango de fechas sea muy corto: pruebe con una fecha «Desde» más antigua. Si sabe que un despacho ya escribió y no aparece, avise a Soporte.</span></div>}
          {visibles.length === 0 ? <div className="empty-state empty-state-compact">No hay correos en esta vista.</div> : (
            <div className="table-wrap">
              <table className="rama-tabla">
                <thead><tr><th>Recibido</th><th>De</th><th>Asunto</th><th>Proceso del portal</th><th>Clase</th><th>Detectado</th><th></th></tr></thead>
                <tbody>
                  {visibles.map(f => (
                    <tr key={f.id} className={f.cls.ruido ? 'rama-tramite' : (f.cls.importante ? 'rama-importante' : '')}>
                      <td className="rama-fecha">{fechaHora(f.fecha)}</td>
                      <td>{f.remitenteNombre || f.remitente}{f.tieneAdjuntos ? ' 📎' : ''}</td>
                      <td className="rama-nota"><strong>{f.asunto}</strong><br /><span className="rama-res-suave">{f.resumen.slice(0, 160)}{f.resumen.length > 160 ? '…' : ''}</span></td>
                      <td>{f.procesos.length ? f.procesos.map(p => <div key={p.id}><strong>{p.Radicado || p.NoCompleto}</strong><br /><span className="rama-res-suave">{p.Cliente || ''}</span></div>) : (f.despacho && !f.cls.ruido ? <span className="rama-res-alerta">No encontré el proceso{f.rad.c21.length ? ' (radicado ' + f.rad.c21[0] + '…)' : ' (sin radicado)'}</span> : '—')}</td>
                      <td><span className={'badge badge-' + (COLOR_TIPO[f.cls.tipo] || 'gris')}>{TIPOS_CORREO[f.cls.tipo]}</span></td>
                      <td>
                        {f.cls.audiencia && <div>Audiencia{f.cls.audiencia.cancelada ? ' (cancelada)' : ''}: <strong>{dma(f.cls.audiencia.fecha)}{f.cls.audiencia.hora ? ' ' + f.cls.audiencia.hora : ''}</strong><br /><span className="rama-res-suave">{[f.cls.audiencia.tipo, f.cls.audiencia.modalidad].filter(Boolean).join(' · ')}</span></div>}
                        {f.cls.terminoDias > 0 && <div>Término: <strong>{f.cls.terminoDias} días</strong><br /><span className="rama-res-suave">según el texto; verifique</span></div>}
                      </td>
                      <td className="rama-acc">
                        {puedeCrear && !f.cls.ruido && f.procesos.map(p => {
                          const mias = (audiencias || []).filter(r => String(r.Proceso) === String(p.id));
                          const etiqueta = f.procesos.length > 1 ? ' (' + (p.Radicado || p.NoCompleto) + ')' : '';
                          return (
                            <div key={p.id}>
                              {f.cls.audiencia && !f.cls.audiencia.cancelada && (audienciaRegistrada(f.cls.audiencia, mias)
                                ? <span className="rama-res-ok">Ya está en Audiencias del portal{etiqueta}</span>
                                : <button type="button" className="rama-btn rama-btn--crear" onClick={() => abrirCrear('audiencias', f, p)} title="Abre el formulario de Audiencias con la fecha y hora de este correo; no guarda hasta «Agregar»"><Ico n="mas" />Crear audiencia{etiqueta}</button>)}
                              {f.cls.terminoDias > 0 && <button type="button" className="rama-btn rama-btn--crear" onClick={() => abrirCrear('terminos', f, p)} title="Abre el formulario de Términos con la fecha de llegada del correo y los días que dice su texto; no guarda hasta «Agregar»"><Ico n="mas" />Crear término{etiqueta}</button>}
                            </div>
                          );
                        })}
                        {f.enlace && <a className="btn-secondary rama-btn" href={f.enlace} target="_blank" rel="noopener noreferrer">Abrir correo</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {liveMode && Object.keys(cuerpos).length === 0 && filas.some(f => f.despacho) && <p className="rama-res-suave">Leyendo el texto completo de los correos de despachos para encontrar la fecha de la audiencia…</p>}
          <p className="rama-res-nota">Las fechas de audiencia y los días de término que se muestran salen del texto del correo y son solo una guía: confírmelos siempre en el auto o el oficio antes de registrarlos.</p>
        </>
      )}
      {crear && <ModalCrearDesdeRama crear={crear} proceso={crear.proceso} tiposAccion={tiposAccion} colaboradores={colaboradores} notify={notify} onCrearAudiencia={onCrearAudiencia} onCrearTermino={onCrearTermino} onCreateTipoTermino={onCreateTipoTermino} onCerrar={() => setCrear(null)} />}
    </div>
  );
}
