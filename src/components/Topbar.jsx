import { useState, useRef, useEffect, useMemo } from 'react';
import IconButton from './IconButton';
import MiniCalendarioAudienciasTerminos from './MiniCalendarioAudienciasTerminos';
import miniVerdeOscuro from '../assets/Mini verde oscuro.png';
import { pendientesDePersona } from '../lib/pendientesPersona';

// "informes"/"tutelas" faltaban acá desde que se agregaron esos módulos (el
// <h2> caía al fallback TITLES[view]||view y mostraba el string crudo en
// minúsculas) — corregido de paso al agregar "administracion".
const TITLES = {dashboard:"Dashboard", informes:"Informes", procesos:"Procesos judiciales", tutelas:"Tutelas", clientes:"Clientes", facturacion:"Solicitud De Factura E.", ordenesCompra:"Órdenes de compra", vencimientos:"Vencimientos", administracion:"Administración", setup:"Configuración"};

// Estas vistas ya traen su propio encabezado grande (el <h1> con la línea dorada) con el MISMO texto: repetirlo en la barra superior era redundante
// (reporte del usuario 2026-10-29, «aquí dice igual»). Dashboard («Panorama general») y Configuración sí tienen un título distinto y lo conservan.
const VISTAS_CON_TITULO_PROPIO = new Set(['informes', 'procesos', 'tutelas', 'clientes', 'facturacion', 'ordenesCompra', 'vencimientos', 'administracion']);

// Botón del mini calendario en la cabecera del portal — pedido explícito del
// usuario 2026-09-15: "que viva en la cabecera del portal al lado donde dice
// Conectado a SharePoint" (con un dibujo señalando el espacio libre entre esa
// franja y el buscador). El calendario en sí (MiniCalendarioAudienciasTerminos)
// es demasiado alto para ir siempre visible en una barra angosta, así que
// vive en un desplegable — mismo patrón de clic-afuera-para-cerrar que ya usa
// ColumnHeaderMenu.jsx.
function BotonCalendarioTopbar({ audiencias, terminos, pendientes, procesos, tiposAccion, colaboradores, liveMode, onCrearEventoPersonalizado, onListarOtrosEventosDelMes, onCrearAudiencia, onCrearTermino, onCreateTipoTermino, onCrearPendiente, canWrite, notify }){
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if(!abierto) return;
    function onDocPointer(e){ if(ref.current && !ref.current.contains(e.target)) setAbierto(false); }
    function onKeyDown(e){ if(e.key === 'Escape') setAbierto(false); }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [abierto]);

  return (
    <div className="topbar-calendario-wrap" ref={ref}>
      <button type="button" className="topbar-calendario-btn" onClick={() => setAbierto(v => !v)} aria-label="Ver mini calendario de Audiencias/Términos">
        <img src={miniVerdeOscuro} alt="" />
        <span className="topbar-calendario-label">Calendario</span>
      </button>
      {abierto && (
        <div className="topbar-calendario-popover">
          <MiniCalendarioAudienciasTerminos
            audiencias={audiencias} terminos={terminos} pendientes={pendientes} procesos={procesos}
            tiposAccion={tiposAccion} colaboradores={colaboradores}
            liveMode={liveMode} onCrearEventoPersonalizado={onCrearEventoPersonalizado}
            onListarOtrosEventosDelMes={onListarOtrosEventosDelMes}
            onCrearAudiencia={onCrearAudiencia} onCrearTermino={onCrearTermino} onCreateTipoTermino={onCreateTipoTermino}
            onCrearPendiente={onCrearPendiente} canWrite={canWrite} notify={notify}
          />
        </div>
      )}
    </div>
  );
}

// Campana de pendientes (2026-11-03, pedido del usuario: «una campana con los pendientes, audiencias y términos que tenga cada persona asignado, según el perfil que entre»): el número es
// lo que la persona que inició sesión tiene por atender; al hacer clic se despliega la lista. Va junto al buscador, mismo patrón de desplegable que el calendario.
const TIPOS_CAMPANA = {
  audiencias: { label: 'Audiencia', plural: 'Audiencias', cls: 'badge-tipo-audiencia' },
  terminos:   { label: 'Término',   plural: 'Términos',   cls: 'badge-tipo-termino' },
  pendientes: { label: 'Pendiente', plural: 'Pendientes', cls: 'badge-tipo-pendiente' },
  tutelas:    { label: 'Tutela',    plural: 'Tutelas',    cls: 'badge-tipo-termino' },
};
function fechaCorta(iso){ const [y, m, d] = String(iso || '').split('-'); return y && m && d ? `${d}/${m}/${y}` : 'Sin fecha'; }

