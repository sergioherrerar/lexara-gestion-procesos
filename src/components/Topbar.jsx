import IconButton from './IconButton';

const TITLES = {dashboard:"Dashboard", procesos:"Procesos judiciales", clientes:"Clientes", facturacion:"Facturación", ordenesCompra:"Órdenes de compra", setup:"Configuración"};

export default function Topbar({ view, liveMode, searchQuery, onSearch, onOpenMobileNav, onRefresh, refreshing }){
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
              label={refreshing ? "Actualizando…" : "Actualizar datos desde SharePoint"}
              spinning={refreshing}
              onClick={onRefresh}
            />
          )}
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
            "Buscar por numero corto, cliente o apoderado…"
          }
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
        />
      </div>
    </div>
  );
}
