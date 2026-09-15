import { useState, useRef, useEffect } from 'react';
import IconButton from './IconButton';
import MiniCalendarioAudienciasTerminos from './MiniCalendarioAudienciasTerminos';
import miniVerdeOscuro from '../assets/Mini verde oscuro.png';

// "informes"/"tutelas" faltaban acá desde que se agregaron esos módulos (el
// <h2> caía al fallback TITLES[view]||view y mostraba el string crudo en
// minúsculas) — corregido de paso al agregar "administracion".
const TITLES = {dashboard:"Dashboard", informes:"Informes", procesos:"Procesos judiciales", tutelas:"Tutelas", clientes:"Clientes", facturacion:"Solicitud De Factura E.", ordenesCompra:"Órdenes de compra", administracion:"Administración", setup:"Configuración"};

// Botón del mini calendario en la cabecera del portal — pedido explícito del
// usuario 2026-09-15: "que viva en la cabecera del portal al lado donde dice
// Conectado a SharePoint" (con un dibujo señalando el espacio libre entre esa
// franja y el buscador). El calendario en sí (MiniCalendarioAudienciasTerminos)
// es demasiado alto para ir siempre visible en una barra angosta, así que
// vive en un desplegable — mismo patrón de clic-afuera-para-cerrar que ya usa
// ColumnHeaderMenu.jsx.
function BotonCalendarioTopbar({ audiencias, terminos, procesos, liveMode, onCrearEventoPersonalizado, notify }){
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
      </button>
      {abierto && (
        <div className="topbar-calendario-popover">
          <MiniCalendarioAudienciasTerminos
            audiencias={audiencias} terminos={terminos} procesos={procesos}
            liveMode={liveMode} onCrearEventoPersonalizado={onCrearEventoPersonalizado} notify={notify}
          />
        </div>
      )}
    </div>
  );
}

export default function Topbar({ view, liveMode, searchQuery, onSearch, onOpenMobileNav, onRefresh, refreshing, cargandoInicial, audiencias, terminos, procesos, onCrearEventoPersonalizado, notify }){
  const cargando = refreshing || cargandoInicial;
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
        audiencias={audiencias} terminos={terminos} procesos={procesos}
        liveMode={liveMode} onCrearEventoPersonalizado={onCrearEventoPersonalizado} notify={notify}
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
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
        />
      </div>
    </div>
  );
}
