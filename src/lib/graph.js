// Estado de MSAL vive fuera de React (no es UI, solo la sesión del SDK).
let msalInstance = null;
let account = null;

export function getAccount(){ return account; }

export function initMsal(config){
  if(!window.msal || !config.CLIENT_ID || !config.TENANT_ID) return null;
  msalInstance = new window.msal.PublicClientApplication({
    auth:{
      clientId: config.CLIENT_ID,
      authority: `https://login.microsoftonline.com/${config.TENANT_ID}`,
      redirectUri: window.location.href.split('#')[0].split('?')[0],
    },
    cache:{ cacheLocation:"sessionStorage" }
  });
  return msalInstance;
}

export async function ensureSignedIn(config){
  if(!config.CLIENT_ID || !config.TENANT_ID){
    throw new Error("Falta configurar Client ID y Tenant ID.");
  }
  if(!msalInstance) initMsal(config);
  if(!msalInstance){
    throw new Error("No se pudo cargar la librería de inicio de sesión de Microsoft (MSAL). Verifica tu conexión a internet, y recarga la página.");
  }
  if(!account){
    const res = await msalInstance.loginPopup({ scopes:["User.Read","Sites.ReadWrite.All"] });
    account = res.account;
  }
  return account;
}

export function clearSession(){
  account = null;
}

async function getGraphToken(){
  const res = await msalInstance.acquireTokenSilent({ scopes:["Sites.ReadWrite.All"], account });
  return res.accessToken;
}

