/* =========================================================================
   CONFIG — edítalo directamente aquí para dejar la conexión fija en producción.
========================================================================= */
const CONFIG = {
  CLIENT_ID: "8bf7069f-55e7-47ae-bea2-f1f0aa38657d",   // ID de aplicación (cliente) de Azure AD — registro "Lexara–Procesos"
  TENANT_ID: "a89ceaa6-c4df-4b18-93a7-65dfa57a5541",   // ID de directorio (inquilino) — "md abogados sas"
  SP_HOST: "mydabogados.sharepoint.com",
  SP_SITE_PATH: "/sites/NuevosProcesosMD",
  REDIRECT_URI: window.location.href.split('#')[0].split('?')[0],
};

/* =========================================================================
   REGISTRO DE LISTAS DE SHAREPOINT
   Cada lista de SharePoint que la app usa se define una sola vez aquí:
   su nombre real, sus campos semánticos (con pistas para adivinar el
   mapeo) y el mapeo fijo ya confirmado columna-por-columna. Para agregar
   una lista nueva (Facturación, Desistimientos, ...) basta con sumar una
   entrada aquí y su vista de tabla — no hace falta tocar la lógica de
   conexión ni de mapeo, que es genérica para todas.
========================================================================= */
const SHAREPOINT_LISTS = [
  {
    key: "procesos",
    listName: "Procesos Judiciales",
    label: "Procesos judiciales",
    semanticFields: [
      {key:"Radicado", label:"Numero_Corto", hint:["radicado"], required:true},
      {key:"Cliente", label:"Cliente", hint:["cliente","demandante"], required:true},
      {key:"Apoderado", label:"Apoderado", hint:["apoderad"]},
      {key:"Despacho", label:"Despacho / juzgado", hint:["despacho","juzgado","corte"]},
      {key:"NumeroDespacho", label:"No. de despacho", hint:["numero de despacho","numero despacho","número de despacho"]},
      {key:"Instancia", label:"Instancia", hint:["instancia"]},
      {key:"TipoProceso", label:"Tipo de proceso", hint:["tipo de proceso","tipoproceso","tipo_proceso"]},
      {key:"TipoAccion", label:"Tipo de Acción", hint:["tipo de accion","tipo de acción","tipoaccion"]},
      {key:"NumeroContrato", label:"No. de contrato", hint:["contrato"]},
      {key:"EtapaProcesal", label:"Etapa procesal", hint:["etapa"]},
      {key:"Estado", label:"Estado", hint:["estado"], required:true},
      {key:"FechaAdmision", label:"Fecha de admisión", hint:["admision","admisión"]},
      {key:"FechaContestacion", label:"Fecha de contestación", hint:["contestacion","contestación"]},
      {key:"CalificacionContingencia", label:"Calificación de contingencia", hint:["calificacion","calificación","conting"]},
      {key:"EstadoVT", label:"Estado V/T", hint:["estado v/t","estado vt"]},
      {key:"Observaciones", label:"Observaciones", hint:["observ"]},
      {key:"LinkCarpeta", label:"Link a la carpeta", hint:["link carpeta","carpetas"]},
    ],
    mapping: {
      Radicado: "numero_x0020_corto",
      Cliente: "Cliente",
      Apoderado: "Apoderada",
      Despacho: "Despacho",
      NumeroDespacho: "numero_x0020_de_x0020_despacho",
      Instancia: "Instancia",
      TipoProceso: "Tipo_x0020_de_x0020_Proceso",
      TipoAccion: "Tipo_x0020_de_x0020_Accion",
      NumeroContrato: "No_x0020_Contrato",
      EtapaProcesal: "Etapa_x0020_Procesal",
      Estado: "Estado",
      FechaAdmision: "Fecha_x0020_Admision_x0020_del_x",
      FechaContestacion: "Fecha_x0020_Contestacion_x0020_d",
      CalificacionContingencia: "Calificacion_de_la_contingencia",
      EstadoVT: "Estado_x0020_V_x002f_T",
      Observaciones: "Observaciones",
      LinkCarpeta: "Link_x0020_Carpetas",
    },
  },
  {
    key: "clientes",
    listName: "Clientes",
    label: "Clientes",
    semanticFields: [
      {key:"RazonSocial", label:"Razón social", hint:["razon social","razón social"], required:true},
      {key:"Nit", label:"NIT", hint:["nit"]},
      {key:"Direccion", label:"Dirección", hint:["direccion","dirrección","dirreccion"]},
      {key:"Telefono", label:"Teléfono", hint:["telefono","teléfono"]},
      {key:"Correo", label:"Correo", hint:["correo"]},
      {key:"Entidad", label:"Entidad", hint:["entidad"]},
    ],
    mapping: {
      RazonSocial: "RAZON_x0020_SOCIAL",
      Nit: "NIT",
      Direccion: "DIRRECCION",
      Telefono: "TELEFONO",
      Correo: "CORREO",
      Entidad: "Entidad",
    },
  },
];
function listByKey(key){ return SHAREPOINT_LISTS.find(l => l.key===key); }

