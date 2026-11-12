import { useState, useEffect, useMemo } from 'react';

// Informe de redes sociales (2026-11-12). Los datos salen de Bustral (la
// empresa de comunicaciones: calendario, copy, estado de aprobación y
// métricas de 30 días) más las vistas públicas de YouTube, y viven en
// public/data/redes-sociales.json. Fase 1: Claude actualiza ese archivo
// cuando el usuario dice «actualiza redes» (lee Bustral con Chrome conectado).

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const RED_NOMBRE = { youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', spotify: 'Spotify' };
const ESTADO = {
  video_aprobado: { texto: 'Video aprobado', clase: 'badge-verde' },
  guion_aprobado: { texto: 'Guion aprobado', clase: 'badge-verde' },
  video_objetado: { texto: 'Video objetado', clase: 'badge-rojo' },
  por_aprobar: { texto: 'Por aprobar', clase: 'badge-naranja' },
};
const fmt = n => (n == null ? '—' : Number(n).toLocaleString('es-CO'));
const mesDe = f => String(f || '').slice(0, 7);
function fechaLarga(f){
  if(!f) return '—';
  const [a, m, d] = String(f).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}
function fechaCorta(f){
  if(!f) return '—';
  const [, m, d] = String(f).split('-').map(Number);
  return `${d} ${MESES[m - 1].slice(0, 3)}`;
}
function diasEntre(a, b){
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}
function idYoutube(url){
  const m = String(url || '').match(/[?&]v=([\w-]{6,})/);
  return m ? m[1] : null;
}
function totalVistas(p){
  return Object.values(p.vistas || {}).reduce((s, n) => s + (Number(n) || 0), 0);
}

export default function RedesSocialesInforme(){
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [mes, setMes] = useState('');
  const [abierta, setAbierta] = useState(null);

  useEffect(() => {
    let vivo = true;
    fetch(`${import.meta.env.BASE_URL}data/redes-sociales.json?v=${Date.now()}`)
      .then(r => { if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(j => { if(vivo) setDatos(j); })
      .catch(() => { if(vivo) setError('No se pudo cargar el archivo de redes sociales (data/redes-sociales.json).'); });
    return () => { vivo = false; };
  }, []);

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

  const vista = useMemo(() => {
    if(!datos || !mes) return null;
    const hoy = datos.leido;
    const publicadasMes = datos.publicadas.filter(p => mesDe(p.fecha) === mes);
    const programadasMes = datos.programadas.filter(p => mesDe(p.fecha) === mes);

    // Cada programada se cruza con su publicación real (misma pieza, a veces otro día).
    const filasProg = programadasMes.map(g => {
      const real = g.publicadaComo ? datos.publicadas.find(p => p.fecha === g.publicadaComo) : null;
      const salioEn = real ? real.fecha : (g.publicadaEn ? g.publicadaComo : null);
      let cumpl;
      if(salioEn){
        const d = diasEntre(g.fecha, salioEn);
        cumpl = d === 0 ? { texto: 'Publicada a tiempo', clase: 'badge-verde' }
          : d > 0 ? { texto: `Publicada con ${d} día${d > 1 ? 's' : ''} de retraso`, clase: 'badge-naranja' }
          : { texto: `Publicada ${-d} día${d < -1 ? 's' : ''} antes`, clase: 'badge-verde' };
      } else if(g.fecha < hoy){
        cumpl = { texto: 'Sin publicar (fecha vencida)', clase: 'badge-rojo' };
      } else if(g.fecha === hoy){
        cumpl = { texto: 'Programada para hoy', clase: 'badge-naranja' };
      } else {
        cumpl = { texto: 'Pendiente', clase: 'badge-gris' };
      }
      return { tipo: 'programada', fecha: g.fecha, titulo: g.titulo, g, real, salioEn, cumpl };
    });
    const vinculadas = new Set(filasProg.filter(f => f.real).map(f => f.real.fecha + '|' + f.real.titulo));
    const filasPub = publicadasMes
      .filter(p => !vinculadas.has(p.fecha + '|' + p.titulo))
      .map(p => ({ tipo: 'publicada', fecha: p.fecha, titulo: p.titulo, p, cumpl: null }));
    const filas = [...filasProg, ...filasPub].sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Piezas realmente publicadas en el mes (sin contarlas dos veces).
    const piezasPublicadas = filasPub.length + filasProg.filter(f => f.salioEn).length;
    const porRed = {};
    publicadasMes.forEach(p => (p.redes || []).forEach(r => { porRed[r] = (porRed[r] || 0) + 1; }));

    const programadas = filasProg.length;
    const cumplidas = filasProg.filter(f => f.salioEn).length;
    const aTiempo = filasProg.filter(f => f.salioEn && diasEntre(f.fecha, f.salioEn) <= 0).length;
    const vencidasSin = filasProg.filter(f => !f.salioEn && f.fecha < hoy).length;
    const aprobadas = filasProg.filter(f => ['video_aprobado', 'guion_aprobado'].includes(f.g.estado)).length;
    const objetadas = filasProg.filter(f => f.g.estado === 'video_objetado').length;

    // Más / menos vista: solo hay vistas públicas de YouTube.
    const conVistas = publicadasMes
      .concat(filasProg.filter(f => f.g.vistas && !f.real).map(f => ({ ...f.g, redes: ['youtube', 'spotify'] })))
      .map(p => ({ p, v: totalVistas(p) }))
      .filter(x => x.v > 0 || (x.p.vistas && Object.keys(x.p.vistas).length))
      .sort((a, b) => b.v - a.v);
    return {
      filas, piezasPublicadas, porRed, programadas, cumplidas, aTiempo, vencidasSin, aprobadas, objetadas,
      mas: conVistas[0] || null, menos: conVistas.length > 1 ? conVistas[conVistas.length - 1] : null,
      hayProgramacion: programadas > 0,
    };
  }, [datos, mes]);

  if(error) return <p className="save-hint">{error}</p>;
  if(!datos || !vista) return <p className="save-hint">Cargando redes sociales…</p>;

  const [anio, mm] = mes.split('-').map(Number);
  const pct = vista.programadas ? Math.round(vista.cumplidas / vista.programadas * 100) : null;

  function abrir(f){ setAbierta(f); }

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
        <span className="redes-leido">Datos leídos de Bustral el {fechaLarga(datos.leido)}</span>
      </div>

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
          <span className="redes-kpi-t">Más vista (YouTube)</span>
          <span className="redes-kpi-s">{vista.mas ? vista.mas.p.titulo : 'Sin vistas públicas en este mes'}</span>
        </div>
        <div className="redes-kpi">
          <span className="redes-kpi-n">{vista.menos ? fmt(totalVistas(vista.menos.p)) : '—'}</span>
          <span className="redes-kpi-t">Menos vista (YouTube)</span>
          <span className="redes-kpi-s">{vista.menos ? vista.menos.p.titulo : 'Se necesitan al menos 2 piezas con vistas'}</span>
        </div>
      </div>

      <div className="redes-seccion">
        <h3>Seguidores</h3>
        <div className="table-wrap">
          <table className="redes-tabla">
            <thead><tr><th>Red</th><th className="redes-num">Seguidores actuales</th><th className="redes-num">Nuevos (últimos 30 días)</th><th>Nota</th></tr></thead>
            <tbody>
              {datos.seguidores.map(s => (
                <tr key={s.red}>
                  <td>{s.nombre}</td>
                  <td className="redes-num">{fmt(s.actuales)}</td>
                  <td className="redes-num">{fmt(s.nuevos30d)}</td>
                  <td className="redes-nota">{s.nota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="redes-seccion">
        <h3>Calendario de {MESES[mm - 1]} {anio}: lo programado frente a lo publicado</h3>
        <p className="save-hint" style={{margin:'0 0 8px'}}>Haz clic en una fila para ver el copy y el video.</p>
        <div className="table-wrap">
          <table className="redes-tabla redes-tabla-cal">
            <thead><tr><th>Fecha</th><th>Pieza</th><th>Aprobación</th><th>Cumplimiento</th><th>Dónde salió</th></tr></thead>
            <tbody>
              {vista.filas.length === 0 && <tr><td colSpan={5} className="redes-vacio">No hay publicaciones ni programación en este mes.</td></tr>}
              {vista.filas.map(f => {
                const est = f.tipo === 'programada' ? ESTADO[f.g.estado] : null;
                const redes = f.tipo === 'publicada'
                  ? (f.p.redes || []).map(r => RED_NOMBRE[r] || r)
                  : f.real ? (f.real.redes || []).map(r => RED_NOMBRE[r] || r)
                  : f.g.publicadaEn ? Object.keys(f.g.publicadaEn).map(r => RED_NOMBRE[r] || r) : [];
                return (
                  <tr key={f.tipo + f.fecha + f.titulo} className="redes-fila" tabIndex={0} onClick={() => abrir(f)} onKeyDown={e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); abrir(f); } }}>
                    <td className="redes-fecha">{fechaCorta(f.fecha)}{f.salioEn && f.salioEn !== f.fecha && <small>salió {fechaCorta(f.salioEn)}</small>}</td>
                    <td className="redes-titulo">{f.titulo}</td>
                    <td>{est ? <span className={"badge " + est.clase}>{est.texto}</span> : <span className="redes-sin">Publicada en Bustral</span>}</td>
                    <td>{f.cumpl ? <span className={"badge " + f.cumpl.clase}>{f.cumpl.texto}</span> : <span className="redes-sin">Sin programación en el calendario</span>}</td>
                    <td>{redes.length ? redes.join(' · ') : <span className="redes-sin">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="redes-seccion">
        <h3>Métricas de los últimos 30 días</h3>
        <p className="save-hint" style={{margin:'0 0 8px'}}>{datos.metricas30d.periodo}</p>
        <div className="redes-metricas">
          {['facebook', 'instagram', 'youtube'].map(r => (
            <div className="redes-metrica" key={r}>
              <h4>{RED_NOMBRE[r]}</h4>
              <table className="redes-tabla">
                <tbody>
                  {datos.metricas30d[r].map(([k, v]) => <tr key={k}><td>{k}</td><td className="redes-num">{fmt(v)}</td></tr>)}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      <p className="save-hint">{datos.fuente} Las vistas por publicación solo existen para YouTube (Bustral y Facebook/Instagram no las entregan por pieza). «Nuevos seguidores del mes» de Instagram se podrá medir cuando se guarde un conteo mensual.</p>

      {abierta && <DetalleRedes f={abierta} onClose={() => setAbierta(null)} />}
    </div>
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
            <div className="redes-modal-badges">
              {est && <span className={"badge " + est.clase}>{est.texto}</span>}
              {f.cumpl && <span className={"badge " + f.cumpl.clase}>{f.cumpl.texto}</span>}
              {g && g.destino && <span className="badge badge-gris">Destino: {g.destino}</span>}
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
                  : 'Esta pieza no tiene video en YouTube.'}
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
