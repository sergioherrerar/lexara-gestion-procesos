import { LOGO_SIDEBAR_DATA_URI } from '../assets/logo';
import { ICON_SVG } from '../config';

const NAV_ITEMS = [
  {view:'dashboard', label:'Dashboard'},
  {view:'procesos', label:'Procesos judiciales'},
  {view:'clientes', label:'Clientes'},
];

export default function Sidebar({ view, onGoView, account, liveMode, onSignOut, mobileOpen }){
  const name = account?.name || account?.username || "Usuario";
  const role = liveMode ? "Sesión Microsoft 365" : (account?.username==="demo@lexara.com" ? "Datos de ejemplo" : "Sesión Microsoft 365 (sin mapear)");
  return (
    <aside className={"sidebar" + (mobileOpen ? " mobile-open" : "")}>
      <img className="wordmark" src={LOGO_SIDEBAR_DATA_URI} alt="Lexara Abogados" />
      <div className="nav-group-label">Principal</div>
      {NAV_ITEMS.map(item => (
        <div
          key={item.view}
          className={"nav-item" + (view===item.view ? " active" : "")}
          onClick={() => onGoView(item.view)}
        >
          <span className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />
          <span className="label-text">{item.label}</span>
        </div>
      ))}
      <div className="nav-group-label">Próximamente</div>
      <div className="nav-item" style={{opacity:.45, cursor:'default'}}><span className="dot"></span><span className="label-text">Facturación</span></div>
      <div className="nav-item" style={{opacity:.45, cursor:'default'}}><span className="dot"></span><span className="label-text">Desistimientos</span></div>
      <div className="nav-group-label">Sistema</div>
      <div className={"nav-item" + (view==='setup' ? " active" : "")} onClick={() => onGoView('setup')}>
        <span className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />
        <span className="label-text">Configuración</span>
      </div>
      <div className="sidebar-foot">
        <div className="user-chip">
          <div className="user-avatar">{name.substring(0,2).toUpperCase()}</div>
          <div>
            <div className="user-name">{name}</div>
            <div className="user-role">{role}</div>
          </div>
        </div>
        <button className="signout" onClick={onSignOut}>Cerrar sesión</button>
      </div>
    </aside>
  );
}