let liveMode = false;
let msalInstance = null;
let account = null;
let procesos = [];
let clientes = [];
let activeProceso = null;
let currentFilter = "todos";
let siteId = null;

/* ---------------- Demo data (se usa mientras no haya conexión real) ---------------- */
const DEMO_PROCESOS = [
  {id:1, Radicado:"11001-31-03-045-2023-00218-00", Cliente:"Grupo Andino S.A.S.", Apoderado:"María Fernanda Ruiz", Despacho:"Juzgado 45 Civil del Circuito de Bogotá", Instancia:"Primera instancia", Estado:"En trámite", EtapaProcesal:"Período probatorio", TipoProceso:"Ejecutivo", NumeroContrato:"CT-2023-118", FechaAdmision:"2023-05-12", FechaContestacion:"2023-06-30", CalificacionContingencia:"Media", Observaciones:"Pendiente dictamen pericial contable."},
  {id:2, Radicado:"05001-31-03-012-2022-00341-00", Cliente:"Constructora del Sur Ltda.", Apoderado:"Carlos Andrés Peña", Despacho:"Juzgado 12 Civil del Circuito de Medellín", Instancia:"Segunda instancia", Estado:"En apelación", EtapaProcesal:"Alegatos de conclusión", TipoProceso:"Ordinario", NumeroContrato:"CT-2022-076", FechaAdmision:"2022-09-03", FechaContestacion:"2022-11-15", CalificacionContingencia:"Alta", Observaciones:"Riesgo de fallo desfavorable, revisar con el cliente."},
  {id:3, Radicado:"76001-31-03-008-2024-00092-00", Cliente:"Inversiones Cali Norte", Apoderado:"María Fernanda Ruiz", Despacho:"Juzgado 8 Civil del Circuito de Cali", Instancia:"Primera instancia", Estado:"Admitida", EtapaProcesal:"Traslado de la demanda", TipoProceso:"Verbal", NumeroContrato:"CT-2024-004", FechaAdmision:"2024-02-20", FechaContestacion:"", CalificacionContingencia:"Baja", Observaciones:""},
  {id:4, Radicado:"11001-31-03-021-2021-00567-00", Cliente:"Grupo Andino S.A.S.", Apoderado:"Jorge Iván Salcedo", Despacho:"Juzgado 21 Civil del Circuito de Bogotá", Instancia:"Casación", Estado:"En corte", EtapaProcesal:"Traslado en casación", TipoProceso:"Ordinario", NumeroContrato:"CT-2021-201", FechaAdmision:"2021-04-18", FechaContestacion:"2021-07-02", CalificacionContingencia:"Alta", Observaciones:"Enviado a la Corte Suprema desde marzo."},
  {id:5, Radicado:"13001-31-03-003-2023-00450-00", Cliente:"Distribuidora Caribe SAS", Apoderado:"Carlos Andrés Peña", Despacho:"Juzgado 3 Civil del Circuito de Cartagena", Instancia:"Primera instancia", Estado:"Terminado", EtapaProcesal:"Sentencia en firme", TipoProceso:"Ejecutivo", NumeroContrato:"CT-2023-055", FechaAdmision:"2023-01-30", FechaContestacion:"2023-03-11", CalificacionContingencia:"Baja", Observaciones:"Fallo a favor. Pendiente archivar expediente."},
];