function CampanaPendientes({ nombre, puedeVerEquipo, audiencias, terminos, pendientes, procesos, tutelas, onIrAVencimientos }){
  const [abierto, setAbierto] = useState(false);
  const [verEquipo, setVerEquipo] = useState(false);   // Administrador y Jefe pueden ver lo de todo el equipo
  const ref = useRef(null);
  useEffect(() => {
    if(!abierto) return;
    function onDocPointer(e){ if(ref.current && !ref.current.contains(e.target)) setAbierto(false); }
    function onKeyDown(e){ if(e.key === 'Escape') setAbierto(false); }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('mousedown', onDocPointer); document.removeEventListener('keydown', onKeyDown); };
  }, [abierto]);
  const filas = useMemo(() => pendientesDePersona({ nombre: verEquipo ? '' : nombre, audiencias, terminos, pendientes, procesos, tutelas }), [nombre, verEquipo, audiencias, terminos, pendientes, procesos, tutelas]);
  const urgentes = filas.filter(f => f.vencido || f.color === 'rojo').length;
  const conteo = tipo => filas.filter(f => f.tipo === tipo).length;
  return (
    <div className="topbar-campana-wrap" ref={ref}>
      <button type="button" className={"topbar-campana-btn" + (abierto ? " abierto" : "")} onClick={() => setAbierto(v => !v)}
        aria-label={filas.length ? `Tienes ${filas.length} pendientes` : 'No tienes pendientes'} aria-expanded={abierto} title="Mis pendientes">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        {filas.length > 0 && <span className={"topbar-campana-badge" + (urgentes ? " urgente" : "")}>{filas.length > 99 ? '99+' : filas.length}</span>}
      </button>
      {abierto && (
        <div className="topbar-campana-popover" role="dialog" aria-label="Mis pendientes">
          <div className="campana-cab">
            <strong>{nombre && !verEquipo ? 'Mis pendientes' : 'Pendientes de todo el equipo'}</strong>
            <span>{nombre || 'Modo demo'}</span>
          </div>
          {puedeVerEquipo && nombre && (
            <div className="campana-modo">
              <button type="button" className={verEquipo ? '' : 'activo'} onClick={() => setVerEquipo(false)}>Mis pendientes</button>
              <button type="button" className={verEquipo ? 'activo' : ''} onClick={() => setVerEquipo(true)}>Todo el equipo</button>
            </div>
          )}
          <div className="campana-resumen">
            {Object.entries(TIPOS_CAMPANA).map(([k, t]) => <span key={k} className={"badge " + t.cls}>{t.plural} {conteo(k)}</span>)}
          </div>
          <div className="campana-lista">
            {filas.length === 0 && <p className="campana-vacia">No tienes audiencias, términos ni pendientes por atender. ¡Todo al día!</p>}
            {filas.map(f => (
              <div key={f.clave} className="campana-item">
                <div className="campana-item-fila">
                  <span className={"badge " + TIPOS_CAMPANA[f.tipo].cls}>{TIPOS_CAMPANA[f.tipo].label}</span>
                  <span className={"badge badge-" + f.color}>{f.etiqueta}</span>
                </div>
                <div className="campana-item-texto">{f.texto || '—'}</div>
                <div className="campana-item-meta">
                  {fechaCorta(f.fecha)}{f.hora ? ' · ' + f.hora : ''}{f.radicado ? ' · ' + f.radicado : ''}{f.cliente ? ' · ' + f.cliente : ''}{verEquipo && f.responsable ? ' · ' + f.responsable : ''}
                </div>
              </div>
            ))}
          </div>
          {onIrAVencimientos && <button type="button" className="campana-pie" onClick={() => { setAbierto(false); onIrAVencimientos(); }}>Ver todo en Vencimientos</button>}
        </div>
      )}
    </div>
  );
}

