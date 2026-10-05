import { useState, useRef, useEffect } from 'react';
import IconButton from './IconButton';
import MiniCalendarioAudienciasTerminos from './MiniCalendarioAudienciasTerminos';
import miniVerdeOscuro from '../assets/Mini verde oscuro.png';

// "informes"/"tutelas" faltaban acá desde que se agregaron esos módulos (el
// <h2> caía al fallback TITLES[view]||view y mostraba el string crudo en
// minúsculas) — corregido de paso al agregar "administracion".
const TITLES = {dashboard:"Dashboard", informes:"Informes", procesos:"Procesos judiciales", tutelas:"Tutelas", clientes:"Clientes", facturacion:"Solicitud De Factura E.", ordenesCompra:"Órdenes de compra", vencimientos:"Vencimientos", administracion:"Administración", setup:"Configuración"};

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

export default function Topbar({ view, liveMode, searchQuery, onSearch, onOpenMobileNav, onRefresh, refreshing, cargandoInicial, audiencias, terminos, pendientes, procesos, tiposAccion, colaboradores, onCrearEventoPersonalizado, onListarOtrosEventosDelMes, onCrearAudiencia, onCrearTermino, onCreateTipoTermino, onCrearPendiente, canWrite, notify }){
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
        <h2>{TITLES[view] || view}</h2>
      </div>
      <BotonCalendarioTopbar
        audiencias={audiencias} terminos={terminos} pendientes={pendientes} procesos={procesos}
        tiposAccion={tiposAccion} colaboradores={colaboradores}
        liveMode={liveMode} onCrearEventoPersonalizado={onCrearEventoPersonalizado}
        onListarOtrosEventosDelMes={onListarOtrosEventosDelMes}
        onCrearAudiencia={onCrearAudiencia} onCrearTermino={onCrearTermino} onCreateTipoTermino={onCreateTipoTermino}
        onCrearPendiente={onCrearPendiente} canWrite={canWrite} notify={notify}
      />
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
  );
}