const DEMO_CLIENTES = [
  {id:1, RazonSocial:"Grupo Andino S.A.S.", Nit:"900.123.456-7", Direccion:"Calle 100 #15-20, Bogotá", Telefono:"601 654 3210", Correo:"contacto@grupoandino.com", Entidad:"Privada"},
  {id:2, RazonSocial:"Constructora del Sur Ltda.", Nit:"890.234.567-1", Direccion:"Carrera 43A #30-10, Medellín", Telefono:"604 512 3344", Correo:"info@constructorasur.com", Entidad:"Privada"},
  {id:3, RazonSocial:"Inversiones Cali Norte", Nit:"805.345.678-2", Direccion:"Avenida 6N #28-45, Cali", Telefono:"602 660 7788", Correo:"admin@calinorte.com", Entidad:"Privada"},
  {id:4, RazonSocial:"Distribuidora Caribe SAS", Nit:"812.456.789-3", Direccion:"Calle 35 #22-18, Cartagena", Telefono:"605 690 1122", Correo:"ventas@distcaribe.com", Entidad:"Privada"},
];

/* ---------------- Iconografía (motivo del logo, dos chevrones) ---------------- */
const ICON_SVG = `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 30 L50 50 L80 30" stroke="currentColor" stroke-width="14" fill="none" stroke-linecap="square"/><path d="M20 70 L50 50 L80 70" stroke="currentColor" stroke-width="14" fill="none" stroke-linecap="square"/></svg>`;
document.querySelectorAll('.nav-item .mark').forEach(el => el.innerHTML = ICON_SVG);