export default function Topbar({ nombreActual, puedeVerEquipo, tutelas, onIrAVencimientos, view, liveMode, searchQuery, onSearch, onOpenMobileNav, onRefresh, refreshing, cargandoInicial, audiencias, terminos, pendientes, procesos, tiposAccion, colaboradores, onCrearEventoPersonalizado, onListarOtrosEventosDelMes, onCrearAudiencia, onCrearTermino, onCreateTipoTermino, onCrearPendiente, canWrite, notify }){
  const cargando = refreshing || cargandoInicial;
  // Búsqueda con espera de 250ms: el texto del cuadro se actualiza al instante,
  // pero el filtrado de las tablas (miles de filas, y todo App se vuelve a
  // dibujar) solo corre cuando el usuario deja de teclear — antes corría en
  // CADA letra.
  const [textoBusqueda, setTextoBusqueda] = useState(searchQuery);
  const ultimoEnviado = useRef(searchQuery);
  useEffect(() => {
    // Cambio hecho desde afuera (ej. al cambiar de módulo se limpia la búsqueda).
    if(searchQuery !== ultimoEnviado.current){
      ultimoEnviado.current = searchQuery;
      setTextoBusqueda(searchQuery);
    }
  }, [searchQuery]);
  useEffect(() => {
    if(textoBusqueda === ultimoEnviado.current) return;
    const t = setTimeout(() => { ultimoEnviado.current = textoBusqueda; onSearch(textoBusqueda); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoBusqueda]);
  return (
    <div className="topbar">
      <button className="mobile-nav-btn" aria-label="Abrir menú" onClick={onOpenMobileNav}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <div>
        <div className="eyebrow" style={{display:'flex', alignItems:'center', gap:8}}>
          <span className={"status-pill " + (liveMode ? "status-live" : "status-demo")}>
            {liveMode ? "Conectado a SharePoint" : "Modo demo"}
          </span>
          {liveMode && (
            <IconButton
              icon="refresh"
              variant="refresh"
              label={cargandoInicial ? "Cargando datos de SharePoint…" : refreshing ? "Actualizando…" : "Actualizar datos desde SharePoint"}
              spinning={cargando}
              onClick={onRefresh}
            />
          )}
          {cargandoInicial && <span className="status-pill status-loading">Cargando datos…</span>}
        </div>
        {!VISTAS_CON_TITULO_PROPIO.has(view) && <h2>{TITLES[view] || view}</h2>}
      </div>
      <BotonCalendarioTopbar
        audiencias={audiencias} terminos={terminos} pendientes={pendientes} procesos={procesos}
        tiposAccion={tiposAccion} colaboradores={colaboradores}
        liveMode={liveMode} onCrearEventoPersonalizado={onCrearEventoPersonalizado}
        onListarOtrosEventosDelMes={onListarOtrosEventosDelMes}
        onCrearAudiencia={onCrearAudiencia} onCrearTermino={onCrearTermino} onCreateTipoTermino={onCreateTipoTermino}
        onCrearPendiente={onCrearPendiente} canWrite={canWrite} notify={notify}
      />
      <div className="topbar-derecha">
      <CampanaPendientes nombre={nombreActual} puedeVerEquipo={puedeVerEquipo} tutelas={tutelas} audiencias={audiencias} terminos={terminos} pendientes={pendientes} procesos={procesos} onIrAVencimientos={onIrAVencimientos} />
      <div className="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input
          type="text"
          placeholder={
            view === 'clientes' ? "Buscar por razón social, NIT, correo o dirección…" :
            view === 'facturacion' ? "Buscar por no. de factura, contrato o cliente…" :
            view === 'ordenesCompra' ? "Buscar por no. de orden, contrato o cliente…" :
            view === 'administracion' ? "Buscar por nombre, correo o cargo…" :
            "Buscar por numero corto, cliente o apoderado…"
          }
          value={textoBusqueda}
          onChange={e => setTextoBusqueda(e.target.value)}
        />
      </div>
      </div>
    </div>
  );
}
