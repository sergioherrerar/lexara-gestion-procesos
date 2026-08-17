import logoSidebar from '../assets/Logo Blanco.png';
import { ICON_SVG } from '../config';
import { canAccessView } from '../lib/permissions';

const NAV_ITEMS = [
  {view:'dashboard', label:'Dashboard'},
  {view:'informes', label:'Informes'},
  {view:'procesos', label:'Procesos judiciales'},
  {view:'tutelas', label:'Tutelas'},
  {view:'clientes', label:'Clientes'},
  {view:'facturacion', label:'Facturación'},
  {view:'ordenesCompra', label:'Órdenes de compra'},
  {view:'colaboradores', label:'Colaborador Lexara'},
];

// MSAL no siempre entrega account.name relleno (depende de qué claims traiga
// el token) — se prueban varias fuentes antes de caer al correo, y solo al
// genérico "Usuario" si de verdad no hay ningún dato de la cuenta todavía
// (por ejemplo, el instante justo antes de que termine el inicio de sesión).
function resolveDisplayName(account){
  const claims = account?.idTokenClaims || {};
  const nombre = account?.name || claims.name || claims.given_name;
  if(nombre) return nombre;
  const correo = account?.username || claims.preferred_username || claims.email;
  if(correo) return correo.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return "Usuario";
}

export default function Sidebar({ view, onGoView, account, liveMode, accessRole, onSignOut, mobileOpen }){
  const name = resolveDisplayName(account);
  const correo = account?.username || account?.idTokenClaims?.preferred_username || "";
  const sessionLabel = liveMode
    ? (correo || "Sesión Microsoft 365")
    : (account?.username==="demo@lexara.com" ? "Datos de ejemplo" : "Sesión Microsoft 365 (sin mapear)");
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