/* ---------------- Config persistence (memoria de sesión, sin localStorage) ---------------- */
function loadConfigIntoForm(){
  document.getElementById('cfg-client').value = CONFIG.CLIENT_ID;
  document.getElementById('cfg-tenant').value = CONFIG.TENANT_ID;
  document.getElementById('cfg-host').value = CONFIG.SP_HOST;
  document.getElementById('cfg-site').value = CONFIG.SP_SITE_PATH;
  refreshConfigBanner();
}
function refreshConfigBanner(){
  const banner = document.getElementById('config-banner');
  if(!banner) return;
  banner.style.display = (CONFIG.CLIENT_ID && CONFIG.TENANT_ID) ? 'none' : 'block';
}
function saveConfig(){
  CONFIG.CLIENT_ID = document.getElementById('cfg-client').value.trim();
  CONFIG.TENANT_ID = document.getElementById('cfg-tenant').value.trim();
  CONFIG.SP_HOST = document.getElementById('cfg-host').value.trim();
  CONFIG.SP_SITE_PATH = document.getElementById('cfg-site').value.trim();
  refreshConfigBanner();
  if(CONFIG.CLIENT_ID && CONFIG.TENANT_ID){
    initMsal();
    setTestStatus("Credenciales guardadas. Ahora pulsa \"Conectar y leer columnas\".", false);
  } else {
    setTestStatus("Guarda al menos el Client ID y el Tenant ID.", true);
  }
}
function clearConfig(){
  CONFIG.CLIENT_ID = ""; CONFIG.TENANT_ID = "";
  loadConfigIntoForm();
  document.getElementById('mapping-area').innerHTML = "";
}
function goSetup(){ document.getElementById('login-screen').style.display='none'; enterDemo(true); goView('setup'); }
function setTestStatus(msg, isError){
  const el = document.getElementById('test-status');
  if(!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#b3590a" : "var(--texto-suave)";
}

/* ---------------- MSAL (Microsoft Graph login) ---------------- */
function initMsal(){
  if(!window.msal || !CONFIG.CLIENT_ID || !CONFIG.TENANT_ID) return;
  msalInstance = new msal.PublicClientApplication({
    auth:{
      clientId: CONFIG.CLIENT_ID,
      authority: `https://login.microsoftonline.com/${CONFIG.TENANT_ID}`,
      redirectUri: CONFIG.REDIRECT_URI,
    },
    cache:{ cacheLocation:"sessionStorage" }
  });
}
async function ensureSignedIn(){
  if(!CONFIG.CLIENT_ID || !CONFIG.TENANT_ID){
    throw new Error("Falta configurar Client ID y Tenant ID.");
  }
  if(!msalInstance) initMsal();
  if(!msalInstance){
    throw new Error("No se pudo cargar la librería de inicio de sesión de Microsoft (MSAL). Verifica tu conexión a internet, y recarga la página.");
  }
  if(!account){
    const res = await msalInstance.loginPopup({ scopes:["User.Read","Sites.ReadWrite.All"] });
    account = res.account;
  }
}
function allRequiredMapped(){
  return SHAREPOINT_LISTS.every(list => list.semanticFields.filter(f => f.required).every(f => list.mapping[f.key]));
}
async function signIn(){
  if(!CONFIG.CLIENT_ID || !CONFIG.TENANT_ID){
    alert("Primero configura Client ID y Tenant ID en la sección de Configuración.");
    goSetup();
    return;
  }
  try{
    await ensureSignedIn();
    // Si ya hay mapeo definido (fijo en el código) para todas las listas, entra directo en vivo.
    if(allRequiredMapped()){
      await ensureSite();
      for(const list of SHAREPOINT_LISTS){ await connectList(list); transformListItems(list); }
      applyLoadedLists();
      liveMode = true;
      enterApp();
    } else {
      document.getElementById('login-screen').style.display='none';
      document.getElementById('app').classList.add('active');
      updateUserChip("Conectando…", "status-demo");
      goView('setup');
      await testConnection();
    }
  }catch(err){
    console.error(err);
    alert("No fue posible iniciar sesión. Revisa la consola para más detalle.");
  }
}
async function getGraphToken(){
  const res = await msalInstance.acquireTokenSilent({ scopes:["Sites.ReadWrite.All"], account });
  return res.accessToken;
}
async function graphFetch(path, opts){
  const token = await getGraphToken();
  const res = await fetch(path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`, {
    ...opts,
    headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json", ...(opts&&opts.headers||{}) }
  });
  if(!res.ok){
    const body = await res.text();
    throw new Error(`Graph ${res.status}: ${body.substring(0,300)}`);
  }
  return res.status===204 ? null : res.json();
}

/* ---------------- Descubrir sitio, listas, columnas y elementos reales ---------------- */
async function ensureSite(){
  if(siteId) return;
  const site = await graphFetch(`/sites/${CONFIG.SP_HOST}:${CONFIG.SP_SITE_PATH}`);
  siteId = site.id;
}
function normalize(str){
  return (str||"").toLowerCase().normalize("NFD").split("").filter(ch => {
    const code = ch.charCodeAt(0);
    return code < 0x0300 || code > 0x036f; // descarta marcas diacríticas combinantes
  }).join("");
}
async function connectList(list){
  const listsRes = await graphFetch(`/sites/${siteId}/lists?$select=id,name,displayName`);
  const allLists = listsRes.value || [];
  const found = allLists.find(l => normalize(l.displayName) === normalize(list.listName) || normalize(l.name) === normalize(list.listName));
  if(!found){
    const disponibles = allLists.map(l => l.displayName).join(", ") || "(ninguna)";
    throw new Error(`No se encontró una lista llamada "${list.listName}" en el sitio. Listas disponibles: ${disponibles}`);
  }
  list.listId = found.id;
  const colsRes = await graphFetch(`/sites/${siteId}/lists/${list.listId}/columns`);
  list.columns = (colsRes.value||[]).filter(c => !c.hidden && c.name!=="ContentType" && !c.readOnly);
  const itemsRes = await graphFetch(`/sites/${siteId}/lists/${list.listId}/items?expand=fields&$top=200`);
  list.rawItems = itemsRes.value || [];
  list.itemsTruncated = !!itemsRes["@odata.nextLink"];
}
function guessListMapping(list){
  const guessed = {...list.mapping};
  list.semanticFields.forEach(f => {
    if(guessed[f.key]) return;
    const exact = (list.columns||[]).find(c => f.hint.some(h => normalize(c.displayName||c.name) === normalize(h)));
    const match = exact || (list.columns||[]).find(c => f.hint.some(h => normalize(c.displayName||c.name).includes(normalize(h))));
    if(match) guessed[f.key] = match.name;
  });
  return guessed;
}
function transformListItems(list){
  list.items = (list.rawItems||[]).map(it => {
    const obj = { id: it.id, _graphId: it.id };
    list.semanticFields.forEach(f => { if(list.mapping[f.key]) obj[f.key] = it.fields[list.mapping[f.key]] ?? ""; });
    return obj;
  });
}
function applyLoadedLists(){
  procesos = listByKey('procesos').items || [];
  clientes = listByKey('clientes').items || [];
}
async function testConnection(){
  setTestStatus("Conectando con SharePoint…", false);
  try{
    await ensureSignedIn();
    await ensureSite();
    for(const list of SHAREPOINT_LISTS){
      list.connectError = null;
      try{ await connectList(list); } catch(err){ list.connectError = err.message; }
    }
    const ok = SHAREPOINT_LISTS.filter(l => !l.connectError);
    setTestStatus(`Conectado. ${ok.length} de ${SHAREPOINT_LISTS.length} listas leídas correctamente.`, ok.length < SHAREPOINT_LISTS.length);
    renderAllMappingUIs();
  }catch(err){
    console.error(err);
    setTestStatus("No se pudo conectar: " + err.message, true);
  }
}
function renderAllMappingUIs(){
  document.getElementById('mapping-area').innerHTML = SHAREPOINT_LISTS.map(list => {
    if(list.connectError){
      return `<div class="setup-card"><h3>${list.label}</h3><p style="color:#b3271e;">No se pudo conectar: ${escapeAttr(list.connectError)}</p></div>`;
    }
    const options = (list.columns||[]).map(c => `<option value="${c.name}">${c.displayName||c.name} (${c.name})</option>`).join('');
    return `
      <div class="setup-card">
        <h3>${list.label}</h3>
        <p style="font-size:13px; color:var(--texto-suave); margin-bottom:12px;">Lista "${list.listName}" — ${(list.columns||[]).length} columnas, ${(list.rawItems||[]).length}${list.itemsTruncated?'+':''} elementos. Elige la columna real para cada campo.</p>
        <div class="field-grid">
          ${list.semanticFields.map(f => `
            <div class="field">
              <label>${f.label}${f.required?' *':''}</label>
              <select data-list-key="${list.key}" data-map-field="${f.key}">
                <option value="">— sin mapear —</option>
                ${options}
              </select>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('') + `
    <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn-primary" onclick="applyAllMappings()">Aplicar mapeo y entrar en vivo</button>
      <button class="btn-secondary" onclick="downloadAllMappings()">Descargar este mapeo (JSON)</button>
    </div>`;
  SHAREPOINT_LISTS.forEach(list => {
    if(list.connectError) return;
    const guessed = guessListMapping(list);
    list.semanticFields.forEach(f => {
      const sel = document.querySelector(`[data-list-key="${list.key}"][data-map-field="${f.key}"]`);
      if(sel && guessed[f.key]) sel.value = guessed[f.key];
    });
  });
}
function applyAllMappings(){
  document.querySelectorAll('[data-map-field]').forEach(sel => {
    const list = listByKey(sel.dataset.listKey);
    const key = sel.dataset.mapField;
    if(sel.value) list.mapping[key] = sel.value; else delete list.mapping[key];
  });
  const missing = [];
  SHAREPOINT_LISTS.forEach(list => {
    if(list.connectError) return;
    const faltan = list.semanticFields.filter(f => f.required && !list.mapping[f.key]);
    if(faltan.length) missing.push(`${list.label}: ${faltan.map(f=>f.label).join(", ")}`);
  });
  if(missing.length){
    alert("Mapea los campos obligatorios antes de continuar:\n" + missing.join("\n"));
    return;
  }
  SHAREPOINT_LISTS.forEach(list => { if(!list.connectError) transformListItems(list); });
  applyLoadedLists();
  liveMode = true;
  enterApp();
}
function downloadAllMappings(){
  const payload = {CONFIG, LISTS: {}};
  SHAREPOINT_LISTS.forEach(list => { payload.LISTS[list.key] = {listName: list.listName, mapping: list.mapping}; });
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "lexara-mapeo-sharepoint.json";
  a.click();
}
function signOut(){
  liveMode = false; account = null; siteId = null;
  document.getElementById('app').classList.remove('active');
  document.getElementById('login-screen').style.display='flex';
}

/* ---------------- Demo entry ---------------- */
function enterDemo(silent){
  liveMode = false;
  procesos = JSON.parse(JSON.stringify(DEMO_PROCESOS));
  clientes = JSON.parse(JSON.stringify(DEMO_CLIENTES));
  account = { name:"Usuario Demo", username:"demo@lexara.com" };
  enterApp();
  if(!silent) goView('dashboard');
}

function updateUserChip(pillText, pillClass){
  const pill = document.getElementById('mode-pill');
  pill.textContent = pillText; pill.className = "status-pill " + pillClass;
  const name = account?.name || account?.username || "Usuario";
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-role').textContent = liveMode ? "Sesión Microsoft 365" : (account?.username==="demo@lexara.com" ? "Datos de ejemplo" : "Sesión Microsoft 365 (sin mapear)");
  document.getElementById('user-avatar').textContent = name.substring(0,2).toUpperCase();
}

function enterApp(){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').classList.add('active');
  updateUserChip(liveMode ? "Conectado a SharePoint" : "Modo demo", liveMode ? "status-live" : "status-demo");
  loadConfigIntoForm();
  renderDashboard();
  renderProcesos();
  renderClientes();
}

/* ---------------- Navigation ---------------- */
function goView(view){
  document.querySelectorAll('.view').forEach(v => v.style.display='none');
  document.getElementById('view-'+view).style.display='block';
  document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.toggle('active', n.dataset.view===view));
  const titles = {dashboard:"Dashboard", procesos:"Procesos judiciales", clientes:"Clientes", setup:"Configuración"};
  document.getElementById('topbar-title').textContent = titles[view] || view;
}

/* ---------------- Helpers ---------------- */
function fmtDate(dateStr){
  if(!dateStr) return "—";
  const d = new Date(dateStr);
  if(isNaN(d)) return dateStr;
  return d.toLocaleDateString('es-CO', {day:'2-digit', month:'short', year:'numeric'});
}
function estadoBadgeClass(estado){
  const e = (estado||"").toLowerCase();
  if(e.includes('termin')) return 'badge-gris';
  if(e.includes('apelaci') || e.includes('corte') || e.includes('casaci')) return 'badge-naranja';
  if(e.includes('trámite') || e.includes('tramite')) return 'badge-amarillo';
  return 'badge-verde';
}
function stripHtml(html){
  if(!html) return "";
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").replace(/\s+/g," ").trim();
}
function escapeAttr(str){
  return (str||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/* ---------------- Dashboard render ---------------- */
function renderDashboard(){
  const activos = procesos.filter(p => !(p.Estado||"").toLowerCase().includes('termin'));
  const tiposDistintos = new Set(procesos.map(p => stripHtml(p.TipoAccion) || "Sin dato"));

  const stats = [
    {label:"Procesos Lexara", value:activos.length, icon:iconFolder(), cls:'icon-teal', delta:`${procesos.length} en total`},
    {label:"Tipo de Acción", value:tiposDistintos.size, icon:iconAlert(), cls:'icon-green', delta:"Categorías distintas"},
  ];
  document.getElementById('stat-grid').innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="top"><span class="label">${s.label}</span><span class="icon ${s.cls}">${s.icon}</span></div>
      <div class="value">${s.value}</div>
      <div class="delta">${s.delta}</div>
    </div>`).join('');

  renderBarChart('panel-procesos-estado', groupCount(activos, p => p.EstadoVT), 'var(--verde-oscuro)', "No hay datos de Estado V/T para los procesos activos.");
  renderBarChart('panel-tipo-proceso', groupCount(procesos, p => p.TipoAccion), 'var(--naranja)', "No hay datos de Tipo de Acción.");
}
function emptyMini(msg){ return `<div class="mini-row" style="color:var(--texto-suave); cursor:default;">${msg}</div>`; }
function groupCount(list, keyFn){
  const map = new Map();
  list.forEach(item => {
    const k = stripHtml(keyFn(item)) || "Sin dato";
    map.set(k, (map.get(k)||0)+1);
  });
  return Array.from(map.entries()).map(([label,value]) => ({label,value})).sort((a,b)=>b.value-a.value);
}
function renderBarChart(containerId, data, color, emptyMsg, maxBars){
  const el = document.getElementById(containerId);
  if(!el) return;
  if(!data.length){ el.innerHTML = emptyMini(emptyMsg); return; }
  const rows = data.slice(0, maxBars||8);
  const max = Math.max(...rows.map(r => r.value));
  el.innerHTML = `<div class="bar-chart">` + rows.map(r => `
    <div class="bar-row">
      <div class="bar-label" title="${escapeAttr(r.label)}">${r.label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4,Math.round(r.value/max*100))}%; background:${color};"></div></div>
      <div class="bar-value">${r.value}</div>
    </div>`).join('') + `</div>`;
}
function iconFolder(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>`; }
function iconAlert(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.3 3.9L2.5 18a1.5 1.5 0 001.3 2.2h16.4a1.5 1.5 0 001.3-2.2L13.7 3.9a1.5 1.5 0 00-2.6 0z"/></svg>`; }

/* ---------------- Procesos render ---------------- */
const FILTERS = [
  {key:'todos', label:'Todos'},
  {key:'activos', label:'Activos'},
  {key:'apelacion', label:'En apelación / corte'},
  {key:'terminados', label:'Terminados'},
];
function renderFilterChips(){
  document.getElementById('filter-chips').innerHTML = FILTERS.map(f => `
    <div class="filter-chip ${currentFilter===f.key?'active':''}" onclick="setFilter('${f.key}')">${f.label}</div>`).join('');
}
function setFilter(key){ currentFilter = key; renderProcesos(); }
function matchesFilter(p){
  const e = (p.Estado||"").toLowerCase();
  if(currentFilter==='activos') return !e.includes('termin');
  if(currentFilter==='apelacion') return e.includes('apelaci') || e.includes('corte') || e.includes('casaci');
  if(currentFilter==='terminados') return e.includes('termin');
  return true;
}
function onSearch(q){ renderProcesos(q.trim().toLowerCase()); }
function renderProcesos(query){
  renderFilterChips();
  query = query || (document.getElementById('global-search').value||"").trim().toLowerCase();
  const rows = procesos.filter(p => matchesFilter(p) && (!query ||
    (p.Radicado||"").toLowerCase().includes(query) ||
    (p.Cliente||"").toLowerCase().includes(query) ||
    (p.Apoderado||"").toLowerCase().includes(query)));
  document.getElementById('procesos-count').textContent = `${rows.length} de ${procesos.length} procesos`;
  document.getElementById('procesos-tbody').innerHTML = rows.length ? rows.map(p => `
    <tr onclick="openProceso(${p.id})">
      <td class="radicado">${p.Radicado||"—"}</td>
      <td class="cliente">${p.Cliente||"—"}</td>
      <td>${p.Despacho||"—"}</td>
      <td>${p.NumeroDespacho||"—"}</td>
      <td><span class="badge badge-truncate ${estadoBadgeClass(p.Estado)}" title="${escapeAttr(stripHtml(p.Estado))}">${stripHtml(p.Estado)||"—"}</span></td>
      <td>${p.LinkCarpeta ? `<a href="${p.LinkCarpeta}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:var(--verde-oscuro); font-weight:600; text-decoration:underline;">Abrir</a>` : "—"}</td>
    </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state"><div class="mark">${ICON_SVG}</div>No se encontraron procesos con ese criterio.</div></td></tr>`;
}

/* ---------------- Clientes render ---------------- */
function renderClientes(){
  const el = document.getElementById('clientes-count');
  if(!el) return;
  el.textContent = `${clientes.length} clientes`;
  document.getElementById('clientes-tbody').innerHTML = clientes.length ? clientes.map(c => `
    <tr>
      <td class="cliente">${c.RazonSocial||"—"}</td>
      <td>${c.Nit||"—"}</td>
      <td>${c.Direccion||"—"}</td>
      <td>${c.Telefono||"—"}</td>
      <td>${c.Correo||"—"}</td>
      <td>${c.Entidad||"—"}</td>
    </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state"><div class="mark">${ICON_SVG}</div>No hay clientes para mostrar.</div></td></tr>`;
}

/* ---------------- Detail drawer ---------------- */
const FIELD_SECTIONS = [
  {title:"Datos generales", fields:[
    ["Cliente","text"],["Apoderado","text"],["Despacho","text"],["Instancia","text"],
    ["TipoProceso","text"],["NumeroContrato","text"],["EtapaProcesal","text"],["Estado","text"],
  ]},
  {title:"Fechas del proceso", fields:[
    ["FechaAdmision","date"],["FechaContestacion","date"],
  ]},
  {title:"Riesgo y seguimiento", fields:[
    ["CalificacionContingencia","text"],["Observaciones","textarea"],
  ]},
];
function openProceso(id){
  activeProceso = procesos.find(p => p.id===id);
  if(!activeProceso) return;
  document.getElementById('drawer-radicado').textContent = "NUMERO_CORTO — " + (activeProceso.Radicado||"—");
  document.getElementById('drawer-cliente').textContent = activeProceso.Cliente || "Sin nombre";
  const est = document.getElementById('drawer-estado');
  est.textContent = stripHtml(activeProceso.Estado) || "—";
  est.className = "badge " + estadoBadgeClass(activeProceso.Estado);

  document.getElementById('drawer-body').innerHTML = FIELD_SECTIONS.map(sec => `
    <div class="field-section">
      <h4>${sec.title}</h4>
      <div class="field-grid ${sec.fields.length===1?'full':''}">
        ${sec.fields.map(([key,type]) => `
          <div class="field ${type==='textarea'?'full':''}" style="${type==='textarea'?'grid-column:1/-1;':''}">
            <label>${labelFor(key)}</label>
            ${type==='textarea'
              ? `<textarea data-field="${key}">${escapeAttr(stripHtml(activeProceso[key]||""))}</textarea>`
              : `<input data-field="${key}" type="${type}" value="${escapeAttr(type==='date' ? (activeProceso[key]||"") : stripHtml(activeProceso[key]||""))}">`}
          </div>`).join('')}
      </div>
    </div>`).join('');

  document.getElementById('save-hint').textContent = liveMode ? "Los cambios se guardan en SharePoint." : "Modo demo — los cambios no se guardan.";
  document.getElementById('overlay').classList.add('active');
  document.getElementById('drawer').classList.add('active');
}
function labelFor(key){
  const map = {Cliente:"Cliente", Apoderado:"Apoderado", Despacho:"Despacho / juzgado", Instancia:"Instancia",
    TipoProceso:"Tipo de proceso", NumeroContrato:"No. de contrato", EtapaProcesal:"Etapa procesal", Estado:"Estado",
    FechaAdmision:"Fecha de admisión", FechaContestacion:"Fecha de contestación",
    CalificacionContingencia:"Calificación de contingencia", Observaciones:"Observaciones"};
  return map[key] || key;
}
function closeDrawer(){
  document.getElementById('overlay').classList.remove('active');
  document.getElementById('drawer').classList.remove('active');
  activeProceso = null;
}
async function saveProceso(){
  if(!activeProceso) return;
  const updates = {};
  document.querySelectorAll('#drawer-body [data-field]').forEach(el => { updates[el.dataset.field] = el.value; });
  Object.assign(activeProceso, updates);

  if(liveMode){
    const list = listByKey('procesos');
    const graphBody = {};
    Object.keys(updates).forEach(key => { if(list.mapping[key]) graphBody[list.mapping[key]] = updates[key]; });
    try{
      await graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${activeProceso._graphId}/fields`, {
        method:"PATCH",
        body: JSON.stringify(graphBody)
      });
    }catch(err){ console.error(err); alert("No se pudo guardar en SharePoint: " + err.message); return; }
  }
  renderDashboard(); renderProcesos(); closeDrawer();
}

/* ---------------- Boot ---------------- */
refreshConfigBanner();
if(CONFIG.CLIENT_ID && CONFIG.TENANT_ID) initMsal();
