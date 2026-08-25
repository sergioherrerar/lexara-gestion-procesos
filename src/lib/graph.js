// Estado de MSAL vive fuera de React (no es UI, solo la sesión del SDK).
let msalInstance = null;
let account = null;

export function getAccount(){ return account; }

export function initMsal(config){
  if(msalInstance) return msalInstance;
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

// Antes se usaba loginPopup — se cambió a loginRedirect (navega la página
// completa a Microsoft y de vuelta) porque el popup se quedaba pegado en
// una pestaña en blanco mostrando el código de autenticación en la URL sin
// cerrarse solo (falla conocida de MSAL con popups cuando el navegador
// bloquea el acceso a window.opener, o cuando el navegador/una extensión
// abre el popup como pestaña normal en vez de ventana emergente).
// loginRedirect evita ese problema de raíz al no depender de un popup.

// Inicia sesión: navega la página completa a Microsoft. No hay nada que
// esperar aquí — la página se recarga y completeSignInFromRedirect() más
// abajo procesa el resultado en el siguiente arranque de la app.
export function beginSignIn(config){
  if(!config.CLIENT_ID || !config.TENANT_ID){
    throw new Error("Falta configurar Client ID y Tenant ID.");
  }
  if(!msalInstance) initMsal(config);
  if(!msalInstance){
    throw new Error("No se pudo cargar la librería de inicio de sesión de Microsoft (MSAL). Verifica tu conexión a internet, y recarga la página.");
  }
  // "select_account" para que, si Microsoft ya tiene varias cuentas en el
  // navegador, siempre se pueda elegir con cuál entrar en vez de reusar la
  // última en silencio.
  return msalInstance.loginRedirect({ scopes:["User.Read","Sites.ReadWrite.All"], prompt:"select_account" });
}

// Se llama una sola vez al arrancar la app. Si la URL trae la respuesta de
// Microsoft (porque venimos de un beginSignIn()), la procesa y devuelve la
// cuenta. Si no hay nada que procesar, revisa si ya hay una cuenta en la
// caché de esta pestaña (por ejemplo, al recargar la página estando ya
// conectado) para no pedir inicio de sesión de nuevo sin necesidad.
export async function completeSignInFromRedirect(config){
  if(!msalInstance) initMsal(config);
  if(!msalInstance) return null;
  const result = await msalInstance.handleRedirectPromise();
  if(result && result.account){
    account = result.account;
    msalInstance.setActiveAccount(account);
    return account;
  }
  const cuentas = msalInstance.getAllAccounts();
  if(cuentas && cuentas.length){
    account = cuentas[0];
    msalInstance.setActiveAccount(account);
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

// Token para crear/leer correo (Mail.ReadWrite) — a propósito NUNCA se pide
// junto con Sites.ReadWrite.All en beginSignIn()/getGraphToken(): agregar un
// permiso nuevo ahí rompería el inicio de sesión de TODO el mundo hasta que
// el permiso quede aprobado en Azure AD (Entra) por un administrador. En vez
// de eso, este permiso se pide de forma aislada, solo la primera vez que se
// usa alguna función de correo (ver crearBorradorCorreo) — si ya está
// aprobado en Azure AD pero el usuario nunca lo consintió en esta cuenta,
// acquireTokenSilent falla y se reintenta una sola vez con un popup chiquito
// (NO loginRedirect — no hace falta navegar toda la página solo para un
// permiso adicional). Si el permiso ni siquiera existe todavía en el
// registro de la app, esto sigue fallando y quien llama debe caer de vuelta
// al método anterior (mailto + copiar tabla al portapapeles).
async function getMailToken(){
  const scopes = ["Mail.ReadWrite"];
  try{
    const res = await msalInstance.acquireTokenSilent({ scopes, account });
    return res.accessToken;
  }catch(err){
    const res = await msalInstance.acquireTokenPopup({ scopes });
    return res.accessToken;
  }
}

// Crea un borrador de correo DIRECTO en el buzón de Outlook del usuario que
// inició sesión (vía Microsoft Graph, POST /me/messages) — con el cuerpo en
// HTML real (tablas con color) y el PDF ya adjunto, sin que el usuario tenga
// que pegar ni adjuntar nada a mano. Requiere el permiso delegado
// "Mail.ReadWrite" aprobado en Azure AD (Entra) — si no está aprobado
// todavía, esto lanza y quien llama debe caer de vuelta al método anterior
// (mailto + copiar tabla al portapapeles), ver informeTutelas.js.
// Devuelve el mensaje creado por Graph — su campo `webLink` abre ese
// borrador exacto en Outlook en la Web, ya con todo listo para revisar y
// darle Enviar (mismo criterio que `.Display` en la macro de Access
// original, que mostraba el borrador en vez de enviarlo directo).
export async function crearBorradorCorreo({ to, cc, subject, htmlBody, adjuntoNombre, adjuntoBase64 }){
  const token = await getMailToken();
  const body = {
    subject,
    body: { contentType: "HTML", content: htmlBody },
    toRecipients: [{ emailAddress: { address: to } }],
    ccRecipients: (cc||[]).map(correo => ({ emailAddress: { address: correo } })),
    attachments: adjuntoBase64 ? [{
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: adjuntoNombre,
      contentType: "application/pdf",
      contentBytes: adjuntoBase64,
    }] : [],
  };
  // POST directo a la carpeta "drafts" (nombre bien-conocido de Graph,
  // resuelve solo al ID real de esa carpeta en esta cuenta) en vez del
  // endpoint genérico /me/messages — que por documentación de Microsoft
  // debería crear el borrador en Drafts igual, pero en la práctica el
  // usuario confirmó en vivo (2026-08-25) que el borrador ni siquiera
  // aparecía en Borradores después de un F5 — así que se apunta explícito a
  // esa carpeta, sin dejarlo a un comportamiento por defecto que en esta
  // cuenta no se estaba cumpliendo.
  const res = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders/drafts/messages', {
    method: "POST",
    headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
    body: JSON.stringify(body),
  });
  if(!res.ok){
    const errBody = await res.text();
    throw new Error(`Graph ${res.status}: ${errBody.substring(0,300)}`);
  }
  const mensaje = await res.json();

  // El "webLink" de un mensaje recién creado por Graph seguía mostrando "es
  // posible que este mensaje se haya movido o eliminado" en Outlook — ni
  // esperando un tiempo fijo (primer intento, 2026-08-24) ni confirmando con
  // un GET repetido que el mensaje ya se puede leer por Graph (segundo
  // intento, 2026-08-25 — el GET SÍ confirmaba que el mensaje existe, pero
  // Outlook igual no podía abrir ESE enlace puntual) resolvió el problema.
  // Tercer intento (abrir la carpeta completa en vez del mensaje puntual)
  // TAMPOCO bastó — el usuario confirmó que ni con F5 aparecía ahí. Se arma
  // igual la URL de la carpeta (para cuando sí funcione) tomando el dominio
  // real del propio `webLink`, y ADEMÁS se busca en qué carpeta quedó
  // REALMENTE el mensaje (`parentFolderId` → nombre real de la carpeta) para
  // poder confirmarlo con datos reales en vez de seguir adivinando.
  let carpetaBorradores = null;
  try{ carpetaBorradores = new URL(mensaje.webLink).origin + '/mail/drafts'; }catch(err){ /* si el webLink viene raro, se ignora */ }
  let carpetaReal = null;
  try{
    const detalle = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${mensaje.id}?$select=parentFolderId`, {
      headers: { Authorization:`Bearer ${token}` },
    });
    if(detalle.ok){
      const { parentFolderId } = await detalle.json();
      const folderRes = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/${parentFolderId}?$select=displayName`, {
        headers: { Authorization:`Bearer ${token}` },
      });
      if(folderRes.ok) carpetaReal = (await folderRes.json()).displayName;
    }
  }catch(err){ /* diagnóstico best-effort — no debe romper la creación del borrador */ }
  return { ...mensaje, carpetaBorradores, carpetaReal };
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

