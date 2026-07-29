import logoLogin from '../assets/Logo verde OScuro.png';

export default function LoginScreen({ config, onSignIn, onEnterDemo, onGoSetup }){
  return (
    <div id="login-screen">
      <div className="login-visual">
        <div className="chevrons">
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 20 L50 46 L88 20 L88 34 L50 60 L12 34 Z" fill="#52bbb5" opacity="0.9"/>
            <path d="M12 62 L50 88 L88 62" stroke="#52bbb5" strokeWidth="10" fill="none" opacity="0.35"/>
          </svg>
        </div>
        <div className="caption">
          Lexara centraliza cada número corto, término y audiencia del despacho en un solo lugar — conectado en vivo con SharePoint.
        </div>
      </div>
      <div className="login-panel">
        <div className="login-box">
          <div className="brand-logo-wrap"><img src={logoLogin} alt="Lexara Abogados" /></div>
          <h1>Gestión de procesos</h1>
          <p className="sub">Inicia sesión con tu cuenta de Microsoft 365 del despacho para acceder a los procesos judiciales.</p>
          <button className="btn-msal" onClick={onSignIn}>
            <svg viewBox="0 0 21 21" fill="none"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
            Iniciar sesión con Microsoft
          </button>
          <button className="login-demo" onClick={onEnterDemo}>Explorar en modo demo (datos de ejemplo)</button>
          {!(config.CLIENT_ID && config.TENANT_ID) && (
            <div className="config-banner">
              Esta instancia aún no tiene configurado <span className="code-inline">CLIENT_ID</span> / <span className="code-inline">TENANT_ID</span>.
              <a onClick={onGoSetup}> Ver instrucciones de configuración →</a>
            </div>
          )}
          <div className="login-foot">¿Problemas para ingresar? Contacta al administrador del sitio SharePoint <strong>NuevosProcesosMD</strong>.</div>
        </div>
      </div>
    </div>
  );
}
