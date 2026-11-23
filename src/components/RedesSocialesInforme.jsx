import { Fragment, useState, useEffect, useMemo } from 'react';
import { MESES, RED_NOMBRE, ESTADO, BUSTRAL_CALENDARIO, REDES_ORDEN, mesDe, fechaLarga, fechaCorta, totalVistas, nuevosDe, calcularVistaMes, mesesDisponibles } from '../lib/redesSociales';
import { IconTextButton } from './IconButton';
import { generarInformeRedesExcel, generarInformeRedesPDF, crearBorradorRevisionRedes } from '../lib/informeRedes';

// Informe de redes sociales (2026-11-12). Los datos salen de Bustral (la
// empresa de comunicaciones: calendario, copy, estado de aprobación y
// métricas de 30 días) más las vistas públicas de YouTube, y viven en
// public/data/redes-sociales.json. Fase 1: Claude actualiza ese archivo
// cuando el usuario dice «actualiza redes» (lee Bustral con Chrome conectado).

// Qué significa cada métrica (definiciones habituales de Meta y YouTube; Bustral las toma de ahí).
// Se muestran siempre debajo del nombre, no como globo al pasar el mouse, para que se lean igual en el celular.
const GLOSARIO = {
  'facebook|Impresiones de la página': 'Veces que apareció en pantalla algo de tu página. Si una persona lo ve 3 veces, cuenta 3.',
  'facebook|Vistas de contenido': 'Veces que se vio tu contenido (videos, fotos, publicaciones). También cuenta repeticiones.',
  'facebook|Interacciones': 'Acciones de la gente sobre tus publicaciones: reacciones, comentarios, compartidos y clics.',
  'facebook|Seguidores nuevos (neto)': 'Los que se sumaron menos los que dejaron de seguirte: el saldo final.',
  'instagram|Alcance': 'Personas distintas que vieron tu contenido. Cada persona cuenta una sola vez.',
  'instagram|Vistas': 'Veces que se vio tu contenido, contando repeticiones. Por eso es mayor que el alcance.',
  'instagram|Me gusta': 'Corazones que recibieron tus publicaciones.',
  'instagram|Comentarios': 'Comentarios escritos en tus publicaciones.',
  'instagram|Compartidos': 'Veces que alguien envió tu publicación a otra persona o la subió a sus historias. Es la señal más valiosa: lleva tu contenido a gente nueva.',
  'instagram|Guardados': 'Veces que alguien guardó la publicación para verla después: indica que le pareció útil.',
  'tiktok|Me gusta del perfil (total)': 'Corazones que han recibido todos los videos de la cuenta desde que existe (TikTok no da el dato por mes).',
  'spotify|Episodios publicados': 'Episodios del podcast Café Laboral que hay en Spotify.',
  'spotify|Calificación (3 reseñas)': 'Promedio de estrellas (de 5) que le dieron los oyentes que dejaron reseña.',
  'youtube|Minutos vistos': 'Tiempo total que la gente pasó viendo tus videos, sumado en minutos.',
  'youtube|Suscriptores ganados': 'Personas que se suscribieron al canal en el período.',
  'youtube|Suscriptores perdidos': 'Personas que se dieron de baja del canal en el período.',
  'youtube|Me gusta': 'Veces que le dieron «me gusta» a tus videos.',
};
const fmt = n => (n == null ? '—' : Number(n).toLocaleString('es-CO'));
function idYoutube(url){
  const m = String(url || '').match(/[?&]v=([\w-]{6,})/);
  return m ? m[1] : null;
}
export default function RedesSocialesInforme({ liveMode, notify, esAdministrador, urlConsulta }){
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [mes, setMes] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [para, setPara] = useState('');
  const [accion, setAccion] = useState('');   // '' | 'excel' | 'pdf' | 'correo'

  const [recargando, setRecargando] = useState(false);
  const [enVivo, setEnVivo] = useState(null);   // lo que hay publicado ahora en YouTube y Spotify (lectura abierta, sin Bustral)
  const cargar = () => fetch(`${import.meta.env.BASE_URL}data/redes-sociales.json?v=${Date.now()}`, { cache: 'no-store' })
    .then(r => { if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });

  useEffect(() => {
    let vivo = true;
    cargar()
      .then(j => { if(vivo) setDatos(j); })
      .catch(() => { if(vivo) setError('No se pudo cargar el archivo de redes sociales (data/redes-sociales.json).'); });
    return () => { vivo = false; };
  }, []);

  // Botón «Actualizar redes» (visible para todos los perfiles): (1) vuelve a pedir la última lectura guardada de Bustral y (2) lee en vivo lo que hay
  // publicado ahora en YouTube (con vistas) y Spotify. Bustral, Instagram, Facebook, TikTok y LinkedIn piden inicio de sesión o clave: esos se leen cuando se pide «actualiza redes».
  async function actualizarRedes(){
    if(recargando) return;
    setRecargando(true);
    try{
      const [j, vivo] = await Promise.all([
        cargar(),
        urlConsulta
          ? fetch(urlConsulta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redes: true }) }).then(r => r.json()).catch(() => null)
          : Promise.resolve(null),
      ]);
      setDatos(j);
      if(vivo && vivo.ok){
        setEnVivo(vivo);
        notify?.('Redes actualizadas: ' + vivo.publicaciones.length + ' publicaciones leídas en vivo de YouTube y Spotify.', 'info');
      }else{
        notify?.('Se recargó la última lectura de Bustral (' + fechaLarga(j.leido) + '), pero no se pudo leer YouTube/Spotify en vivo. Revisa que la consulta en Netlify tenga la última versión.', 'info');
      }
    }catch(err){
      console.error(err);
      notify?.('No se pudo actualizar: ' + (err?.message || err), 'error');
    }finally{ setRecargando(false); }
  }

  useEffect(() => {
    if(!abierta) return;
    const onKey = e => { if(e.key === 'Escape') setAbierta(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierta]);

  const meses = useMemo(() => {
    if(!datos) return [];
    const s = new Set();
    datos.publicadas.forEach(p => s.add(mesDe(p.fecha)));
    datos.programadas.forEach(p => s.add(mesDe(p.fecha)));
    return [...s].sort();
  }, [datos]);

  useEffect(() => {
    if(datos && !mes && meses.length) setMes(meses[meses.length - 1]);
  }, [datos, meses, mes]);

  const vista = useMemo(() => (datos && mes ? calcularVistaMes(datos, mes) : null), [datos, mes]);

  if(error) return <p className="save-hint">{error}</p>;
  if(!datos || !vista) return <p className="save-hint">Cargando redes sociales…</p>;

  const [anio, mm] = mes.split('-').map(Number);
  const pct = vista.programadas ? Math.round(vista.cumplidas / vista.programadas * 100) : null;

  function abrir(f){ setAbierta(f); }

  async function ejecutar(tipo, fn, mensajeOk){
    if(accion) return;
    setAccion(tipo);
    try{ const r = await fn(); if(mensajeOk) notify?.(typeof mensajeOk === 'function' ? mensajeOk(r) : mensajeOk, 'info'); }
    catch(err){ console.error(err); notify?.('No se pudo generar: ' + (err?.message || err), 'error'); }
    finally{ setAccion(''); }
  }
  const correosPara = () => para.split(/[;,\s]+/).map(c => c.trim()).filter(c => /^\S+@\S+\.\S+$/.test(c));
  function crearCorreo(){
    if(!liveMode){ notify?.('El borrador se crea en tu Outlook al iniciar sesión con Microsoft; en el modo demo no hay buzón. Puedes descargar el Excel o el PDF.', 'info'); return; }
    ejecutar('correo', async () => {
      const m = await crearBorradorRevisionRedes(datos, mes, { para: correosPara() });
      await new Promise(r => setTimeout(r, 3000));
      if(m?.carpetaBorradores) window.open(m.carpetaBorradores, '_blank');
      return m;
    }, m => `Se creó el borrador «Revisión de publicaciones de Lexara Abogados» en tus Borradores de Outlook${m?.carpetaReal ? ` (carpeta «${m.carpetaReal}»)` : ''}. Revísalo y envíalo.`);
  }

  return (
    <div className="redes-informe">
      <div className="redes-barra">
        <label className="redes-mes">
          <span>Mes</span>
          <select value={mes} onChange={e => setMes(e.target.value)}>
            {meses.map(m => {
              const [a, n] = m.split('-').map(Number);
              return <option key={m} value={m}>{MESES[n - 1][0].toUpperCase() + MESES[n - 1].slice(1)} {a}</option>;
            })}
          </select>
        </label>
        {(() => {
          // Los datos son una lectura manual de Bustral: si tienen días, los estados (programada / publicada) pueden estar desactualizados.
          const dias = Math.floor((Date.now() - new Date(datos.leido + 'T12:00:00').getTime()) / 86400000);
          return dias >= 1
            ? <span className="redes-leido redes-leido-viejo" role="status">Datos leídos de Bustral el {fechaLarga(datos.leido)} (hace {dias} {dias === 1 ? 'día' : 'días'}): los estados pueden haber cambiado.{esAdministrador ? ' Pida «actualiza redes» para refrescarlos.' : ' El Administrador los actualiza desde Bustral.'}</span>
            : <span className="redes-leido">Datos leídos de Bustral el {fechaLarga(datos.leido)}</span>;
        })()}
      </div>

      <div className="redes-acciones">
        <IconTextButton icon="excel" variant="secondary" onClick={() => ejecutar('excel', () => generarInformeRedesExcel(datos, mes))} disabled={!!accion}>{accion === 'excel' ? 'Generando…' : 'Excel'}</IconTextButton>
        <IconTextButton icon="pdf" variant="secondary" onClick={() => ejecutar('pdf', () => generarInformeRedesPDF(datos, mes))} disabled={!!accion}>{accion === 'pdf' ? 'Generando…' : 'PDF'}</IconTextButton>
        <IconTextButton icon="refresh" variant="secondary" onClick={actualizarRedes} disabled={recargando || !!accion}>{recargando ? 'Actualizando…' : 'Actualizar redes'}</IconTextButton>
        <span className="redes-acciones-correo">
          <input type="text" inputMode="email" value={para} onChange={e => setPara(e.target.value)} placeholder="Para (opcional): correo@empresa.com" aria-label="Destinatario del borrador (opcional)" />
          <IconTextButton icon="mail" variant="primary" onClick={crearCorreo} disabled={!!accion}>{accion === 'correo' ? 'Creando borrador…' : 'Crear borrador de correo'}</IconTextButton>
        </span>
      </div>
      <p className="save-hint" style={{margin:'-6px 0 0'}}>El correo «Revisión de publicaciones de Lexara Abogados» queda en los Borradores de tu Outlook, con la lista de novedades de {MESES[mm - 1]} (fecha programada, aprobación, fecha y hora de publicación, y lo que no se publicó). No se envía solo.</p>

      {enVivo && (
        <section className="redes-envivo" aria-label="Publicado actualmente">
          <div className="redes-envivo-cab">
            <h3>Publicado actualmente</h3>
            <span className="redes-leido">Leído en vivo de {enVivo.fuentes?.instagram ? 'Instagram, ' : ''}YouTube y Spotify el {new Date(enVivo.leidoEn).toLocaleString('es-CO', { day:'numeric', month:'long', hour:'numeric', minute:'2-digit' })}</span>
          </div>
          <ul className="redes-envivo-lista">
            {enVivo.publicaciones.slice(0, 8).map((p, i) => (
              <li key={p.url + i}>
                <span className={'redes-envivo-red redes-envivo-' + p.red}>{RED_NOMBRE[p.red] || p.red}</span>
                <a href={p.url} target="_blank" rel="noopener noreferrer">{p.titulo}</a>
                <span className="redes-envivo-meta">{p.fecha ? fechaCorta(p.fecha) : ''}{p.vistas != null ? ' · ' + fmt(p.vistas) + ' vistas' : ''}{p.meGusta != null ? ' · ' + fmt(p.meGusta) + ' me gusta' : ''}</span>
              </li>
            ))}
          </ul>
          <p className="save-hint" style={{margin:0}}>{enVivo.fuentes?.instagram ? 'Facebook, TikTok y LinkedIn' : 'Instagram, Facebook, TikTok y LinkedIn'} no se pueden leer en vivo: sus publicaciones salen de la última lectura de Bustral.</p>
        </section>
      )}

      <div className="redes-kpis">
        <div className="redes-kpi">
          <span className="redes-kpi-n">{fmt(vista.piezasPublicadas)}</span>
          <span className="redes-kpi-t">Videos / piezas publicadas en {MESES[mm - 1]}</span>
          <span className="redes-kpi-s">
            {Object.keys(vista.porRed).length
              ? Object.entries(vista.porRed).map(([r, n]) => `${RED_NOMBRE[r] || r}: ${n}`).join(' · ')
              : 'Sin detalle por red'}
          </span>
        </div>
        <div className="redes-kpi">
          <span className="redes-kpi-n">{vista.hayProgramacion ? `${pct}%` : '—'}</span>
          <span className="redes-kpi-t">Cumplimiento del calendario</span>
          <span className="redes-kpi-s">
            {vista.hayProgramacion
              ? `${vista.cumplidas} de ${vista.programadas} programadas salieron · ${vista.aTiempo} a tiempo`
              : 'Bustral no trae calendario programado para este mes'}
          </span>
        </div>
        <div className="redes-kpi">
          <span className="redes-kpi-n">{vista.hayProgramacion ? `${vista.aprobadas} / ${vista.objetadas}` : '—'}</span>
          <span className="redes-kpi-t">Aprobadas / objetadas</span>
          <span className="redes-kpi-s">{vista.hayProgramacion ? `${vista.vencidasSin} con fecha vencida sin publicar` : 'Sin piezas programadas'}</span>
        </div>
        <div className="redes-kpi">
          <span className="redes-kpi-n">{vista.mas ? fmt(totalVistas(vista.mas.p)) : '—'}</span>
          <span className="redes-kpi-t">Más vista (YouTube + TikTok)</span>
          <span className="redes-kpi-s">{vista.mas ? vista.mas.p.titulo : 'Sin vistas públicas en este mes'}</span>
          {vista.mas && <FechasKpi p={vista.mas.p} datos={datos} />}
        </div>
        <div className="redes-kpi">
          <span className="redes-kpi-n">{vista.menos ? fmt(totalVistas(vista.menos.p)) : '—'}</span>
          <span className="redes-kpi-t">Menos vista (YouTube + TikTok)</span>
          <span className="redes-kpi-s">{vista.menos ? vista.menos.p.titulo : 'Se necesitan al menos 2 piezas con vistas'}</span>
          {vista.menos && <FechasKpi p={vista.menos.p} datos={datos} />}
        </div>
      </div>

      <div className="redes-seccion">
        <h3>Calendario de {MESES[mm - 1]} {anio}: lo programado frente a lo publicado</h3>
        <p className="save-hint" style={{margin:'0 0 8px'}}>Haz clic en una fila para ver el copy y el video. «Programada» es la fecha que tiene la pieza en el calendario de Bustral. Aprobar u objetar se hace en Bustral con tu sesión: el enlace abre su calendario.{datos.bustralPanel && <> Debajo del título de cada pieza objetada se ve la nota que dejó quien la objetó en Bustral (leída el {fechaLarga(datos.bustralPanel.leido)}; se actualiza al pedir «actualiza redes»). Por aprobar hoy: {datos.bustralPanel.porAprobar}.</>}</p>
        <div className="table-wrap">
          <table className="redes-tabla redes-tabla-cal">
            <thead><tr><th>Pieza</th><th>Aprobación</th><th>Cumplimiento</th><th>Programada (Bustral)</th><th>Publicada</th><th>Aprobar u objetar</th></tr></thead>
            <tbody>
              {vista.filas.length === 0 && <tr><td colSpan={6} className="redes-vacio">No hay publicaciones ni programación en este mes.</td></tr>}
              {vista.filas.map(f => {
                const est = f.tipo === 'programada' ? ESTADO[f.g.estado] : null;
                const redes = f.tipo === 'publicada'
                  ? (f.p.redes || []).map(r => RED_NOMBRE[r] || r)
                  : f.real ? (f.real.redes || []).map(r => RED_NOMBRE[r] || r)
                  : f.g.publicadaEn ? Object.keys(f.g.publicadaEn).map(r => RED_NOMBRE[r] || r) : [];
                return (
                  <Fragment key={f.tipo + f.fecha + f.titulo}>
                  <tr className={"redes-fila" + (f.tipo === 'programada' && f.g.objecion ? " redes-fila-con-nota" : "")} tabIndex={0} onClick={() => abrir(f)} onKeyDown={e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); abrir(f); } }}>
                    <td className="redes-titulo">{f.titulo}</td>
                    <td>{est ? <span className={"badge " + est.clase}>{est.texto}</span> : <span className="redes-sin">Publicada en Bustral</span>}</td>
                    <td>{f.cumpl ? <span className={"badge " + f.cumpl.clase}>{f.cumpl.texto}</span> : <span className="redes-sin">Sin programación en el calendario</span>}</td>
                    <td className="redes-fecha">{f.tipo === 'programada' ? fechaCorta(f.g.fecha) : <span className="redes-sin">Sin programar</span>}</td>
                    <td className="redes-fecha">
                      {(f.tipo === 'publicada' || f.salioEn) ? <>{fechaCorta(f.tipo === 'publicada' ? f.fecha : f.salioEn)}{((f.tipo === 'publicada' ? f.p : f.real)?.hora) && <> · {(f.tipo === 'publicada' ? f.p : f.real).hora}</>}{redes.length > 0 && <small>{redes.join(' · ')}</small>}</> : <span className="redes-sin">Aún no</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                      {f.tipo === 'programada'
                        ? <a className="redes-bustral" href={BUSTRAL_CALENDARIO} target="_blank" rel="noopener noreferrer">{f.g.estado === 'video_aprobado' || f.g.estado === 'guion_aprobado' ? 'Revisar' : 'Aprobar / objetar'} en Bustral ↗</a>
                        : <span className="redes-sin">—</span>}
                    </td>
                  </tr>
                  {f.tipo === 'programada' && f.g.objecion && (
                    <tr className="redes-fila-nota" onClick={() => abrir(f)}>
                      <td colSpan={6}><span className="redes-nota-bustral"><b>Nota de Bustral:</b> «{f.g.objecion}»</span></td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="redes-seccion">
        <h3>Seguidores y métricas de los últimos 30 días</h3>
        <p className="save-hint" style={{margin:'0 0 8px'}}>{datos.metricas30d.periodo}. Lo primero de cada red es cuántos seguidores tiene hoy y cuántos se sumaron en el mes.</p>
        <div className="redes-metricas">
          {REDES_ORDEN.map(r => {
            const s = datos.seguidores.find(x => x.red === r) || {};
            const nuevos = nuevosDe(datos, r, s);
            const filas = (datos.metricas30d[r] || []).filter(([k]) => k !== 'Seguidores nuevos (neto)');
            return (
              <div className="redes-metrica" key={r}>
                <h4>{RED_NOMBRE[r]}{s.cuenta && <small className="redes-cuenta">{s.cuenta}</small>}</h4>
                <table className="redes-tabla">
                  <tbody>
                    <tr className="redes-fila-seg">
                      <td>Seguidores actuales<small className="redes-explica">{s.actuales == null ? (r === 'spotify' ? 'Spotify no muestra los seguidores públicamente; están en Spotify for Podcasters.' : 'Esta red no entrega ese dato.') : 'Personas que siguen la cuenta hoy.'}</small></td>
                      <td className="redes-num">{fmt(s.actuales)}</td>
                    </tr>
                    <tr className="redes-fila-seg">
                      <td>Seguidores nuevos del mes<small className="redes-explica">{nuevos.texto}</small></td>
                      <td className="redes-num">{nuevos.valor == null ? '—' : (nuevos.valor > 0 ? '+' : '') + fmt(nuevos.valor)}</td>
                    </tr>
                    {filas.map(([k, v]) => (
                      <tr key={k}>
                        <td>{k}{GLOSARIO[r + '|' + k] && <small className="redes-explica">{GLOSARIO[r + '|' + k]}</small>}</td>
                        <td className="redes-num">{fmt(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>

      <p className="save-hint">{datos.fuente} Las vistas por publicación solo se ven en YouTube y TikTok (Bustral, Facebook e Instagram no las entregan por pieza; Bustral tampoco mide TikTok, LinkedIn ni Spotify). «Nuevos seguidores del mes» de Instagram se podrá medir cuando se guarde un conteo mensual.</p>

      {abierta && <DetalleRedes f={abierta} onClose={() => setAbierta(null)} />}
    </div>
  );
}

// Las dos fechas de una pieza: la que tiene en el calendario de Bustral (programada) y la del día en que quedó publicada.
function FechasKpi({ p, datos }){
  const prog = datos.programadas.find(g => g.publicadaComo === p.fecha);
  return (
    <span className="redes-kpi-f">
      <span className="redes-kpi-fila"><b>En Bustral:</b> {prog ? `programada el ${fechaLarga(prog.fecha)}` : 'sin fecha programada'}</span>
      <span className="redes-kpi-fila"><b>Publicada:</b> {fechaLarga(p.fecha)}</span>
    </span>
  );
}

function DetalleRedes({ f, onClose }){
  const g = f.tipo === 'programada' ? f.g : null;
  const p = f.tipo === 'publicada' ? f.p : f.real;
  const copy = (p && p.copy && (!g || p.copy.length >= g.copy.length) ? p.copy : (g ? g.copy : p.copy)) || '';
  const urls = { ...((p && p.urls) || {}), ...((g && g.publicadaEn) || {}) };
  const vistas = { ...((p && p.vistas) || {}), ...((g && g.vistas) || {}) };
  const yt = idYoutube(urls.youtube);
  const est = g ? ESTADO[g.estado] : null;
  return (
    <div className="confirm-overlay" onClick={onClose} role="presentation">
      <div className="redes-modal" role="dialog" aria-modal="true" aria-label={f.titulo} onClick={e => e.stopPropagation()}>
        <div className="redes-modal-cab">
          <div>
            <h3>{f.titulo}</h3>
            <div className="redes-modal-meta">
              {g ? <>Programada: {fechaLarga(g.fecha)}</> : <>Publicada: {fechaLarga(f.fecha)}</>}
              {f.salioEn && f.salioEn !== f.fecha && <> · Salió el {fechaLarga(f.salioEn)}</>}
            </div>
            {g && g.objecion && <p className="redes-motivo"><b>Motivo de la objeción:</b> «{g.objecion}»</p>}
            <div className="redes-modal-badges">
              {est && <span className={"badge " + est.clase}>{est.texto}</span>}
              {f.cumpl && <span className={"badge " + f.cumpl.clase}>{f.cumpl.texto}</span>}
              {g && g.destino && <span className="badge badge-gris">Destino: {g.destino}</span>}
              {g && <a className="redes-bustral" href={BUSTRAL_CALENDARIO} target="_blank" rel="noopener noreferrer">Aprobar u objetar en Bustral ↗</a>}
            </div>
          </div>
          <button type="button" className="redes-cerrar" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="redes-modal-cuerpo">
          <div className="redes-video">
            {yt ? (
              <a href={urls.youtube} target="_blank" rel="noopener noreferrer" className="redes-miniatura" title="Ver el video en YouTube">
                <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" loading="lazy" />
                <span className="redes-play" aria-hidden="true">▶</span>
              </a>
            ) : (
              <div className="redes-sinvideo">
                {g && g.tieneVideo
                  ? 'El video de esta pieza está en Bustral (botón «Descargar video»).'
                  : Object.keys(urls).length ? 'El video se abre en la red, con los botones de abajo.' : 'Esta pieza no tiene video con enlace público.'}
              </div>
            )}
            <div className="redes-enlaces">
              {Object.entries(urls).map(([r, u]) => (
                <a key={r} className="btn-secondary" href={u} target="_blank" rel="noopener noreferrer">Ver en {RED_NOMBRE[r] || r}{vistas[r] != null ? ` · ${fmt(vistas[r])} vistas` : ''}</a>
              ))}
              {!Object.keys(urls).length && <span className="redes-sin">Sin enlace público guardado.</span>}
            </div>
          </div>
          <div className="redes-copy">
            <h4>Copy / guion</h4>
            <pre>{copy}</pre>
            {g && g.copy.endsWith('…') && <p className="save-hint">El texto completo está en Bustral; aquí se muestra el inicio.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