// sitePath opcional: para el sitio principal se puede omitir (usa
// config.SP_SITE_PATH). Algunas listas (Tutelas/Tema/Valores Entidad) viven
// en OTRO sitio del mismo tenant — ver sitePathKey en config.js y
// siteIdForList en useLexaraApp.js.
export async function fetchSiteId(config, sitePath){
  const path = sitePath || config.SP_SITE_PATH;
  const site = await graphFetch(`/sites/${config.SP_HOST}:${path}`);
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
  // No excluimos columnas de solo lectura: los campos calculados (fórmulas de
  // SharePoint, como Fecha o los TotalN) suelen venir marcados readOnly, pero
  // igual hay que poder leerlos y mapearlos.
  const columns = rawColumns.filter(c => !c.hidden && c.name!=="ContentType");
  // Igual que /columns, /items pagina de a 200 — sin seguir @odata.nextLink,
  // listas con más de 200 registros (como "base facturas", con casi mil)
  // se veían truncadas a la primera página sin ningún aviso.
  let rawItems = [];
  let itemsUrl = `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=200`;
  let itemsTruncated = false;
  const MAX_PAGINAS = 50; // tope de seguridad (~10.000 elementos) contra listas descontroladas
  for(let pagina = 0; itemsUrl && pagina < MAX_PAGINAS; pagina++){
    const itemsRes = await graphFetch(itemsUrl);
    rawItems = rawItems.concat(itemsRes.value||[]);
    itemsUrl = itemsRes["@odata.nextLink"] || null;
    if(itemsUrl && pagina === MAX_PAGINAS-1) itemsTruncated = true;
  }
  // $expand=fields SIN $select trae en blanco las columnas de tipo Búsqueda
  // (Lookup) y Persona/Grupo — Graph solo resuelve su valor real si se pide
  // explícitamente por nombre (limitación documentada de Graph para listas de
  // SharePoint). Caso real: "Cliente" en Tutelas es una columna de Búsqueda y
  // siempre se veía vacía en la app aunque tuviera dato real en SharePoint
  // (2026-08-17). En vez de arriesgar el resto de columnas (pedir $select de
  // TODAS puede fallar contra columnas de sistema que no son campos de
  // verdad), se hace una segunda pasada SOLO por las columnas de Búsqueda/
  // Persona que existan en esta lista, y se combina con lo ya leído — las
  // listas que no tienen ninguna columna de ese tipo (la mayoría) no hacen
  // esta segunda pasada y no cambian en nada.
  const columnasBusquedaPersona = columns.filter(c => c.lookup || c.personOrGroup).map(c => c.name);
  if(columnasBusquedaPersona.length){
    const selectStr = columnasBusquedaPersona.join(',');
    let lookupItems = [];
    let lookupUrl = `/sites/${siteId}/lists/${listId}/items?$expand=fields($select=${selectStr})&$top=200`;
    for(let pagina = 0; lookupUrl && pagina < MAX_PAGINAS; pagina++){
      const lookupRes = await graphFetch(lookupUrl);
      lookupItems = lookupItems.concat(lookupRes.value||[]);
      lookupUrl = lookupRes["@odata.nextLink"] || null;
    }
    const valoresPorId = {};
    lookupItems.forEach(it => { valoresPorId[it.id] = it.fields || {}; });
    rawItems.forEach(it => {
      const extra = valoresPorId[it.id];
      if(extra) Object.assign(it.fields, extra);
    });
  }
  // Se guarda el siteId real usado para conectar esta lista — la mayoría
  // comparte el sitio principal, pero Tutelas/Tema/Valores Entidad viven en
  // otro sitio (ver sitePathKey en config.js); guardarlo en el propio objeto
  // de la lista es lo que le permite a cada Guardar/Eliminar de esas listas
  // apuntar al sitio correcto sin tener que repetir esa lógica en cada sitio.
  return { ...list, listId, siteId, columns, rawItems, itemsTruncated, connectError: null };
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

// Traduce claves semánticas a nombres reales de columna para un PATCH/POST.
export function graphFieldsFromUpdates(list, updates){
  const fields = {};
  Object.keys(updates).forEach(key => {
    if(!list.mapping[key]) return;
    fields[list.mapping[key]] = updates[key];
  });
  return fields;
}

// Casi todo el resto de la app da por hecho que un campo es texto/número
// plano (le hace .toLowerCase(), .trim(), .localeCompare(), etc.). Pero una
// columna real de SharePoint puede ser de Persona, Búsqueda (Lookup) o
// Selección múltiple, y Graph la devuelve como un objeto o un arreglo, no
// como texto — eso rompe esas llamadas y tumba toda la página en blanco (sin
// límite de error, React desmonta todo el árbol si algo lanza durante el
// render). Esta función normaliza cualquier forma rara a texto plano antes
// de que llegue al resto del código.
function coerceFieldValue(raw){
  if(raw == null) return "";
  const t = typeof raw;
  if(t === 'string' || t === 'number' || t === 'boolean') return raw;
  if(Array.isArray(raw)) return raw.map(coerceFieldValue).filter(Boolean).join(", ");
  // Una columna real de "Hipervínculo o imagen" en SharePoint llega desde
  // Graph como {Url, Description}, no como texto — por eso los campos de
  // Link se veían vacíos aunque sí tuvieran enlace en SharePoint. Url
  // primero (es lo que de verdad hace falta para abrir el enlace).
  if(t === 'object') return raw.Url || raw.LookupValue || raw.Title || raw.DisplayName || raw.Label || raw.Email || "";
  return String(raw);
}

export function transformListItems(list){
  return (list.rawItems||[]).map(it => {
    const obj = { id: it.id, _graphId: it.id };
    list.semanticFields.forEach(f => { if(list.mapping[f.key]) obj[f.key] = coerceFieldValue(it.fields[list.mapping[f.key]] ?? ""); });
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
// Color del badge de Estado del proceso — antes se adivinaba por palabras
// clave dentro del propio texto de "Estado" (fallaba: p.ej. "vencimiento de
// términos" se confundía con "Terminado"). Criterio confirmado por el
// usuario, ahora basado en dos campos aparte:
// - "Estado V/T" = Terminado → siempre gris, sin importar la fecha. GRIS ES
//   EXCLUSIVO DE TERMINADOS — no debe salir por ningún otro motivo (ver
//   corrección 2026-08-20 más abajo).
// - Si no está terminado, según qué tan vieja es "Fecha último estado"
//   comparada con el momento real de hoy (al iniciar sesión o hacer F5,
//   siempre se recalcula con la fecha/hora actual, nunca una guardada):
//   menos de 6 meses → verde, entre 6 meses y 1 año → naranja, más de 1
//   año → rojo.
function mesesDesde(fechaStr){
  if(!fechaStr) return null;
  const fecha = new Date(fechaStr);
  if(isNaN(fecha.getTime())) return null;
  const hoy = new Date();
  let meses = (hoy.getFullYear() - fecha.getFullYear()) * 12 + (hoy.getMonth() - fecha.getMonth());
  if(hoy.getDate() < fecha.getDate()) meses -= 1;
  return meses;
}
// Busca la fecha MÁS RECIENTE que aparezca escrita dentro del texto de
// "Estado" (formato DD-MM-AAAA, tal como quedan las entradas de la
// bitácora, p.ej. "12-03-2026 Auto admite...") — se usa como respaldo
// cuando la columna "Fecha último estado" viene vacía en SharePoint, para
// no perder la fecha real que sí está escrita ahí adentro.
function fechaMasRecienteEnTexto(html){
  const texto = stripHtml(html);
  const matches = [...texto.matchAll(/(\d{2})-(\d{2})-(\d{4})/g)];
  if(!matches.length) return null;
  const [, d, m, y] = matches[matches.length - 1];
  return `${y}-${m}-${d}`;
}
// CORREGIDO 2026-08-20 — bug real señalado por el usuario con una captura
// (Entidad "GTM", 4/4 procesos activos, semáforo mostraba "3 rojo, 1 gris"
// — ese 1 gris NO era un proceso terminado): antes, si no había fecha
// válida, la función devolvía 'badge-gris' igual que un proceso terminado,
// mezclando "no sé la fecha" con "está cerrado". Corregido: gris queda
// EXCLUSIVO para EstadoVT=Terminado. Si no hay fecha en "Fecha último
// estado", se busca una fecha dentro del texto de "Estado" (parámetro
// nuevo, opcional); si tampoco hay nada ahí, se trata como el caso que más
// atención necesita (rojo) — nunca gris.
export function estadoBadgeClass(estadoVT, fechaUltimoEstado, estadoTexto){
  const vt = (estadoVT||"").toLowerCase();
  if(vt.includes('termin')) return 'badge-gris';
  let meses = mesesDesde(fechaUltimoEstado);
  if(meses == null && estadoTexto) meses = mesesDesde(fechaMasRecienteEnTexto(estadoTexto));
  if(meses == null) return 'badge-rojo';
  if(meses < 6) return 'badge-verde';
  if(meses < 12) return 'badge-naranja';
  return 'badge-rojo';
}
// Mismo sistema de etiquetas .badge que Procesos (antes Facturación tenía su
// propio .estado-badge, con otro radio/colores — quedaban dos componentes
// para lo mismo). Pagada/Radicada/Anulada son las únicas 3 opciones reales.
export function estadoFacturaBadgeClass(estado){
  const e = (estado||"").toLowerCase();
  if(e.includes('pagada')) return 'badge-verde';
  if(e.includes('radicada')) return 'badge-amarillo';
  if(e.includes('anulada')) return 'badge-naranja';
  return 'badge-gris';
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
// Inversa de procesoForFactura/procesoForOrdenCompra — para mostrar, dentro
// del panel de un proceso, todas las facturas/órdenes de compra que
// comparten su mismo Contrato (pestañas "Facturas"/"Órdenes de compra").
export function facturasForProceso(facturas, proceso){
  if(!proceso || !proceso.NumeroContrato) return [];
  const target = normalize(proceso.NumeroContrato);
  return (facturas||[]).filter(f => f.Contrato && normalize(f.Contrato) === target);
}
export function ordenesCompraForProceso(ordenesCompra, proceso){
  if(!proceso || !proceso.NumeroContrato) return [];
  const target = normalize(proceso.NumeroContrato);
  return (ordenesCompra||[]).filter(o => o.Contrato && normalize(o.Contrato) === target);
}
export function formasPagoForProceso(formasPago, proceso){
  if(!proceso || !proceso.NumeroContrato) return [];
  const target = normalize(proceso.NumeroContrato);
  return (formasPago||[]).filter(fp => fp.Contrato && normalize(fp.Contrato) === target);
}
// A diferencia de facturas/órdenes/formas de pago (que se asocian por
// Contrato, un texto), Desistimientos se asocia por ID real del proceso —
// el campo "Proceso" guarda el id del elemento en Procesos Judiciales.
export function desistimientosForProceso(desistimientos, proceso){
  if(!proceso || proceso.id == null) return [];
  return (desistimientos||[]).filter(d => d.Proceso != null && String(d.Proceso) === String(proceso.id));
}
// Inversa de desistimientosForProceso — dado un desistimiento, encontrar su
// proceso (para informes que necesitan datos del proceso, como No. Completo
// o Despacho, junto a los propios del desistimiento).
export function procesoForDesistimiento(procesos, desistimiento){
  if(!desistimiento || desistimiento.Proceso == null) return null;
  return (procesos||[]).find(p => String(p.id) === String(desistimiento.Proceso)) || null;
}
// La lista "tipos de Accion" guía qué Tipo de Proceso y qué Despacho son
// válidos para cada Tipo de Acción (Administrativo/Civil/Laboral) en
// Procesos Judiciales — son selects dependientes: elegir el Tipo de Acción
// filtra las opciones de los otros dos.
export function tiposAccionDistinct(tiposAccion){
  return Array.from(new Set((tiposAccion||[]).map(t => t.NombreIdTipoProceso).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
}
export function tiposProcesoParaAccion(tiposAccion, tipoAccion){
  if(!tipoAccion) return [];
  const target = normalize(tipoAccion);
  const set = new Set();
  (tiposAccion||[]).forEach(t => { if(t.TipoProceso && normalize(t.NombreIdTipoProceso||"")===target) set.add(t.TipoProceso); });
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}
export function despachosParaAccion(tiposAccion, tipoAccion){
  if(!tipoAccion) return [];
  const target = normalize(tipoAccion);
  const set = new Set();
  (tiposAccion||[]).forEach(t => { if(t.Despacho && normalize(t.NombreIdTipoProceso||"")===target) set.add(t.Despacho); });
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}
// Tutelas: "Tema" es un select dependiente de "Prestación" (corregido
// 2026-08-18 — antes dependía de Tipo Vinculación Entidad, que en realidad
// es una lista fija propia sin depender de nada, ver TutelaDrawer.jsx):
// queda filtrado a los Temas cuya Prestación Tema coincida con la
// Prestación elegida. Mismo criterio de selects dependientes que Tipo de
// Acción/Tipo de Proceso en Procesos judiciales. Ver [[project_tutelas_modulo]].
export function temasParaPrestacion(temas, prestacion){
  if(!prestacion) return [];
  const target = normalize(prestacion);
  const set = new Set();
  (temas||[]).forEach(t => { if(t.Nombre && normalize(t.PrestacionTema||"")===target) set.add(t.Nombre); });
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}
// Los 6 pagos fijos de una "Forma de pago", cada uno con su etapa procesal
// cumplida, valor y factura asociada — igual criterio que facturaLineItems.
export function formaPagoLineas(formaPago){
  return Array.from({length:6}, (_,i) => i+1).map(n => ({
    n,
    EtapaProcesalCumplida: formaPago[`EtapaProcesalCumplida${n}`] || "",
    Pago: formaPago[`Pago${n}`] || "",
    ValorPago: formaPago[`ValorPago${n}`] || "",
    FacturaPago: formaPago[`FacturaPago${n}`] || "",
  }));
}
export function facturaNumero(factura){
  return factura.Factura || (factura.id!=null ? String(Number(factura.id) + 91) : "");
}
// Facturación tiene dos numeraciones históricas conviviendo: solo dígitos
// (p.ej. "300", "805", de la numeración actual) y con letra, heredadas de
// la migración de Access (p.ej. "1a", "193a"). El usuario pidió dejar la
// numeración solo-dígitos arriba (de mayor a menor, la más reciente
// primero) y las que tienen letra abajo (también de mayor a menor) —
// antes se ordenaba con Number(), que da NaN para "1a" y desordena la lista.
export function compareFacturaNumero(a, b){
  const na = facturaNumero(a), nb = facturaNumero(b);
  const aEsNumero = /^\d+$/.test(na);
  const bEsNumero = /^\d+$/.test(nb);
  if(aEsNumero && !bEsNumero) return -1;
  if(!aEsNumero && bEsNumero) return 1;
  if(aEsNumero && bEsNumero) return Number(nb) - Number(na);
  // Ambas con letra: compara primero por el número al inicio (p.ej. 193 en
  // "193a"), de mayor a menor, y si empatan por el texto completo.
  const numA = parseInt(na, 10) || 0;
  const numB = parseInt(nb, 10) || 0;
  if(numB !== numA) return numB - numA;
  return nb.localeCompare(na);
}

// --- Facturas electrónicas de Siigo (carpeta compartida por link) ---
// Pedido explícito del usuario 2026-08-19: cada factura tiene su PDF
// generado por Siigo en una carpeta de SharePoint/OneDrive compartida por
// link (no es una de las listas ya conectadas — se resuelve aparte).
//
// Se probaron 2 esquemas de nombre, del más al menos preferido:
// 1) Simple: el número de factura tal cual + ".pdf" (p.ej. "804.pdf") — el
//    usuario puede renombrar los PDF así para que la búsqueda sea directa.
// 2) Siigo original: "F003" + 8 ceros + número (4 dígitos, ceros a la
//    izquierda) + "0000" + ".pdf" — p.ej. factura 804 →
//    "F0030000000008040000.pdf". Se deja como respaldo por si algún archivo
//    viejo no se alcanza a renombrar al esquema simple.
export function siigoNombresPosibles(factura){
  const numero = facturaNumero(factura);
  // La numeración con letra (heredada de Access, p.ej. "193a") no sigue
  // ninguno de estos patrones — no hay forma de calcular su nombre de archivo.
  if(!/^\d+$/.test(numero)) return [];
  return [
    `${numero}.pdf`,
    `F003${"0".repeat(8)}${numero.padStart(4,'0')}0000.pdf`,
  ];
}

// Codifica una URL de "compartir" de SharePoint/OneDrive al formato que
// espera /shares/{id} de Graph — ver
// https://learn.microsoft.com/graph/api/shares-get
function codificarUrlCompartida(url){
  const base64 = btoa(url).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
  return "u!" + base64;
}

// La carpeta de Siigo se resuelve UNA sola vez por sesión (driveId + id de
// la carpeta) — se reusa en cada botón "Abrir factura electrónica" sin
// volver a pedirle a Graph que resuelva el link compartido cada vez. Se
// guarda también el nombre real de la carpeta, para poder decir en el error
// "no encontrado" EN QUÉ carpeta buscó (si algún día el link resuelve al
// lugar equivocado, esto lo delata enseguida en vez de un "no encontrado"
// genérico que se puede confundir con "esta factura en particular no existe").
let carpetaSiigo = null;
async function resolverCarpetaSiigo(shareUrl){
  if(carpetaSiigo) return carpetaSiigo;
  const id = codificarUrlCompartida(shareUrl);
  const item = await graphFetch(`/shares/${id}/driveItem?$select=id,name,parentReference`);
  carpetaSiigo = { driveId: item.parentReference.driveId, folderId: item.id, nombre: item.name };
  // Conteo real de archivos que SharePoint tiene registrado para esta
  // carpeta (sin necesidad de listarlos todos) — sirve para saber si el
  // listado por páginas se está quedando corto (carpeta con más archivos
  // de los que realmente se están revisando) frente a lo que se ve en el
  // navegador.
  try{
    const folderInfo = await graphFetch(`/drives/${carpetaSiigo.driveId}/items/${carpetaSiigo.folderId}?$select=folder`);
    carpetaSiigo.totalArchivos = folderInfo?.folder?.childCount ?? null;
  }catch(err){ carpetaSiigo.totalArchivos = null; }
  return carpetaSiigo;
}

// Busca el PDF de la factura electrónica en la carpeta de Siigo y lo abre en
// una pestaña nueva. Lanza un error (con mensaje para mostrar al usuario) si
// la numeración no aplica o si Graph no encuentra el archivo.
export async function abrirFacturaSiigo(factura, shareUrl){
  const numero = facturaNumero(factura);
  const nombresPosibles = siigoNombresPosibles(factura);
  if(!nombresPosibles.length){
    throw new Error(`No se puede calcular el nombre del archivo para la factura "${numero}" (numeración antigua con letra).`);
  }
  const carpeta = await resolverCarpetaSiigo(shareUrl);

  // Primero las rutas exactas (rápido, un pedido a Graph por candidato) —
  // alcanza en la mayoría de los casos. Se prueban en orden: nombre simple
  // (p.ej. "804.pdf") primero, luego el esquema largo de Siigo.
  let item = null;
  for(const nombre of nombresPosibles){
    try{
      item = await graphFetch(`/drives/${carpeta.driveId}/items/${carpeta.folderId}:/${encodeURIComponent(nombre)}?$select=webUrl`);
      if(item) break;
    }catch(err){ /* sigue con el siguiente candidato */ }
  }

  // Si no la encontró por ninguna ruta exacta, revisa archivo por archivo
  // sin distinguir mayúsculas/minúsculas (algunos PDF reales tienen la
  // extensión en mayúsculas, ".PDF") contra cualquiera de los nombres
  // posibles.
  let totalRevisados = 0;
  const nombresVistos = []; // todos los nombres reales que ve Graph — para diagnosticar si no encuentra nada.
  if(!item){
    const objetivos = nombresPosibles.map(n => n.toLowerCase());
    let url = `/drives/${carpeta.driveId}/items/${carpeta.folderId}/children?$select=name,webUrl&$top=200`;
    while(url){
      const res = await graphFetch(url);
      const pagina = res.value || [];
      totalRevisados += pagina.length;
      pagina.forEach(f => nombresVistos.push(f.name));
      const match = pagina.find(f => objetivos.includes((f.name||"").toLowerCase()));
      if(match){ item = match; break; }
      url = res["@odata.nextLink"] || null;
    }
  }

  if(!item){
    const conteo = carpeta.totalArchivos != null ? ` SharePoint dice que esa carpeta tiene ${carpeta.totalArchivos} archivos en total.` : "";
    // Busca nombres "parecidos" que contengan el mismo número de factura
    // (con o sin los ceros a la izquierda) — si aparece alguno, es señal de
    // que el esquema de nombre real es distinto al que estoy probando
    // (en vez de que la factura simplemente no tenga archivo electrónico).
    const parecidos = nombresVistos.filter(n => n.includes(numero) || n.includes(numero.padStart(4,'0')));
    const ejemplo = parecidos.length
      ? ` Nombres parecidos que sí encontró (con el número "${numero}"): ${parecidos.join(", ")}.`
      : (nombresVistos.length ? ` Primeros nombres vistos ahí: ${nombresVistos.slice(0,5).join(", ")}.` : "");
    throw new Error(`No se encontró la factura "${numero}" (se buscó como ${nombresPosibles.map(n=>`"${n}"`).join(" o ")}) en la carpeta "${carpeta.nombre}" de Siigo (se revisaron ${totalRevisados} archivos ahí).${conteo}${ejemplo}`);
  }
  window.open(item.webUrl, '_blank', 'noopener');
}
// Dia/Mes/Año son los campos que se digitan; Fecha se guarda concatenándolos
// y dándoles formato de fecha (no se digita directamente).
export function fechaFromPartes(dia, mes, anio){
  if(!dia || !mes || !anio) return "";
  return `${String(anio).padStart(4,'0')}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}
// SharePoint devuelve columnas numéricas (Cantidad, Valor unitario, Total, IVA...)
// unas veces como número (p.ej. 1471348.75) y otras como texto en formato
// colombiano (p.ej. "1.471.348,75"). Antes se trataba todo como texto colombiano,
// lo que le borraba el punto decimal a un número real y lo inflaba x100.
export function parseMonto(val){
  if(val==null || val==="") return 0;
  if(typeof val === "number") return val;
  const str = String(val).trim();
  if(str.includes(",")){
    // Formato colombiano: punto = miles, coma = decimal.
    const n = parseFloat(str.replace(/\./g,"").replace(",","."));
    return isNaN(n) ? 0 : n;
  }
  const partes = str.split(".");
  // Sin coma: si hay un solo punto y quedan 1-2 dígitos después (p.ej. "1471348.75"),
  // es un decimal normal — se respeta. Si hay varios puntos o el último grupo tiene
  // más de 2 dígitos (p.ej. "1.471.348"), son separadores de miles — se quitan.
  const esDecimalSimple = partes.length===2 && partes[1].length<=2;
  const limpio = esDecimalSimple ? str : str.replace(/\./g,"");
  const n = parseFloat(limpio);
  return isNaN(n) ? 0 : n;
}
// Total1..6 sí son columnas reales: se calculan al crear la factura (Cantidad ×
// Valor unitario) y ese valor queda guardado. Pero si esa columna llegó vacía o en
// 0 (factura antigua/incompleta), se recalcula en el momento desde Cantidad × Valor
// unitario en vez de mostrar un total en cero.
export function facturaLineItems(factura){
  return Array.from({length:6}, (_,i) => i+1).map(n => {
    const Cantidad = factura[`Cantidad${n}`] || "";
    const ValorUnitario = factura[`ValorUnitario${n}`] || "";
    const totalGuardado = parseMonto(factura[`Total${n}`]);
    const Total = totalGuardado > 0 ? totalGuardado : parseMonto(Cantidad) * parseMonto(ValorUnitario);
    return { n, Descripcion: factura[`Descripcion${n}`] || "", Cantidad, ValorUnitario, Total };
  });
}
export function fmtMonto(n){
  return new Intl.NumberFormat('es-CO', {minimumFractionDigits:2, maximumFractionDigits:2}).format(n||0);
}
// Fecha/TotalN/Subtotal/IVA/Total/ValorAPagar son columnas calculadas por fórmula
// en SharePoint — la app nunca les escribe un valor, solo las lee. El 19% de IVA
// es una constante fija (no hay una columna de "tasa"); se usa solo para armar una
// vista previa en la app cuando el dato calculado real todavía no existe (factura
// recién creada, antes de que SharePoint la recalcule).
export const IVA_RATE_DEFAULT = 19;
export function computeFacturaTotals(factura){
  // Comparamos numéricamente (>0), no con un simple truthy: un "0" guardado
  // literalmente en Subtotal/Total (factura incompleta) es texto no-vacío y
  // por lo tanto "truthy", pero no debe pisar el cálculo real a partir de las líneas.
  const subtotalCalc = facturaLineItems(factura).reduce((sum,li) => sum + parseMonto(li.Total), 0);
  const subtotalStored = parseMonto(factura.Subtotal);
  const subtotal = subtotalStored > 0 ? subtotalStored : subtotalCalc;
  const ivaStored = parseMonto(factura.Iva);
  const iva = ivaStored > 0 ? ivaStored : subtotal * (IVA_RATE_DEFAULT/100);
  const totalStored = parseMonto(factura.Total);
  const total = totalStored > 0 ? totalStored : subtotal + iva;
  return { subtotal, iva, total };
}

/* ---------------- Órdenes de Compra: mismo esquema de líneas que Facturas ---------------- */
export function clienteForOrdenCompra(clientes, oc){
  if(!oc || !oc.CodigoCliente) return null;
  const target = String(oc.CodigoCliente).trim();
  return clientes.find(c => String(c.id) === target) || null;
}
export function procesoForOrdenCompra(procesos, oc){
  if(!oc || !oc.Contrato) return null;
  const target = normalize(oc.Contrato);
  return procesos.find(p => normalize(p.NumeroContrato) === target) || null;
}
// El número de orden de compra es directamente el ID del elemento en
// SharePoint (a diferencia de Factura, que suma 91 por numeración heredada
// de Access) — no hace falta guardar un número aparte en ninguna columna.
export function ordenCompraNumero(oc){
  return oc && oc.id!=null ? String(oc.id) : "";
}
export function ordenCompraLineItems(oc){
  return Array.from({length:6}, (_,i) => i+1).map(n => {
    const Cantidad = oc[`Cantidad${n}`] || "";
    const ValorUnitario = oc[`ValorUnitario${n}`] || "";
    const totalGuardado = parseMonto(oc[`Total${n}`]);
    const Total = totalGuardado > 0 ? totalGuardado : parseMonto(Cantidad) * parseMonto(ValorUnitario);
    return { n, Descripcion: oc[`Descripcion${n}`] || "", Cantidad, ValorUnitario, Total };
  });
}
export function computeOrdenCompraTotals(oc){
  const subtotalCalc = ordenCompraLineItems(oc).reduce((sum,li) => sum + parseMonto(li.Total), 0);
  const subtotalStored = parseMonto(oc.Subtotal);
  const subtotal = subtotalStored > 0 ? subtotalStored : subtotalCalc;
  const ivaStored = parseMonto(oc.Iva);
  const iva = ivaStored > 0 ? ivaStored : subtotal * (IVA_RATE_DEFAULT/100);
  const totalStored = parseMonto(oc.Total);
  const total = totalStored > 0 ? totalStored : subtotal + iva;
  return { subtotal, iva, total };
}
// La orden de compra guarda automáticamente, en su propio campo "Factura", el
// número de la factura de "base facturas" que comparte el mismo Contrato (si
// hay varias coincidencias se toma la de número más alto/reciente) — así
// queda la referencia cruzada sin que el usuario tenga que buscarla a mano.
export function facturaForOrdenCompra(facturas, oc){
  if(!oc || !oc.Contrato) return null;
  const target = normalize(oc.Contrato);
  const matches = (facturas||[]).filter(f => normalize(f.Contrato) === target);
  if(!matches.length) return null;
  return matches.reduce((best,f) => Number(facturaNumero(f)) > Number(facturaNumero(best)) ? f : best);
}