export async function graphFetch(path, opts){
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

export async function fetchSiteId(config){
  const site = await graphFetch(`/sites/${config.SP_HOST}:${config.SP_SITE_PATH}`);
  return site.id;
}

export function normalize(str){
  return (str||"").toLowerCase().normalize("NFD").split("").filter(ch => {
    const code = ch.charCodeAt(0);
    return code < 0x0300 || code > 0x036f; // descarta marcas diacríticas combinantes
  }).join("");
}

// Conecta una lista: descubre su listId, columnas y elementos reales.
// Devuelve un objeto NUEVO (no muta `list`), para respetar la inmutabilidad de React.
export async function connectList(siteId, list){
  const listsRes = await graphFetch(`/sites/${siteId}/lists?$select=id,name,displayName`);
  const allLists = listsRes.value || [];
  const found = allLists.find(l => normalize(l.displayName) === normalize(list.listName) || normalize(l.name) === normalize(list.listName));
  if(!found){
    const disponibles = allLists.map(l => l.displayName).join(", ") || "(ninguna)";
    throw new Error(`No se encontró una lista llamada "${list.listName}" en el sitio. Listas disponibles: ${disponibles}`);
  }
  const listId = found.id;
  // La API de Graph pagina /columns cuando hay muchas (como en listas con decenas
  // de campos); sin seguir @odata.nextLink, las columnas de páginas siguientes
  // desaparecían del desplegable de mapeo sin ningún aviso.
  let rawColumns = [];
  let colsUrl = `/sites/${siteId}/lists/${listId}/columns`;
  while(colsUrl){
    const colsRes = await graphFetch(colsUrl);
    rawColumns = rawColumns.concat(colsRes.value||[]);
    colsUrl = colsRes["@odata.nextLink"] || null;
  }
  const columns = rawColumns.filter(c => !c.hidden && c.name!=="ContentType" && !c.readOnly);
  const itemsRes = await graphFetch(`/sites/${siteId}/lists/${listId}/items?expand=fields&$top=200`);
  const rawItems = itemsRes.value || [];
  const itemsTruncated = !!itemsRes["@odata.nextLink"];
  return { ...list, listId, columns, rawItems, itemsTruncated, connectError: null };
}

export function guessListMapping(list){
  const guessed = {...list.mapping};
  list.semanticFields.forEach(f => {
    if(guessed[f.key]) return;
    const exact = (list.columns||[]).find(c => f.hint.some(h => normalize(c.displayName||c.name) === normalize(h)));
    const match = exact || (list.columns||[]).find(c => f.hint.some(h => normalize(c.displayName||c.name).includes(normalize(h))));
    if(match) guessed[f.key] = match.name;
  });
  return guessed;
}

export function transformListItems(list){
  return (list.rawItems||[]).map(it => {
    const obj = { id: it.id, _graphId: it.id };
    list.semanticFields.forEach(f => { if(list.mapping[f.key]) obj[f.key] = it.fields[list.mapping[f.key]] ?? ""; });
    return obj;
  });
}

export function allRequiredMapped(lists){
  return lists.every(list => list.semanticFields.filter(f => f.required).every(f => list.mapping[f.key]));
}

/* ---------------- Helpers de formato (sin dependencia de Graph) ---------------- */
const MESES_CORTOS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
export function fmtDate(dateStr){
  if(!dateStr) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if(!m) return dateStr;
  return `${m[3]} ${MESES_CORTOS[Number(m[2])-1]}. ${m[1]}`;
}
export function estadoBadgeClass(estado){
  const e = (estado||"").toLowerCase();
  if(e.includes('termin')) return 'badge-gris';
  if(e.includes('apelaci') || e.includes('corte') || e.includes('casaci')) return 'badge-naranja';
  if(e.includes('trámite') || e.includes('tramite')) return 'badge-amarillo';
  return 'badge-verde';
}
export function stripHtml(html){
  if(!html) return "";
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").replace(/\s+/g," ").trim();
}
export function groupCount(list, keyFn){
  const map = new Map();
  list.forEach(item => {
    const k = stripHtml(keyFn(item)) || "Sin dato";
    map.set(k, (map.get(k)||0)+1);
  });
  return Array.from(map.entries()).map(([label,value]) => ({label,value})).sort((a,b)=>b.value-a.value);
}

/* ---------------- Relación Procesos.Cliente <-> Clientes.RazonSocial ---------------- */
// Cruce por nombre: el campo "Cliente" de un proceso guarda el mismo texto
// que "Razón social" en la lista de Clientes. Estas dos funciones son el
// punto único de esa relación — si más adelante se agrega un vínculo real
// por ID de SharePoint, solo hay que cambiar la implementación aquí.
export function findClienteByNombre(clientes, nombre){
  if(!nombre) return null;
  const target = normalize(nombre);
  return clientes.find(c => normalize(c.RazonSocial) === target) || null;
}
export function procesosForCliente(procesos, cliente){
  if(!cliente) return [];
  const target = normalize(cliente.RazonSocial);
  return procesos.filter(p => normalize(p.Cliente) === target);
}

/* ---------------- Relación Facturas.CodigoCliente <-> Clientes.id, Facturas.Contrato <-> Procesos.NumeroContrato ---------------- */
export function clienteForFactura(clientes, factura){
  if(!factura || !factura.CodigoCliente) return null;
  const target = String(factura.CodigoCliente).trim();
  return clientes.find(c => String(c.id) === target) || null;
}
export function procesoForFactura(procesos, factura){
  if(!factura || !factura.Contrato) return null;
  const target = normalize(factura.Contrato);
  return procesos.find(p => normalize(p.NumeroContrato) === target) || null;
}
export function facturaNumero(factura){
  return factura.Factura || (factura.id!=null ? String(Number(factura.id) + 92) : "");
}
// Dia/Mes/Año son los campos que se digitan; Fecha se guarda concatenándolos
// y dándoles formato de fecha (no se digita directamente).
export function fechaFromPartes(dia, mes, anio){
  if(!dia || !mes || !anio) return "";
  return `${String(anio).padStart(4,'0')}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}
export function parseMonto(str){
  if(str==null || str==="") return 0;
  const n = parseFloat(String(str).replace(/\./g,"").replace(",","."));
  return isNaN(n) ? 0 : n;
}
// Total1..6 sí son columnas reales: se calculan al crear la factura (Cantidad ×
// Valor unitario) y ese valor queda guardado, por eso se lee tal cual está.
export function facturaLineItems(factura){
  return Array.from({length:6}, (_,i) => i+1).map(n => ({
    n,
    Descripcion: factura[`Descripcion${n}`] || "",
    Cantidad: factura[`Cantidad${n}`] || "",
    ValorUnitario: factura[`ValorUnitario${n}`] || "",
    Total: factura[`Total${n}`] || "",
  }));
}
export function fmtMonto(n){
  return new Intl.NumberFormat('es-CO', {minimumFractionDigits:0, maximumFractionDigits:2}).format(n||0);
}
export function computeFacturaTotals(factura){
  const subtotal = facturaLineItems(factura).reduce((sum,li) => sum + parseMonto(li.Total), 0);
  const ivaRate = parseMonto(factura.Iva);
  const iva = subtotal * (ivaRate/100);
  return { subtotal, iva, total: subtotal + iva };
}
