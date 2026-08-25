import IconButton from './IconButton';

// "informes"/"tutelas" faltaban acá desde que se agregaron esos módulos (el
// <h2> caía al fallback TITLES[view]||view y mostraba el string crudo en
// minúsculas) — corregido de paso al agregar "administracion".
const TITLES = {dashboard:"Dashboard", informes:"Informes", procesos:"Procesos judiciales", tutelas:"Tutelas", clientes:"Clientes", facturacion:"Solicitud De Factura E.", ordenesCompra:"Órdenes de compra", administracion:"Administración", setup:"Configuración"};

export default function Topbar({ view, liveMode, searchQuery, onSearch, onOpenMobileNav, onRefresh, refreshing, cargandoInicial }){
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
