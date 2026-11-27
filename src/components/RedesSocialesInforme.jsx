import { Fragment, useState, useEffect, useMemo } from 'react';
import { MESES, RED_NOMBRE, ESTADO, BUSTRAL_CALENDARIO, REDES_ORDEN, mesDe, fechaLarga, fechaCorta, totalVistas, nuevosDe, calcularVistaMes, mesesDisponibles, estadisticasPorPublicacion, titulosBustralPorEnlace, claveEnlace, piezasSinPublicarQueCoinciden, fusionarEnVivo } from '../lib/redesSociales';
import { IconTextButton } from './IconButton';
import ColumnHeaderMenu from './ColumnHeaderMenu';
import { useColumnFilters } from '../hooks/useColumnFilters';
import { useColumnSort } from '../hooks/useColumnSort';
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
// Columnas de «Estadísticas por publicación» (al final de la hoja): se pueden ordenar y filtrar desde el menú de cada encabezado, como en las demás tablas del portal.
const COLUMNAS_ESTAD = [
  { key: 'titulo', label: 'Publicación', value: e => e.titulo, busqueda: e => e.titulo + ' ' + (e.tituloBustral || '') },
  { key: 'fecha', label: 'Fecha', value: e => e.fecha },
  { key: 'red', label: 'Red', value: e => RED_NOMBRE[e.red] || e.red },
  { key: 'vistas', label: 'Vistas', value: e => (e.vistas == null ? '' : String(e.vistas)) },
  { key: 'meGusta', label: 'Me gusta', value: e => (e.meGusta == null ? '' : String(e.meGusta)) },
  { key: 'comentarios', label: 'Comentarios', value: e => (e.comentarios == null ? '' : String(e.comentarios)) },
];
function idYoutube(url){
  const m = String(url || '').match(/[?&]v=([\w-]{6,})/);
  return m ? m[1] : null;
}
export default function RedesSocialesInforme({ liveMode, notify, esAdministrador, urlConsulta }){
  const [datosBase, setDatosBase] = useState(null);   // lo guardado en el archivo; `datos` = eso + lo que «Actualizar redes» lee en vivo y enlaza con el calendario
  const [enVivo, setEnVivo] = useState(null);   // lo que hay publicado ahora en YouTube y Spotify (lectura abierta, sin Bustral)
  const fusion = useMemo(() => (datosBase ? fusionarEnVivo(datosBase, enVivo) : { datos: null, nuevas: [] }), [datosBase, enVivo]);
  const datos = fusion.datos;
  const [error, setError] = useState('');
  const [mes, setMes] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [desplegadas, setDesplegadas] = useState(() => new Set());   // publicaciones del calendario con su nota y estadísticas a la vista
  const alternarFila = clave => setDesplegadas(prev => { const s = new Set(prev); if(s.has(clave)) s.delete(clave); else s.add(clave); return s; }); useEffect(() => { setDesplegadas(new Set()); }, [mes, datos]);   // siempre se empieza con todo cerrado: al entrar, al cambiar de mes y al recargar los datos
  const [para, setPara] = useState('');
  const [accion, setAccion] = useState('');   // '' | 'excel' | 'pdf' | 'correo'
  const { filters: filtrosEst, setFilter: setFiltroEst, clearFilters: limpiarFiltrosEst, rowMatches: coincideEst, hasActiveFilters: hayFiltrosEst } = useColumnFilters();
  const { sort: ordenEst, setSortKey: setOrdenEst, sortRows: ordenarEst } = useColumnSort();

  const [recargando, setRecargando] = useState(false);
  const cargar = () => Promise.all([
    fetch(`${import.meta.env.BASE_URL}data/redes-sociales.json?v=${Date.now()}`, { cache: 'no-store' })
      .then(r => { if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
    fetch(`${import.meta.env.BASE_URL}data/redes-publicaciones.json?v=${Date.now()}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([principal, todas]) => (todas ? { ...principal, publicacionesRedes: todas } : principal));

  useEffect(() => {
    let vivo = true;
    cargar()
      .then(j => { if(vivo) setDatosBase(j); })
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
      setDatosBase(j);
      if(vivo && vivo.ok){
        setEnVivo(vivo);
        const nuevas = fusionarEnVivo(j, vivo).nuevas;
        notify?.(nuevas.length
          ? 'Redes actualizadas: ' + nuevas.length + (nuevas.length === 1 ? ' publicación nueva detectada' : ' publicaciones nuevas detectadas') + ' — ' + nuevas.map(n => '«' + n.item.titulo + '» (' + (RED_NOMBRE[n.item.red] || n.item.red) + ', ' + fechaCorta(n.item.fecha) + ')' + (n.pieza ? ' ↔ ' + n.pieza.titulo.split(':')[0] : ' (sin pieza del calendario que encaje)')).join('; ') + '. Ya están en el calendario de esta pantalla; Instagram, TikTok y Facebook se leen cuando se pide «actualiza redes» en el chat.'
          : 'Redes actualizadas: ' + vivo.publicaciones.length + ' publicaciones leídas en vivo de YouTube y Spotify, sin novedades frente a lo guardado.', nuevas.length ? 'success' : 'info');
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

  // Lista de meses SIN huecos: desde el primero con datos hasta el último con datos, y como mínimo hasta dos meses después de hoy (así el mes que viene siempre se puede elegir, aunque aún no haya lectura).
  const meses = useMemo(() => {
    if(!datos) return [];
    const s = new Set();
    datos.publicadas.forEach(p => s.add(mesDe(p.fecha)));
    datos.programadas.forEach(p => s.add(mesDe(p.fecha)));
    const base = [...s].sort();
    if(!base.length) return [];
    const hoy = new Date();
    const mesHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const [ya, ym] = mesHoy.split('-').map(Number);
    const fin = new Date(ya, ym - 1 + 2, 1);
    const topeHoy = `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}`;
    const ultimo = base[base.length - 1] > topeHoy ? base[base.length - 1] : topeHoy;
    const salida = [];
    let [a, m] = base[0].split('-').map(Number);
    for(let guardia = 0; guardia < 120; guardia++){
      const clave = `${a}-${String(m).padStart(2, '0')}`;
      salida.push(clave);
      if(clave >= ultimo) break;
      m += 1; if(m > 12){ m = 1; a += 1; }
    }
    return salida;
  }, [datos]);

  // Mes que se abre al entrar: el mes de hoy si está en la lista; si no, el último con datos.
  useEffect(() => {
    if(datos && !mes && meses.length){
      const hoy = new Date();
      const mesHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
      setMes(meses.includes(mesHoy) ? mesHoy : meses[meses.length - 1]);
    }
  }, [datos, meses, mes]);

  // Al cambiar de mes se vuelve a leer el archivo de datos y se pinta de nuevo lo de ese mes (así se ve siempre lo último publicado).
  function cambiarMes(nuevo){
    setMes(nuevo);
    cargar().then(j => setDatosBase(j)).catch(() => { /* si falla, se sigue con lo que ya estaba cargado */ });
  }

  const vista = useMemo(() => (datos && mes ? calcularVistaMes(datos, mes) : null), [datos, mes]);

  if(error) return <p className="save-hint">{error}</p>;
  if(!datos || !vista) return <p className="save-hint">Cargando redes sociales…</p>;

  const [anio, mm] = mes.split('-').map(Number);
  const pct = vista.programadas ? Math.round(vista.cumplidas / vista.programadas * 100) : null;
  const estad = estadisticasPorPublicacion(datos);
  // Cada publicación con el título que tiene en el calendario de Bustral (si es una pieza programada): se puede buscar por cualquiera de los dos nombres.
  const todasRedes = (() => {
    const mapa = titulosBustralPorEnlace(datos);
    return ((datos.publicacionesRedes && datos.publicacionesRedes.publicaciones) || []).map(e => {
      const tb = mapa.get(claveEnlace(e.url)) || '';
      return tb && tb !== e.titulo ? { ...e, tituloBustral: tb } : e;
    });
  })();
  // Lo que se escribió en el filtro de «Publicación»: si coincide con piezas del calendario que aún no están publicadas, se avisa debajo de la tabla.
  const pendientesBusqueda = piezasSinPublicarQueCoinciden(datos, filtrosEst.titulo?.texto);
  const estadVisibles = ordenarEst(todasRedes.filter(e => coincideEst(e, COLUMNAS_ESTAD)), COLUMNAS_ESTAD);
  const estadPorFecha = new Map(estad.map(e => [e.fecha, e]));   // para mostrar las estadísticas de cada pieza ya publicada debajo de su fila del calendario

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
          <select value={mes} onChange={e => cambiarMes(e.target.value)}>
            {meses.map(m => {
              const [a, n] = m.split('-').map(Number);
              return <option key={m} value={m}>{MESES[n - 1][0].toUpperCase() + MESES[n - 1].slice(1)} {a}</option>;
            })}
          </select>
        </label>
        {(() => {
          // Aviso de qué tan viejos están los datos de Bustral. El botón «Actualizar redes» NO lee Bustral (pide sesión): recarga lo guardado y lee YouTube y Spotify en vivo; la lectura de Bustral
          // la hace Claude cuando se lo piden en el chat («actualiza redes»). El texto lo dice con esas palabras para no confundirlo con el botón.
          const diasDesde = f => Math.floor((Date.now() - new Date(f + 'T12:00:00').getTime()) / 86400000);
          const plural = n => (n === 1 ? 'día' : 'días');
          const calendarioLeido = datos.bustralPanel?.calendarioLeido || datos.leido;
          const diasCal = diasDesde(calendarioLeido);
          const diasMet = diasDesde(datos.leido);
          if(diasCal < 1 && diasMet < 1) return <span className="redes-leido">Datos leídos de Bustral el {fechaLarga(calendarioLeido)}</span>;
          return (
            <span className="redes-leido redes-leido-viejo" role="status">
              Calendario y notas de Bustral leídos el {fechaLarga(calendarioLeido)}{diasCal >= 1 ? ` (hace ${diasCal} ${plural(diasCal)})` : ''}
              {calendarioLeido !== datos.leido && <>; seguidores y métricas, el {fechaLarga(datos.leido)} (hace {diasMet} {plural(diasMet)})</>}. Los estados pueden haber cambiado.
              {esAdministrador
                ? ' El botón «Actualizar redes» recarga lo guardado, lee YouTube y Spotify en vivo y enlaza lo nuevo con el calendario; Instagram, TikTok, Facebook y Bustral se leen cuando le escribes a Claude en el chat: «actualiza redes».'
                : ' El Administrador los actualiza desde Bustral.'}
            </span>
          );
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

      {/* «Publicado actualmente» a la izquierda y las fichas a la derecha (en pantallas angostas, una debajo de la otra) */}
      <div className={'redes-dividida' + (enVivo ? ' redes-dividida--2' : '')}>
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
      </div>

      <div className="redes-seccion">
        <h3>Calendario de {MESES[mm - 1]} {anio}: lo programado frente a lo publicado</h3>
        <p className="save-hint" style={{margin:'0 0 8px'}}>Haz clic en una publicación para desplegar su nota de Bustral y sus estadísticas (y desde ahí ver el copy y los enlaces). «Programada» es la fecha que tiene la pieza en el calendario de Bustral. Aprobar u objetar se hace en Bustral con tu sesión: el enlace abre su calendario.{datos.bustralPanel && <> Las notas que dejó quien objetó cada pieza en Bustral se leyeron el {fechaLarga(datos.bustralPanel.leido)} y se actualizan al pedir «actualiza redes». Por aprobar hoy: {datos.bustralPanel.porAprobar}.</>}</p>
        <div className="table-wrap">
          <table className="redes-tabla redes-tabla-cal">
            <thead><tr><th>Pieza</th><th>Aprobación</th><th>Cumplimiento</th><th>Programada (Bustral)</th><th>Publicada</th><th>Aprobar u objetar</th></tr></thead>
            <tbody>
              {vista.filas.length === 0 && <tr><td colSpan={6} className="redes-vacio">No hay publicaciones ni programación de este mes en la última lectura de Bustral. Cuando haya, se pide «actualiza redes» y aparecen aquí.</td></tr>}
              {vista.filas.map(f => {
                const est = f.tipo === 'programada' ? ESTADO[f.g.estado] : null;
                const redes = f.tipo === 'publicada'
                  ? (f.p.redes || []).map(r => RED_NOMBRE[r] || r)
                  : f.real ? (f.real.redes || []).map(r => RED_NOMBRE[r] || r)
                  : f.g.publicadaEn ? Object.keys(f.g.publicadaEn).map(r => RED_NOMBRE[r] || r) : [];
                const fechaPub = f.tipo === 'publicada' ? f.fecha : f.salioEn;
                const vistasProg = f.tipo === 'programada' ? Object.entries(f.g.vistas || {}).filter(([, n]) => n != null) : []; const estPub = fechaPub ? (estadPorFecha.get(fechaPub) || (f.tipo === 'programada' ? { vistas: vistasProg, totalVistas: vistasProg.reduce((s, [, n]) => s + (Number(n) || 0), 0), meGusta: [], totalMeGusta: 0, comentarios: [], totalComentarios: 0 } : null)) : null;
                // Cada publicación (su fila + nota + estadísticas) se dibuja como una tarjeta con relieve; la franja de la izquierda lleva el color del estado de aprobación.
                const hayNota = f.tipo === 'programada' && !!f.g.objecion;
                const clave = f.tipo + f.fecha + f.titulo;
                const desplegable = hayNota || !!estPub;
                const abiertaFila = desplegable && desplegadas.has(clave);
                const accionFila = () => (desplegable ? alternarFila(clave) : abrir(f));
                const acento = f.tipo !== 'programada' ? 'redes-g-sin' : f.g.estado === 'video_objetado' ? 'redes-g-obj' : f.g.estado === 'por_aprobar' ? 'redes-g-pend' : 'redes-g-ok';
                // Pieza programada cuya fecha ya pasó y que no está en ninguna red: toda la fila se marca en rojo con los días que lleva vencida.
                const vencida = f.tipo === 'programada' && !f.salioEn && f.diasVencida != null;
                // Bustral movió la pieza en su calendario: la columna «Programada» muestra la fecha de hoy en Bustral y debajo la original (contra la que se mide el cumplimiento).
                const movida = f.tipo === 'programada' && !!f.g.fechaActual && f.g.fechaActual !== f.g.fecha;
                return (
                  <Fragment key={f.tipo + f.fecha + f.titulo}>
                  <tr className={"redes-fila redes-g redes-g-ini " + acento + (vencida ? " redes-g-venc" : "") + (abiertaFila ? "" : " redes-g-fin")} tabIndex={0} aria-expanded={desplegable ? abiertaFila : undefined} onClick={accionFila} onKeyDown={e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); accionFila(); } }}>
                    <td className="redes-titulo">{desplegable && <span className="redes-chev" aria-hidden="true">{abiertaFila ? '▾' : '▸'}</span>}{f.titulo}</td>
                    <td>{est ? <span className={"badge " + est.clase}>{est.texto}</span> : <span className="redes-sin">Publicada en Bustral</span>}</td>
                    <td>{f.cumpl ? <span className={"badge " + f.cumpl.clase} title={f.cumpl.nota}>{f.cumpl.texto}</span> : <span className="redes-sin">Sin programación en el calendario</span>}</td>
                    <td className="redes-fecha">{f.tipo === 'programada'
                      ? (movida
                        ? <>{fechaCorta(f.g.fechaActual)}<small className="redes-movida">Bustral la movió · fecha original {fechaCorta(f.g.fecha)}</small></>
                        : (vencida ? <span className="redes-fecha-venc">{fechaCorta(f.g.fecha)}</span> : fechaCorta(f.g.fecha)))
                      : <span className="redes-sin">Sin programar</span>}</td>
                    <td className="redes-fecha">
                      {(f.tipo === 'publicada' || f.salioEn) ? <>{fechaCorta(f.tipo === 'publicada' ? f.fecha : f.salioEn)}{((f.tipo === 'publicada' ? f.p : f.real)?.hora) && <> · {(f.tipo === 'publicada' ? f.p : f.real).hora}</>}{redes.length > 0 && <small>{redes.join(' · ')}</small>}</> : vencida ? <span className="redes-aun-venc">Aún no<small>Debió salir el {fechaCorta(f.g.fecha)}: lleva {f.diasVencida} día{f.diasVencida === 1 ? '' : 's'} de retraso</small></span> : <span className="redes-sin">Aún no</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                      {f.tipo === 'programada'
                        ? <a className="redes-bustral" href={BUSTRAL_CALENDARIO} target="_blank" rel="noopener noreferrer">{f.g.estado === 'video_aprobado' || f.g.estado === 'guion_aprobado' ? 'Revisar' : 'Aprobar / objetar'} en Bustral ↗</a>
                        : <span className="redes-sin">—</span>}
                    </td>
                  </tr>
                  {abiertaFila && (
                    <tr className={"redes-fila-exp redes-g redes-g-fin " + acento}>
                      <td colSpan={6}>
                        <div className="redes-exp">
                          {hayNota && <span className="redes-nota-bustral"><b>Nota de Bustral:</b> «{f.g.objecion}»</span>}
                          {estPub && (
                            <div className="redes-stats-linea">
                              {estPub.vistas.length || estPub.meGusta.length || estPub.comentarios.length
                                ? <>
                                    <EstadLinea etiqueta="Vistas" total={estPub.totalVistas} partes={estPub.vistas} />
                                    <EstadLinea etiqueta="Me gusta" total={estPub.totalMeGusta} partes={estPub.meGusta} />
                                    <EstadLinea etiqueta="Comentarios" total={estPub.totalComentarios} partes={estPub.comentarios} />
                                  </>
                                : <span className="redes-sin">Aún no hay estadísticas leídas de esta publicación.</span>}
                            </div>
                          )}
                          <div><button type="button" className="btn-secondary" onClick={() => abrir(f)}>Ver copy y enlaces</button></div>
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr className="redes-g-sep" aria-hidden="true"><td colSpan={6} /></tr>
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

      {todasRedes.length > 0 && (
        <div className="redes-seccion">
          <h3>Todas las publicaciones de las redes</h3>
          <p className="save-hint" style={{margin:'0 0 8px'}}>Cada publicación en cada red (YouTube, Instagram y TikTok) desde el 5 de agosto, con sus vistas, me gusta y comentarios. Usa el menú de cada encabezado para ordenar o filtrar (en «Publicación» se busca por el título de la red y también por el de Bustral); el título abre la publicación en su red. Un guion largo (—) significa que ese dato no se pudo leer (por ejemplo, los comentarios de YouTube y los me gusta de las últimas publicaciones de Instagram, que la red no muestra con número sin acceso de administrador). Leído el {fechaLarga(datos.publicacionesRedes.leido)}; se actualiza al pedir «actualiza redes». Facebook y LinkedIn no se pueden leer sin sesión.</p>
          <p className="save-hint" style={{margin:'0 0 8px'}}>{estadVisibles.length} de {todasRedes.length} publicaciones{hayFiltrosEst && <> · <button type="button" className="clear-filters-link" onClick={limpiarFiltrosEst}>Limpiar filtros de columna</button></>}</p>
          <div className="table-wrap">
            <table className="redes-tabla redes-tabla-estad">
              <thead>
                <tr>
                  {COLUMNAS_ESTAD.map(col => (
                    <ColumnHeaderMenu key={col.key} column={col} sort={ordenEst} onSort={setOrdenEst} filterValue={filtrosEst[col.key]} onFilterChange={setFiltroEst} rows={todasRedes} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {estadVisibles.length === 0 && <tr><td colSpan={6} className="redes-vacio">Ninguna publicación coincide con los filtros.{pendientesBusqueda.length > 0 ? ' Mira el aviso de abajo.' : ''}</td></tr>}
                {estadVisibles.map(e => (
                  <tr key={e.url}>
                    <td className="redes-titulo"><a href={e.url} target="_blank" rel="noopener noreferrer">{e.titulo}</a>{e.tituloBustral && <small className="redes-nombre-bustral">En Bustral: {e.tituloBustral}</small>}</td>
                    <td className="redes-fecha">{fechaCorta(e.fecha)}</td>
                    <td><span className={'redes-envivo-red redes-envivo-' + e.red}>{RED_NOMBRE[e.red] || e.red}</span></td>
                    <td className="redes-num">{e.vistas == null ? <span className="redes-sin">—</span> : fmt(e.vistas)}</td>
                    <td className="redes-num">{e.meGusta == null ? <span className="redes-sin">—</span> : fmt(e.meGusta)}</td>
                    <td className="redes-num">{e.comentarios == null ? <span className="redes-sin">—</span> : fmt(e.comentarios)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pendientesBusqueda.length > 0 && (
            <div className="redes-aviso-pendiente" role="status">
              {pendientesBusqueda.map(p => (
                <p key={p.titulo + p.fecha}>
                  <strong>{p.titulo}</strong> está en el calendario de Bustral para el {fechaCorta(p.fecha)} y <strong>todavía no aparece publicada en ninguna red</strong>{p.vencida ? ' (la fecha programada ya pasó)' : ''}.
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="save-hint">{datos.fuente} Las vistas por publicación solo se ven en YouTube y TikTok (Bustral, Facebook e Instagram no las entregan por pieza; Bustral tampoco mide TikTok, LinkedIn ni Spotify). «Nuevos seguidores del mes» de Instagram se podrá medir cuando se guarde un conteo mensual.</p>

      {abierta && <DetalleRedes f={abierta} onClose={() => setAbierta(null)} />}
    </div>
  );
}

// Una cifra de la línea de estadísticas bajo cada pieza ya publicada del calendario: «Vistas 355 (YouTube 355)»; un guion largo si ninguna red entregó el dato.
function EstadLinea({ etiqueta, total, partes }){
  return (
    <span className="redes-stat">
      <b>{etiqueta}</b>{' '}
      {partes.length
        ? <>{fmt(total)} <small>({partes.map(([r, n]) => (RED_NOMBRE[r] || r) + ' ' + fmt(n)).join(' · ')})</small></>
        : <span className="redes-sin">—</span>}
    </span>
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
