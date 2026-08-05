import logoSidebar from '../assets/Logo Blanco.png';
import { ICON_SVG } from '../config';
import { canAccessView } from '../lib/permissions';

const NAV_ITEMS = [
  {view:'dashboard', label:'Dashboard'},
  {view:'procesos', label:'Procesos judiciales'},
  {view:'clientes', label:'Clientes'},
  {view:'facturacion', label:'Facturación'},
  {view:'ordenesCompra', label:'Órdenes de compra'},
  {view:'colaboradores', label:'Colaborador Lexara'},
];

export default function Sidebar({ view, onGoView, account, liveMode, accessRole, onSignOut, mobileOpen }){
  const name = account?.name || account?.username || "Usuario";
  const sessionLabel = liveMode ? "Sesión Microsoft 365" : (account?.username==="demo@lexara.com" ? "Datos de ejemplo" : "Sesión Microsoft 365 (sin mapear)");
  const visibleNavItems = NAV_ITEMS.filter(item => canAccessView(accessRole, item.view));
  const puedeConfiguracion = canAccessView(accessRole, 'setup');
  return (
    <aside className={"sidebar" + (mobileOpen ? " mobile-open" : "")}>
      <div className="sidebar-logo"><img src={logoSidebar} alt="Lexara Abogados" /></div>
      <div className="nav-group-label">Principal</div>
      {visibleNavItems.map(item => (
        <div
          key={item.view}
          className={"nav-item" + (view===item.view ? " active" : "")}
          onClick={() => onGoView(item.view)}
          role="button" tabIndex={0}
          onKeyDown={e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); onGoView(item.view); } }}
        >
          <span className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />
          <span className="label-text">{item.label}</span>
        </div>
      ))}
      <div className="nav-group-label">Próximamente</div>
      <div className="nav-item" style={{opacity:.45, cursor:'default'}}><span className="dot"></span><span className="label-text">Desistimientos</span></div>
      {puedeConfiguracion && (
        <>
          <div className="nav-group-label">Sistema</div>
          <div
            className={"nav-item" + (view==='setup' ? " active" : "")}
            onClick={() => onGoView('setup')}
            role="button" tabIndex={0}
            onKeyDown={e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); onGoView('setup'); } }}
          >
            <span className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />
            <span className="label-text">Configuración</span>
          </div>
        </>
      )}
      <div className="sidebar-foot">
        <div className="user-chip">
          <div className="user-avatar">{name.substring(0,2).toUpperCase()}</div>
          <div>
            <div className="user-name">{name}</div>
            <div className="user-role">{sessionLabel}</div>
          </div>
        </div>
        <button className="signout" onClick={onSignOut}>Cerrar sesión</button>
      </div>
    </aside>
  );
}
