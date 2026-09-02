import logoSidebar from '../assets/Logo Blanco.png';
import { canAccessView } from '../lib/permissions';
import { APP_VERSION } from '../config';

// Un ícono propio por módulo (pedido explícito del usuario 2026-08-25) —
// antes todos los ítems del menú usaban la misma marca de Lexara (ICON_SVG,
// el "✕" institucional), y encima solo se veía en el ítem activo (el resto
// quedaba sin ningún ícono). De paso corrige un problema real que ya
// existía en la barra angosta de tablet (`.sidebar{width:72px}`, texto
// oculto): como el ícono viejo solo aparecía en el activo, ahí los demás
// ítems quedaban completamente vacíos/invisibles — con un ícono siempre
// visible por módulo, la barra angosta ahora sí se puede usar.
function IconDashboard(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>;
}
function IconInformes(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>;
}
function IconProcesos(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>;
}
function IconTutelas(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l7 4v6c0 5-3.4 8.5-7 10-3.6-1.5-7-5-7-10V6l7-4z"/></svg>;
}
function IconClientes(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function IconFacturacion(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2h16v20l-3-2-2 2-2-2-2 2-2-2-2 2-3-2V2z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>;
}
function IconOrdenesCompra(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;
}
function IconColaboradores(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><path d="M2 13h20"/></svg>;
}
// Botón para ocultar/mostrar el menú lateral — pedido explícito del usuario
// 2026-09-01. La misma flecha se rota 180° cuando está colapsado (ver
// .sidebar.collapsed .sidebar-collapse-btn en styles.css).
function IconColapsar(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>;
}
function IconConfiguracion(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}

const NAV_ITEMS = [
  {view:'dashboard', label:'Dashboard', icon:<IconDashboard/>},
  {view:'informes', label:'Informes', icon:<IconInformes/>},
  {view:'procesos', label:'Procesos judiciales', icon:<IconProcesos/>},
  {view:'tutelas', label:'Tutelas', icon:<IconTutelas/>},
  {view:'clientes', label:'Clientes', icon:<IconClientes/>},
  {view:'facturacion', label:'Solicitud De Factura E.', icon:<IconFacturacion/>},
  {view:'ordenesCompra', label:'Órdenes de compra', icon:<IconOrdenesCompra/>},
  {view:'administracion', label:'Administración', icon:<IconColaboradores/>},
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

export default function Sidebar({ view, onGoView, account, liveMode, modulosPermitidos, onSignOut, mobileOpen, collapsed, onToggleCollapsed }){
  const name = resolveDisplayName(account);
  const correo = account?.username || account?.idTokenClaims?.preferred_username || "";
  const sessionLabel = liveMode
    ? (correo || "Sesión Microsoft 365")
    : (account?.username==="demo@lexara.com" ? "Datos de ejemplo" : "Sesión Microsoft 365 (sin mapear)");
  const visibleNavItems = NAV_ITEMS.filter(item => canAccessView(modulosPermitidos, item.view));
  const puedeConfiguracion = canAccessView(modulosPermitidos, 'setup');
  return (
    <aside className={"sidebar" + (collapsed ? " collapsed" : "") + (mobileOpen ? " mobile-open" : "")}>
      <button
        type="button" className="sidebar-collapse-btn" onClick={onToggleCollapsed}
        aria-label={collapsed ? "Mostrar menú" : "Ocultar menú"} title={collapsed ? "Mostrar menú" : "Ocultar menú"}
      >
        <IconColapsar/>
      </button>
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
          <span className="nav-item-icon">{item.icon}</span>
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
            <span className="nav-item-icon"><IconConfiguracion/></span>
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
        <div className="app-version">v{APP_VERSION}</div>
      </div>
    </aside>
  );
}
