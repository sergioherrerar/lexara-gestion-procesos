import { useState, useCallback, useEffect } from 'react';
import { INITIAL_CONFIG, SHAREPOINT_LISTS_CONFIG, DEMO_PROCESOS, DEMO_CLIENTES, DEMO_FACTURAS, DEMO_ORDENES_COMPRA, DEMO_COLABORADORES, DEMO_FORMAS_PAGO, DEMO_DESISTIMIENTOS, DEMO_TIPOS_ACCION, DEMO_TUTELAS, DEMO_TEMAS, DEMO_VALORES_ENTIDAD, DEMO_HORAS_EXTRAS } from '../config';
import * as Graph from '../lib/graph';
import { canWrite as canWriteForColaborador, modulosPermitidosDe, MODULOS_DISPONIBLES } from '../lib/permissions';

// El mapeo de columnas que se confirma en Configuración vivía solo en memoria
// de React — al recargar la página o volver a iniciar sesión normal (sin
// pasar por Configuración) se perdía y todo volvía a los mapeos vacíos de
// config.js, aunque ya se hubiera mapeado antes. Se guarda en localStorage
// (por navegador/equipo) para que el mapeo confirmado quede aplicado en el
// siguiente inicio de sesión sin tener que repetir Configuración cada vez.
const LIST_MAPPINGS_KEY = 'lexara-list-mappings-v1';
function loadSavedMappings(){
  try{
    const raw = localStorage.getItem(LIST_MAPPINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch{ return {}; }
}

// La gran mayoría de las listas viven en el sitio principal (config.SP_SITE_PATH,
// resuelto una sola vez como defaultSiteId). Algunas listas (Tutelas/Tema/
// Valores Entidad) declaran `sitePathKey` en config.js apuntando a OTRO campo
// de INITIAL_CONFIG con la URL de su propio sitio — acá se resuelve (y se
// cachea en `cache`, para no pedirle a Graph el mismo siteId una vez por
// lista) cuál siteId real le toca a cada lista antes de conectarla.
// `useRootSite` (2026-08-31, Horas Extras) — para una lista que vive en el
// sitio RAÍZ del tenant ("Administracion Lexara" en la UI, sin ningún
// "/sites/algo" en su URL, mismo sitio del Excel de Vacaciones) en vez de un
// sitio con nombre propio — se resuelve distinto (Graph.fetchRootSiteId, sin
// el ":" + ruta que sitePathKey siempre agrega).
async function siteIdForList(config, list, defaultSiteId, cache){
  if(list.useRootSite){
    if(cache.__root) return cache.__root;
    const sid = await Graph.fetchRootSiteId(config);
    cache.__root = sid;
    return sid;
  }
  if(!list.sitePathKey) return defaultSiteId;
  const path = config[list.sitePathKey];
  if(!path){
    throw new Error(`Falta configurar la URL del sitio de SharePoint de "${list.label}" (campo ${list.sitePathKey} en config.js).`);
  }
  if(cache[path]) return cache[path];
  const sid = await Graph.fetchSiteId(config, path);
  cache[path] = sid;
  return sid;
}

// Carga TODAS las listas de golpe (Procesos, Facturación, Tutelas, etc.).
// Antes cada lista se esperaba una detrás de otra (await dentro de un for),
// aunque son llamadas a Graph totalmente independientes entre sí — con ~11
// listas (una de casi mil facturas incluida) eso hacía que iniciar sesión o
// actualizar se sintiera "colgado" más de un minuto. Ahora primero se
// resuelven (en secuencia, son solo 1-2 sitios distintos) los site id de las
// listas que viven en otro sitio de SharePoint, y luego TODAS las listas se
// conectan en paralelo — el tiempo total pasa a ser el de la lista más
// lenta, no la suma de las 11.
async function cargarTodasLasListas(config, lists, sid){
  const siteCache = {};
  for(const list of lists){
    await siteIdForList(config, list, sid, siteCache); // solo para dejar el cache tibio antes del paralelo
  }
  return Promise.all(lists.map(async list => {
    const listSiteId = await siteIdForList(config, list, sid, siteCache);
    const connected = await Graph.connectList(listSiteId, list);
    return {...connected, items: Graph.transformListItems(connected)};
  }));
}

export function useLexaraApp(){
  const [config, setConfigState] = useState(INITIAL_CONFIG);
  const [lists, setLists] = useState(() => {
    const saved = loadSavedMappings();
    return SHAREPOINT_LISTS_CONFIG.map(l => ({...l, mapping:{...l.mapping, ...(saved[l.key]||{})}}));
  });
  const [liveMode, setLiveMode] = useState(false);
  // Corregido 2026-08-19: desde que "ya inició sesión" dejó de esperar a que
  // terminen de cargar las listas (ver finishSignIn más abajo), hay una
  // ventana real donde `colaboradores` todavía está vacío — sin esta bandera,
  // el rol se calculaba como "correo no encontrado" (el caso MÁS
  // restringido: sin Facturación/Órdenes de compra/Configuración, todo en
  // solo lectura) durante esa ventana, en vez de simplemente "todavía no se
  // sabe". Mientras esto sea false, el rol se trata como sin restringir.
  const [colaboradoresListos, setColaboradoresListos] = useState(false);
  const [account, setAccount] = useState(null);
  const [appActive, setAppActive] = useState(false);
  const [view, setView] = useState('dashboard');
  const [testStatus, setTestStatus] = useState(null); // {msg, isError}
  const [siteId, setSiteId] = useState(null);
  const [procesos, setProcesos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [ordenesCompra, setOrdenesCompra] = useState([]);
  const [activeProcesoId, setActiveProcesoId] = useState(null);
  const [draftProceso, setDraftProceso] = useState(null);
  // Aparte del rol (canWrite), cada apertura del panel de Proceso judicial
  // puede pedirse explícitamente "solo ver" (botón de ojo en la tabla) —
  // deja todo en modo consulta aunque el rol sí permita editar.
  const [procesoViewOnly, setProcesoViewOnly] = useState(false);
  // Lista de referencia (sin panel propio) — guía los selects dependientes
  // de Tipo de Acción/Tipo de Proceso/Despacho, ver graph.js.
  const [tiposAccion, setTiposAccion] = useState([]);
  const [activeClienteId, setActiveClienteId] = useState(null);
  const [activeFacturaId, setActiveFacturaId] = useState(null);
  const [draftFactura, setDraftFactura] = useState(null);
  const [autoPrintFacturaId, setAutoPrintFacturaId] = useState(null);
  const [activeOrdenCompraId, setActiveOrdenCompraId] = useState(null);
  const [draftOrdenCompra, setDraftOrdenCompra] = useState(null);
  const [autoPrintOrdenCompraId, setAutoPrintOrdenCompraId] = useState(null);
  const [colaboradores, setColaboradores] = useState([]);
  const [activeColaboradorId, setActiveColaboradorId] = useState(null);
  const [draftColaborador, setDraftColaborador] = useState(null);
  const [formasPago, setFormasPago] = useState([]);
  const [activeFormaPagoId, setActiveFormaPagoId] = useState(null);
  const [draftFormaPago, setDraftFormaPago] = useState(null);
  const [desistimientos, setDesistimientos] = useState([]);
  const [activeDesistimientoId, setActiveDesistimientoId] = useState(null);
  const [draftDesistimiento, setDraftDesistimiento] = useState(null);
  // Módulo Tutelas (agregado 2026-08-16) — Tema y Valores Entidad son listas
  // de referencia sin panel propio (se editan en línea desde TutelaDrawer,
  // igual que Tipos de Acción para Procesos), por eso no tienen
  // active.../draft... propio, solo su propio arreglo + create/save simples.
  const [tutelas, setTutelas] = useState([]);
  const [activeTutelaId, setActiveTutelaId] = useState(null);
  const [draftTutela, setDraftTutela] = useState(null);
  const [temas, setTemas] = useState([]);
  const [valoresEntidad, setValoresEntidad] = useState([]);
  // Horas Extras (Administración, agregado 2026-08-31) — mismo criterio
  // "sin panel propio" que Tema/Valores Entidad, ver createHoraExtra/
  // aprobarHoraExtra más abajo. Ver [[project_horas_extras]].
  const [horasExtras, setHorasExtras] = useState([]);
  // Cuando se abre/crea una factura, orden de compra, forma de pago o
  // desistimiento DESDE dentro de un proceso, se guarda aquí su id — al
  // cerrar ese panel se reabre el mismo proceso en vez de dejar solo la
  // lista de fondo (ver rememberReturnToProceso/reabrirProcesoSiCorresponde).
  const [returnToProcesoId, setReturnToProcesoId] = useState(null);
  const [currentFilter, setCurrentFilter] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [toast, setToast] = useState(null); // {msg, type}
  const [confirmState, setConfirmState] = useState(null); // {message, onConfirm}

  // Reemplaza alert() — un aviso flotante con el estilo de la app en vez del
  // cuadro nativo del navegador. Los de tipo 'error' se quedan hasta que se
  // cierren a mano con la X (2026-08-19: un aviso de error que desaparece
  // solo a los 5s es fácil de perder justo cuando más hace falta leerlo
  // completo para reportarlo — como el error real de carga de datos que
  // ahora puede salir después de iniciar sesión). Los demás (info/éxito)
  // se cierran solos a los 5s como antes.
  const notify = useCallback((msg, type = 'info') => {
    setToast({ msg, type });
  }, []);
  function closeToast(){ setToast(null); }
  useEffect(() => {
    if(!toast || toast.type === 'error') return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Reemplaza confirm() — abre un modal propio; onConfirmed solo corre si el
  // usuario acepta explícitamente.
  function requestConfirm(message, onConfirmed){
    setConfirmState({ message, onConfirmed });
  }
  function cancelConfirm(){ setConfirmState(null); }
  function acceptConfirm(){
    const fn = confirmState?.onConfirmed;
    setConfirmState(null);
    if(fn) fn();
  }

  // Cada vez que el mapeo de alguna lista cambia (al conectar y adivinar
  // columnas, al ajustar un select a mano, o al aplicar mapeo), se guarda en
  // localStorage para que el próximo inicio de sesión ya lo tenga listo.
  useEffect(() => {
    try{
      const toSave = {};
      lists.forEach(l => { toSave[l.key] = l.mapping; });
      localStorage.setItem(LIST_MAPPINGS_KEY, JSON.stringify(toSave));
    }catch{ /* localStorage no disponible — no es crítico */ }
  }, [lists]);

  const listByKey = useCallback((key) => lists.find(l => l.key===key), [lists]);

  function enterDemo(silent){
    setLiveMode(false);
    setProcesos(JSON.parse(JSON.stringify(DEMO_PROCESOS)));
    setClientes(JSON.parse(JSON.stringify(DEMO_CLIENTES)));
    setFacturas(JSON.parse(JSON.stringify(DEMO_FACTURAS)));
    setOrdenesCompra(JSON.parse(JSON.stringify(DEMO_ORDENES_COMPRA)));
    setColaboradores(JSON.parse(JSON.stringify(DEMO_COLABORADORES)));
    setFormasPago(JSON.parse(JSON.stringify(DEMO_FORMAS_PAGO)));
    setDesistimientos(JSON.parse(JSON.stringify(DEMO_DESISTIMIENTOS)));
    setTiposAccion(JSON.parse(JSON.stringify(DEMO_TIPOS_ACCION)));
    setTutelas(JSON.parse(JSON.stringify(DEMO_TUTELAS)));
    setTemas(JSON.parse(JSON.stringify(DEMO_TEMAS)));
    setValoresEntidad(JSON.parse(JSON.stringify(DEMO_VALORES_ENTIDAD)));
    setHorasExtras(JSON.parse(JSON.stringify(DEMO_HORAS_EXTRAS)));
    setAccount({ name:"Usuario Demo", username:"demo@lexara.com" });
    setAppActive(true);
    if(!silent) setView('dashboard');
  }

  function goSetup(){
    enterDemo(true);
    setView('setup');
  }

  async function testConnection(accOverride){
    setTestStatus({msg:"Conectando con SharePoint…", isError:false});
    try{
      let acc = accOverride;
      if(!acc){
        acc = await Graph.completeSignInFromRedirect(config);
        if(!acc){
          // No hay cuenta todavía: manda a Microsoft (navega la página
          // completa, ya no es un popup) — al volver, esta misma pantalla
          // de Configuración retoma la conexión.
          await Graph.beginSignIn(config);
          return;
        }
      }
      setAccount(acc);
      const sid = siteId || await Graph.fetchSiteId(config);
      setSiteId(sid);
      const siteCache = {};
      const updated = [];
      for(const list of lists){
        try{
          const listSiteId = await siteIdForList(config, list, sid, siteCache);
          const connected = await Graph.connectList(listSiteId, list);
          // Pre-carga las adivinanzas en el mapeo real (no solo visual), para
          // que "Aplicar mapeo" funcione aunque el usuario no toque un select.
          updated.push({...connected, mapping: Graph.guessListMapping(connected)});
        }catch(err){
          updated.push({...list, connectError: err.message});
        }
      }
      setLists(updated);
      const ok = updated.filter(l => !l.connectError);
      setTestStatus({msg:`Conectado. ${ok.length} de ${updated.length} listas leídas correctamente.`, isError: ok.length < updated.length});
    }catch(err){
      console.error(err);
      setTestStatus({msg:"No se pudo conectar: " + err.message, isError:true});
    }
  }

  // Termina el inicio de sesión una vez que ya se tiene la cuenta de
  // Microsoft (venga de un redirect recién completado, o de una cuenta ya
  // en caché al recargar la página).
  //
  // Corregido 2026-08-19 — bug real: "al darle F5 se sale al login" en
  // cualquier módulo. `appActive` (lo único que decide si se muestra la
  // pantalla de login o la app) se ponía en true recién AL FINAL, después de
  // recargar sin fallar ~11 listas de SharePoint (2 sitios distintos) una
  // por una. Si CUALQUIERA de esas llamadas fallaba (una intermitencia de
  // red, un token que tardó, un límite de Graph) el catch de abajo lo
  // atrapaba en silencio y el usuario, que sí tenía una sesión válida,
  // quedaba viendo la pantalla de login sin ningún aviso claro de qué pasó.
  // Ahora "ya inició sesión" (appActive/liveMode) y "ya cargaron los datos"
  // son independientes: en cuanto se confirma la cuenta, se entra a la app
  // de una vez — la carga de listas corre aparte y, si falla, se avisa con
  // un error que no desaparece solo (para que si vuelve a pasar, el aviso
  // en pantalla diga exactamente cuál fue el error real) y el usuario puede
  // reintentar con el botón de Actualizar sin tener que iniciar sesión de nuevo.
  async function finishSignIn(acc){
    if(!Graph.allRequiredMapped(lists)){
      setAccount(acc);
      setAppActive(true);
      setView('setup');
      try{ await testConnection(acc); }
      catch(err){
        console.error(err);
        notify("No fue posible completar el inicio de sesión. Revisa la consola para más detalle.", 'error');
      }
      return;
    }
    // Cuenta confirmada — entra a la app de inmediato, sin esperar a que
    // termine de cargar todas las listas.
    setAccount(acc);
    setLiveMode(true);
    setAppActive(true);
    try{
      const sid = await Graph.fetchSiteId(config);
      const updated = await cargarTodasLasListas(config, lists, sid);
      // DESACTIVADO TEMPORALMENTE (2026-08-08) a pedido del usuario: este
      // bloqueo por Correo en Colaborador Lexara estaba dejando afuera a
      // TODAS las cuentas, incluidas las 4 autorizadas. Con el cambio de
      // loginPopup a loginRedirect es posible que la causa real fuera el
      // popup atascado (nunca llegaba a este código) y no el mapeo — hay
      // que confirmar con el usuario antes de reactivar esto.
      const colaboradoresItems = updated.find(l => l.key==='colaboradores')?.items || [];
      // const emailIngreso = (acc.username || '').trim().toLowerCase();
      // const autorizado = colaboradoresItems.some(c => (c.Correo||'').trim().toLowerCase() === emailIngreso);
      // if(!autorizado){
      //   Graph.clearSession();
      //   notify(`La cuenta ${acc.username} no está autorizada para ingresar. Si necesitas acceso, escribe a Soporte@lexaraabogados.com solicitando el ingreso.`, 'error');
      //   return;
      // }
      setSiteId(sid);
      setLists(updated);
      setProcesos(updated.find(l => l.key==='procesos')?.items || []);
      setClientes(updated.find(l => l.key==='clientes')?.items || []);
      setFacturas(updated.find(l => l.key==='facturacion')?.items || []);
      setOrdenesCompra(updated.find(l => l.key==='ordenesCompra')?.items || []);
      setColaboradores(colaboradoresItems);
      setColaboradoresListos(true);
      setFormasPago(updated.find(l => l.key==='formasPago')?.items || []);
      setDesistimientos(updated.find(l => l.key==='desistimientos')?.items || []);
      setTiposAccion(updated.find(l => l.key==='tiposAccion')?.items || []);
      setTutelas(updated.find(l => l.key==='tutelas')?.items || []);
      setTemas(updated.find(l => l.key==='temas')?.items || []);
      setValoresEntidad(updated.find(l => l.key==='valoresEntidad')?.items || []);
      setHorasExtras(updated.find(l => l.key==='horasExtras')?.items || []);
    }catch(err){
      console.error(err);
      notify("Se inició sesión, pero no se pudieron cargar los datos de SharePoint: " + err.message + " — probá el botón de Actualizar.", 'error');
    }
  }

  // Antes esto esperaba un popup de Microsoft y seguía en la misma función.
  // Ahora loginRedirect navega la página completa a Microsoft — no hay nada
  // que esperar aquí, la página se recarga y el useEffect de abajo
  // (completeSignInFromRedirect) retoma y llama a finishSignIn().
  function signIn(){
    if(!config.CLIENT_ID || !config.TENANT_ID){
      notify("Primero configura Client ID y Tenant ID en la sección de Configuración.", 'error');
      goSetup();
      return;
    }
    setSigningIn(true);
    Promise.resolve(Graph.beginSignIn(config)).catch(err => {
      console.error(err);
      notify("No fue posible iniciar sesión. Revisa la consola para más detalle.", 'error');
      setSigningIn(false);
    });
  }

  // Al arrancar la app: si la URL trae la respuesta de Microsoft (porque
  // venimos de signIn()), la procesa y termina el inicio de sesión. Si no
  // hay nada que procesar pero ya había una cuenta en la caché de esta
  // pestaña (recargaste la página estando conectado), también sigue de una
  // vez sin pedir que inicies sesión otra vez.
  useEffect(() => {
    if(!(config.CLIENT_ID && config.TENANT_ID)) return;
    let cancelado = false;
    setSigningIn(true);
    (async () => {
      try{
        const acc = await Graph.completeSignInFromRedirect(config);
        if(cancelado) return;
        if(acc) await finishSignIn(acc);
      }catch(err){
        console.error(err);
        if(!cancelado) notify("No fue posible completar el inicio de sesión. Revisa la consola para más detalle.", 'error');
      }
      if(!cancelado) setSigningIn(false);
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshData(){
    if(!liveMode || refreshing) return;
    setRefreshing(true);
    try{
      const sid = siteId || await Graph.fetchSiteId(config);
      setSiteId(sid);
      const updated = await cargarTodasLasListas(config, lists, sid);
      setLists(updated);
      setProcesos(updated.find(l => l.key==='procesos')?.items || []);
      setClientes(updated.find(l => l.key==='clientes')?.items || []);
      setFacturas(updated.find(l => l.key==='facturacion')?.items || []);
      setOrdenesCompra(updated.find(l => l.key==='ordenesCompra')?.items || []);
      setColaboradores(updated.find(l => l.key==='colaboradores')?.items || []);
      setColaboradoresListos(true);
      setFormasPago(updated.find(l => l.key==='formasPago')?.items || []);
      setDesistimientos(updated.find(l => l.key==='desistimientos')?.items || []);
      setTiposAccion(updated.find(l => l.key==='tiposAccion')?.items || []);
      setTutelas(updated.find(l => l.key==='tutelas')?.items || []);
      setTemas(updated.find(l => l.key==='temas')?.items || []);
      setValoresEntidad(updated.find(l => l.key==='valoresEntidad')?.items || []);
      setHorasExtras(updated.find(l => l.key==='horasExtras')?.items || []);
    }catch(err){
      console.error(err);
      notify("No se pudo actualizar la información: " + err.message, 'error');
    }
    setRefreshing(false);
  }

  function updateListMapping(listKey, fieldKey, value){
    setLists(prev => prev.map(l => {
      if(l.key !== listKey) return l;
      const mapping = {...l.mapping};
      if(value) mapping[fieldKey] = value; else delete mapping[fieldKey];
      return {...l, mapping};
    }));
  }

  function applyAllMappings(){
    const missing = [];
    lists.forEach(list => {
      if(list.connectError) return;
      const faltan = list.semanticFields.filter(f => f.required && !list.mapping[f.key]);
      if(faltan.length) missing.push(`${list.label}: ${faltan.map(f=>f.label).join(", ")}`);
    });
    if(missing.length){
      notify("Mapea los campos obligatorios antes de continuar: " + missing.join(" · "), 'error');
      return;
    }
    const updated = lists.map(list => list.connectError ? list : {...list, items: Graph.transformListItems(list)});
    setLists(updated);
    setProcesos(updated.find(l => l.key==='procesos')?.items || []);
    setClientes(updated.find(l => l.key==='clientes')?.items || []);
    setFacturas(updated.find(l => l.key==='facturacion')?.items || []);
    setOrdenesCompra(updated.find(l => l.key==='ordenesCompra')?.items || []);
    setColaboradores(updated.find(l => l.key==='colaboradores')?.items || []);
    setFormasPago(updated.find(l => l.key==='formasPago')?.items || []);
    setDesistimientos(updated.find(l => l.key==='desistimientos')?.items || []);
    setTiposAccion(updated.find(l => l.key==='tiposAccion')?.items || []);
    setTutelas(updated.find(l => l.key==='tutelas')?.items || []);
    setTemas(updated.find(l => l.key==='temas')?.items || []);
    setValoresEntidad(updated.find(l => l.key==='valoresEntidad')?.items || []);
    setHorasExtras(updated.find(l => l.key==='horasExtras')?.items || []);
    setLiveMode(true);
  }

  function downloadAllMappings(){
    const payload = {CONFIG: config, LISTS: {}};
    lists.forEach(list => { payload.LISTS[list.key] = {listName: list.listName, mapping: list.mapping}; });
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "lexara-mapeo-sharepoint.json";
    a.click();
  }

  function saveConfig(patch){
    const next = {...config, ...patch};
    setConfigState(next);
    if(next.CLIENT_ID && next.TENANT_ID){
      Graph.initMsal(next);
      setTestStatus({msg:'Credenciales guardadas. Ahora pulsa "Conectar y leer columnas".', isError:false});
    } else {
      setTestStatus({msg:"Guarda al menos el Client ID y el Tenant ID.", isError:true});
    }
  }

  function clearConfig(){
    setConfigState(prev => ({...prev, CLIENT_ID:"", TENANT_ID:""}));
  }

  function signOut(){
    setLiveMode(false);
    Graph.clearSession();
    setAccount(null);
    setSiteId(null);
    setAppActive(false);
    setColaboradoresListos(false);
  }

  const activeProceso = draftProceso || procesos.find(p => p.id===activeProcesoId) || null;
  const activeCliente = clientes.find(c => c.id===activeClienteId) || null;
  const activeFactura = draftFactura || facturas.find(f => f.id===activeFacturaId) || null;
  const activeOrdenCompra = draftOrdenCompra || ordenesCompra.find(o => o.id===activeOrdenCompraId) || null;
  const activeColaborador = draftColaborador || colaboradores.find(c => c.id===activeColaboradorId) || null;
  const activeFormaPago = draftFormaPago || formasPago.find(f => f.id===activeFormaPagoId) || null;
  const activeDesistimiento = draftDesistimiento || desistimientos.find(d => d.id===activeDesistimientoId) || null;
  const activeTutela = draftTutela || tutelas.find(t => t.id===activeTutelaId) || null;

  // Colaborador (fila completa de Equipo MD) que hace match por Correo con
  // la cuenta de Microsoft 365 con la que se inició sesión — de ahí salen
  // tanto los módulos permitidos como el permiso de escritura, ver
  // src/lib/permissions.js. Modo demo: acceso completo, para poder mostrar
  // toda la app. Mientras `colaboradoresListos` sea false (la lista todavía
  // no terminó de cargar tras iniciar sesión — ver el bug de F5 corregido
  // 2026-08-19), se trata igual que demo: no hay manera de saber todavía si
  // el correo está o no en Equipo MD, así que no se le puede aplicar ningún
  // bloqueo sin haberlo confirmado primero.
  const colaboradorActual = (!liveMode || !colaboradoresListos) ? null : (() => {
    const email = (account?.username || '').trim().toLowerCase();
    return colaboradores.find(c => (c.Correo||'').trim().toLowerCase() === email) || null;
  })();
  const cargandoPermisos = !liveMode || !colaboradoresListos;
  // `role` ya no decide el acceso (ver permissions.js) — se conserva solo
  // para mostrarlo como dato informativo si hace falta en algún lado.
  const role = cargandoPermisos ? 'Administrador' : (colaboradorActual?.Rol || null);
  const modulosPermitidos = cargandoPermisos ? MODULOS_DISPONIBLES.map(m => m.key) : modulosPermitidosDe(colaboradorActual);
  const canWrite = cargandoPermisos ? true : canWriteForColaborador(colaboradorActual);

  function openProceso(id, opts){ setDraftProceso(null); setActiveProcesoId(id); setProcesoViewOnly(!!(opts && opts.viewOnly)); }
  function closeDrawer(){ setActiveProcesoId(null); setDraftProceso(null); setProcesoViewOnly(false); }
  // El panel de Proceso llama esto justo antes de cerrarse para ir a ver/crear
  // una factura, orden de compra, forma de pago o desistimiento relacionado —
  // guarda el id del proceso para poder volver a él (ver reabrirProcesoSiCorresponde).
  function rememberReturnToProceso(procesoId){ setReturnToProcesoId(procesoId); }
  function reabrirProcesoSiCorresponde(){
    if(returnToProcesoId){
      const id = returnToProcesoId;
      setReturnToProcesoId(null);
      openProceso(id);
    }
  }
  // "+ Nuevo proceso judicial" solo abre un borrador local — no toca
  // SharePoint hasta que el usuario le da "Guardar cambios" (mismo criterio
  // que "Nueva factura"/"Nueva orden de compra"/etc.).
  function newProceso(){ setActiveProcesoId(null); setProcesoViewOnly(false); setDraftProceso({}); }
  // Los campos de Link se envían a Graph como {Url, Description} (así
  // espera Graph una columna de "Hipervínculo"), pero el resto de la app
  // (el propio formulario al reabrir el proceso, las listas relacionadas,
  // etc.) espera un texto plano — si ese objeto se queda tal cual en el
  // estado local, la próxima vez que se abre el proceso truena con
  // "...trim is not a function". Se aplana a solo la URL antes de
  // guardarlo en el estado de React; el objeto completo sigue yendo a
  // Graph sin tocar.
  function flattenLinkValues(updates){
    const out = {};
    Object.keys(updates).forEach(key => {
      const v = updates[key];
      out[key] = (v && typeof v === 'object' && 'Url' in v) ? v.Url : v;
    });
    return out;
  }

  async function saveProceso(updates){
    if(!activeProceso) return;

    if(draftProceso){
      const nuevo = flattenLinkValues(updates);
      if(liveMode){
        setSaving(true);
        const list = listByKey('procesos');
        try{
          const created = await Graph.crearItemConLookups(list.siteId || siteId, list, updates);
          nuevo.id = created.id; nuevo._graphId = created.id;
        }catch(err){ console.error(err); notify("No se pudo crear el proceso en SharePoint: " + err.message, 'error'); setSaving(false); return; }
        setSaving(false);
      } else {
        const maxId = procesos.reduce((max,p) => Math.max(max, Number(p.id)||0), 0);
        nuevo.id = maxId + 1;
      }
      setProcesos(prev => [...prev, nuevo]);
      setDraftProceso(null);
      setActiveProcesoId(null);
      notify("Creado con éxito en Lexara", 'success');
      return;
    }

    setProcesos(prev => prev.map(p => p.id===activeProcesoId ? {...p, ...flattenLinkValues(updates)} : p));
    if(liveMode){
      setSaving(true);
      const list = listByKey('procesos');
      const graphBody = await Graph.graphFieldsFromUpdates(list.siteId || siteId, list, updates);
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${activeProceso._graphId}/fields`, {
          method:"PATCH", body: JSON.stringify(graphBody)
        });
      }catch(err){
        // SharePoint casi nunca dice cuál campo exacto rechazó — se deja
        // en consola el cuerpo enviado completo para poder diagnosticar
        // (F12 → Consola) comparando qué campo tiene un valor inválido
        // para su columna real (p.ej. un Tipo de Proceso/Despacho que no
        // coincide con las opciones fijas de esa columna en SharePoint).
        console.error(err, 'Campos enviados:', graphBody);
        notify(`No se pudo guardar en SharePoint: ${err.message} — campos enviados: ${Object.keys(graphBody).join(', ')}`, 'error');
        setSaving(false); return;
      }
      setSaving(false);
    }
    setActiveProcesoId(null);
    notify("Guardado con éxito en Lexara", 'success');
  }

  function openCliente(id){ setActiveClienteId(id); }
  function closeClienteDrawer(){ setActiveClienteId(null); }
  async function saveCliente(updates){
    if(!activeCliente) return;
    setClientes(prev => prev.map(c => c.id===activeClienteId ? {...c, ...updates} : c));
    if(liveMode){
      setSaving(true);
      const list = listByKey('clientes');
      const fields = await Graph.graphFieldsFromUpdates(list.siteId || siteId, list, updates);
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${activeCliente._graphId || activeCliente.id}/fields`, {
          method:"PATCH", body: JSON.stringify(fields)
        });
      }catch(err){ console.error(err); notify("No se pudo guardar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setActiveClienteId(null);
    notify("Guardado con éxito en Lexara", 'success');
  }
  // A diferencia de saveCliente, no depende del cliente "activo" en su propio
  // drawer — permite corregir un dato del cliente (p.ej. Ciudad) desde otra
  // pantalla, como el formulario de Facturación.
  async function updateCliente(clienteId, updates){
    const cliente = clientes.find(c => String(c.id)===String(clienteId));
    if(!cliente) return;
    setClientes(prev => prev.map(c => c.id===cliente.id ? {...c, ...updates} : c));
    if(liveMode){
      const list = listByKey('clientes');
      const fields = await Graph.graphFieldsFromUpdates(list.siteId || siteId, list, updates);
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${cliente._graphId || cliente.id}/fields`, {
          method:"PATCH", body: JSON.stringify(fields)
        });
      }catch(err){ console.error(err); notify("No se pudo actualizar el cliente en SharePoint: " + err.message, 'error'); }
    }
  }
  // El borrado en sí solo corre si el usuario acepta el modal de confirmación
  // (requestConfirm) — nunca al primer clic, para no borrar por accidente.
  async function performDeleteCliente(id){
    const cliente = clientes.find(c => c.id===id);
    if(!cliente) return;
    if(liveMode){
      setSaving(true);
      const list = listByKey('clientes');
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${cliente._graphId || cliente.id}`, { method:"DELETE" });
      }catch(err){ console.error(err); notify("No se pudo eliminar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setClientes(prev => prev.filter(c => c.id !== id));
    if(activeClienteId === id) setActiveClienteId(null);
  }
  function deleteCliente(id){
    const cliente = clientes.find(c => c.id===id);
    if(!cliente) return;
    requestConfirm(`¿Eliminar al cliente "${cliente.RazonSocial}"? Esta acción no se puede deshacer.`, () => performDeleteCliente(id));
  }
  async function createCliente(fields){
    const nuevo = { id: 'tmp-' + Math.random().toString(36).slice(2), Entidad:"", ...fields };
    if(liveMode){
      setSaving(true);
      const list = listByKey('clientes');
      const { id, ...nuevoSinId } = nuevo;
      try{
        const created = await Graph.crearItemConLookups(list.siteId || siteId, list, nuevoSinId);
        nuevo.id = created.id; nuevo._graphId = created.id;
      }catch(err){ console.error(err); notify("No se pudo crear el cliente en SharePoint: " + err.message, 'error'); setSaving(false); return null; }
      setSaving(false);
    }
    setClientes(prev => [...prev, nuevo]);
    notify("Creado con éxito en Lexara", 'success');
    return nuevo;
  }

  function openFactura(id){ setDraftFactura(null); setActiveFacturaId(id); }
  // Abre la factura e imprime automáticamente, para el botón de imprimir de la tabla.
  function printFactura(id){ setDraftFactura(null); setActiveFacturaId(id); setAutoPrintFacturaId(id); }
  function clearAutoPrint(){ setAutoPrintFacturaId(null); }
  // "+ Nueva factura" solo abre un borrador local — no toca SharePoint hasta
  // que el usuario le da "Guardar cambios" (evita registros vacíos huérfanos).
  function newFactura(){ setActiveFacturaId(null); setDraftFactura({}); }
  // Genérico (2026-08-29, mismo criterio que abrirBorradorOrdenCompra): abre
  // un borrador de Factura con datos ya armados desde afuera — ver
  // "Honorarios por Proceso" en Administración. No toca SharePoint hasta
  // que se le dé "Guardar cambios" en el drawer.
  function abrirBorradorFactura(datosIniciales){
    setActiveFacturaId(null);
    setDraftFactura(datosIniciales);
  }
  // Botón "+ Nueva factura" dentro del panel de un Proceso judicial: abre un
  // borrador con el Contrato (y Proceso) ya llenos desde ese proceso, para
  // no tener que volver a escribirlos.
  function newFacturaFromProceso(proceso){
    setActiveFacturaId(null);
    setDraftFactura({ Contrato: proceso.NumeroContrato || "", Proceso: proceso.Radicado || "" });
  }
  // Pedido explícito del usuario 2026-08-29 (mismo criterio que
  // duplicateTutela): abre un borrador nuevo con todos los datos ya
  // copiados de la factura elegida — salvo "Factura" (el número de factura
  // real, calculado como id+91 de SharePoint — ver [[project_facturacion_data_model]] —
  // no tiene sentido copiarlo, se recalcula solo con el id nuevo al
  // guardar). No toca SharePoint hasta "Guardar cambios".
  function duplicateFactura(id){
    const original = facturas.find(f => f.id===id);
    if(!original) return;
    // eslint-disable-next-line no-unused-vars
    const { id: _id, _graphId, Factura, ...resto } = original;
    setActiveFacturaId(null);
    setDraftFactura(resto);
  }
  // Botón "generar factura" de cada orden de compra: abre un borrador de
  // factura precargado con los mismos datos (cliente, contrato, proceso,
  // líneas de detalle) — solo el Día/Mes/Año cambia, al de hoy. Sigue sin
  // tocar SharePoint hasta que se le dé "Guardar cambios" (mismo criterio
  // que "Nueva factura").
  function createFacturaFromOrdenCompra(ordenCompraId){
    const oc = ordenesCompra.find(o => o.id === ordenCompraId);
    if(!oc) return;
    const hoy = new Date();
    const draft = {
      CodigoCliente: oc.CodigoCliente || "",
      Contrato: oc.Contrato || "",
      Proceso: oc.Proceso || "",
      EtapaContrato: oc.EtapaContrato || "",
      Observacion: oc.Observacion || "",
      Dia: String(hoy.getDate()),
      Mes: String(hoy.getMonth() + 1).padStart(2, '0'),
      Anio: String(hoy.getFullYear()),
    };
    [1,2,3,4,5,6].forEach(n => {
      draft[`Descripcion${n}`] = oc[`Descripcion${n}`] || "";
      draft[`Cantidad${n}`] = oc[`Cantidad${n}`] || "";
      draft[`ValorUnitario${n}`] = oc[`ValorUnitario${n}`] || "";
    });
    setActiveFacturaId(null);
    setDraftFactura(draft);
  }
  function closeFacturaDrawer(){ setActiveFacturaId(null); setDraftFactura(null); reabrirProcesoSiCorresponde(); }
  async function saveFactura(updates){
    if(!activeFactura) return;

    if(draftFactura){
      const nuevo = {...updates};
      if(liveMode){
        setSaving(true);
        const list = listByKey('facturacion');
        try{
          const created = await Graph.crearItemConLookups(list.siteId || siteId, list, updates);
          nuevo.id = created.id; nuevo._graphId = created.id;
          const numero = String(Number(created.id) + 91);
          nuevo.Factura = numero;
          if(list.mapping.Factura){
            await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${created.id}/fields`, {
              method:"PATCH", body: JSON.stringify({ [list.mapping.Factura]: numero })
            });
          }
        }catch(err){ console.error(err); notify("No se pudo crear la factura en SharePoint: " + err.message, 'error'); setSaving(false); return; }
        setSaving(false);
      } else {
        const maxId = facturas.reduce((max,f) => Math.max(max, Number(f.id)||0), 0);
        nuevo.id = maxId + 1;
        nuevo.Factura = String(nuevo.id + 91);
      }
      setFacturas(prev => [...prev, nuevo]);
      setDraftFactura(null);
      setActiveFacturaId(null);
      reabrirProcesoSiCorresponde();
      notify("Creado con éxito en Lexara", 'success');
      return;
    }

    setFacturas(prev => prev.map(f => f.id===activeFacturaId ? {...f, ...updates} : f));
    if(liveMode){
      setSaving(true);
      const list = listByKey('facturacion');
      const graphBody = await Graph.graphFieldsFromUpdates(list.siteId || siteId, list, updates);
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${activeFactura._graphId}/fields`, {
          method:"PATCH", body: JSON.stringify(graphBody)
        });
      }catch(err){ console.error(err); notify("No se pudo guardar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setActiveFacturaId(null);
    reabrirProcesoSiCorresponde();
    notify("Guardado con éxito en Lexara", 'success');
  }

  function openOrdenCompra(id){ setDraftOrdenCompra(null); setActiveOrdenCompraId(id); }
  // Abre la orden de compra e imprime automáticamente, para el botón de imprimir de la tabla.
  function printOrdenCompra(id){ setDraftOrdenCompra(null); setActiveOrdenCompraId(id); setAutoPrintOrdenCompraId(id); }
  function clearAutoPrintOrdenCompra(){ setAutoPrintOrdenCompraId(null); }
  // "+ Nueva orden de compra" solo abre un borrador local — no toca SharePoint
  // hasta que el usuario le da "Guardar cambios" (mismo criterio que Facturación).
  function newOrdenCompra(){ setActiveOrdenCompraId(null); setDraftOrdenCompra({}); }
  // Pedido explícito del usuario 2026-08-29 (mismo criterio que
  // duplicateTutela/duplicateFactura): abre un borrador nuevo con todos los
  // datos ya copiados de la orden de compra elegida. No toca SharePoint
  // hasta "Guardar cambios".
  function duplicateOrdenCompra(id){
    const original = ordenesCompra.find(o => o.id===id);
    if(!original) return;
    // eslint-disable-next-line no-unused-vars
    const { id: _id, _graphId, ...resto } = original;
    setActiveOrdenCompraId(null);
    setDraftOrdenCompra(resto);
  }
  // Botón "+ Nueva orden de compra" dentro del panel de un Proceso judicial —
  // mismo criterio que newFacturaFromProceso.
  function newOrdenCompraFromProceso(proceso){
    setActiveOrdenCompraId(null);
    setDraftOrdenCompra({ Contrato: proceso.NumeroContrato || "", Proceso: proceso.Radicado || "" });
  }
  // Genérico (2026-08-29): abre un borrador de Orden de compra con datos ya
  // armados desde afuera (ver "Órdenes Colmédica" en Administración,
  // src/components/OrdenesColmedicaTab.jsx) — mismo criterio de siempre:
  // no toca SharePoint hasta que se le dé "Guardar cambios" en el drawer.
  function abrirBorradorOrdenCompra(datosIniciales){
    setActiveOrdenCompraId(null);
    setDraftOrdenCompra(datosIniciales);
  }
  function closeOrdenCompraDrawer(){ setActiveOrdenCompraId(null); setDraftOrdenCompra(null); reabrirProcesoSiCorresponde(); }
  async function saveOrdenCompra(updates){
    if(!activeOrdenCompra) return;

    if(draftOrdenCompra){
      const nuevo = {...updates};
      if(liveMode){
        setSaving(true);
        const list = listByKey('ordenesCompra');
        try{
          const created = await Graph.crearItemConLookups(list.siteId || siteId, list, updates);
          nuevo.id = created.id; nuevo._graphId = created.id;
        }catch(err){ console.error(err); notify("No se pudo crear la orden de compra en SharePoint: " + err.message, 'error'); setSaving(false); return; }
        setSaving(false);
      } else {
        const maxId = ordenesCompra.reduce((max,o) => Math.max(max, Number(o.id)||0), 0);
        nuevo.id = maxId + 1;
      }
      setOrdenesCompra(prev => [...prev, nuevo]);
      setDraftOrdenCompra(null);
      setActiveOrdenCompraId(null);
      reabrirProcesoSiCorresponde();
      notify("Creado con éxito en Lexara", 'success');
      return;
    }

    setOrdenesCompra(prev => prev.map(o => o.id===activeOrdenCompraId ? {...o, ...updates} : o));
    if(liveMode){
      setSaving(true);
      const list = listByKey('ordenesCompra');
      const graphBody = await Graph.graphFieldsFromUpdates(list.siteId || siteId, list, updates);
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${activeOrdenCompra._graphId}/fields`, {
          method:"PATCH", body: JSON.stringify(graphBody)
        });
      }catch(err){ console.error(err); notify("No se pudo guardar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setActiveOrdenCompraId(null);
    reabrirProcesoSiCorresponde();
    notify("Guardado con éxito en Lexara", 'success');
  }

  function openColaborador(id){ setDraftColaborador(null); setActiveColaboradorId(id); }
  // "+ Nuevo colaborador" solo abre un borrador local — no toca SharePoint
  // hasta que el usuario le da "Guardar cambios" (mismo criterio que en
  // Facturación/Órdenes de compra).
  function newColaborador(){ setActiveColaboradorId(null); setDraftColaborador({}); }
  function closeColaboradorDrawer(){ setActiveColaboradorId(null); setDraftColaborador(null); }
  async function saveColaborador(updates){
    if(!activeColaborador) return;

    if(draftColaborador){
      const nuevo = {...updates};
      if(liveMode){
        setSaving(true);
        const list = listByKey('colaboradores');
        try{
          const created = await Graph.crearItemConLookups(list.siteId || siteId, list, updates);
          nuevo.id = created.id; nuevo._graphId = created.id;
        }catch(err){ console.error(err); notify("No se pudo crear el colaborador en SharePoint: " + err.message, 'error'); setSaving(false); return; }
        setSaving(false);
      } else {
        const maxId = colaboradores.reduce((max,c) => Math.max(max, Number(c.id)||0), 0);
        nuevo.id = maxId + 1;
      }
      setColaboradores(prev => [...prev, nuevo]);
      setDraftColaborador(null);
      setActiveColaboradorId(null);
      notify("Creado con éxito en Lexara", 'success');
      return;
    }

    setColaboradores(prev => prev.map(c => c.id===activeColaboradorId ? {...c, ...updates} : c));
    if(liveMode){
      setSaving(true);
      const list = listByKey('colaboradores');
      const fields = await Graph.graphFieldsFromUpdates(list.siteId || siteId, list, updates);
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${activeColaborador._graphId}/fields`, {
          method:"PATCH", body: JSON.stringify(fields)
        });
      }catch(err){ console.error(err); notify("No se pudo guardar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setActiveColaboradorId(null);
    notify("Guardado con éxito en Lexara", 'success');
  }
  async function performDeleteColaborador(id){
    const colaborador = colaboradores.find(c => c.id===id);
    if(!colaborador) return;
    if(liveMode){
      setSaving(true);
      const list = listByKey('colaboradores');
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${colaborador._graphId || colaborador.id}`, { method:"DELETE" });
      }catch(err){ console.error(err); notify("No se pudo eliminar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setColaboradores(prev => prev.filter(c => c.id !== id));
    if(activeColaboradorId === id) setActiveColaboradorId(null);
  }
  function deleteColaborador(id){
    const colaborador = colaboradores.find(c => c.id===id);
    if(!colaborador) return;
    requestConfirm(`¿Eliminar al colaborador "${colaborador.Nombre}"? Esta acción no se puede deshacer.`, () => performDeleteColaborador(id));
  }

  function openFormaPago(id){ setDraftFormaPago(null); setActiveFormaPagoId(id); }
  function closeFormaPagoDrawer(){ setActiveFormaPagoId(null); setDraftFormaPago(null); reabrirProcesoSiCorresponde(); }
  // Botón "+ Nueva forma de pago" del panel de un Proceso judicial: abre un
  // borrador con el Contrato ya lleno — sigue sin tocar SharePoint hasta
  // "Guardar cambios" (mismo criterio que Facturas/Órdenes de compra).
  function newFormaPagoFromProceso(proceso){
    setActiveFormaPagoId(null);
    setDraftFormaPago({ Contrato: proceso.NumeroContrato || "" });
  }
  async function saveFormaPago(updates){
    if(!activeFormaPago) return;

    if(draftFormaPago){
      const nuevo = {...updates};
      if(liveMode){
        setSaving(true);
        const list = listByKey('formasPago');
        try{
          const created = await Graph.crearItemConLookups(list.siteId || siteId, list, updates);
          nuevo.id = created.id; nuevo._graphId = created.id;
        }catch(err){ console.error(err); notify("No se pudo crear la forma de pago en SharePoint: " + err.message, 'error'); setSaving(false); return; }
        setSaving(false);
      } else {
        const maxId = formasPago.reduce((max,f) => Math.max(max, Number(f.id)||0), 0);
        nuevo.id = maxId + 1;
      }
      setFormasPago(prev => [...prev, nuevo]);
      setDraftFormaPago(null);
      setActiveFormaPagoId(null);
      reabrirProcesoSiCorresponde();
      notify("Creado con éxito en Lexara", 'success');
      return;
    }

    setFormasPago(prev => prev.map(f => f.id===activeFormaPagoId ? {...f, ...updates} : f));
    if(liveMode){
      setSaving(true);
      const list = listByKey('formasPago');
      const graphBody = await Graph.graphFieldsFromUpdates(list.siteId || siteId, list, updates);
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${activeFormaPago._graphId}/fields`, {
          method:"PATCH", body: JSON.stringify(graphBody)
        });
      }catch(err){ console.error(err); notify("No se pudo guardar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setActiveFormaPagoId(null);
    reabrirProcesoSiCorresponde();
    notify("Guardado con éxito en Lexara", 'success');
  }
  async function performDeleteFormaPago(id){
    const formaPago = formasPago.find(f => f.id===id);
    if(!formaPago) return;
    if(liveMode){
      setSaving(true);
      const list = listByKey('formasPago');
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${formaPago._graphId || formaPago.id}`, { method:"DELETE" });
      }catch(err){ console.error(err); notify("No se pudo eliminar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setFormasPago(prev => prev.filter(f => f.id !== id));
    if(activeFormaPagoId === id) setActiveFormaPagoId(null);
  }
  function deleteFormaPago(id){
    requestConfirm("¿Eliminar esta forma de pago? Esta acción no se puede deshacer.", () => performDeleteFormaPago(id));
  }

  function openDesistimiento(id){ setDraftDesistimiento(null); setActiveDesistimientoId(id); }
  function closeDesistimientoDrawer(){ setActiveDesistimientoId(null); setDraftDesistimiento(null); reabrirProcesoSiCorresponde(); }
  // Botón "+ Nuevo desistimiento" del panel de un Proceso judicial: abre un
  // borrador con el Proceso (ID real) y Numero corto ya llenos — se asocia
  // por ID, no por texto, a diferencia de Facturas/Órdenes/Formas de pago.
  function newDesistimientoFromProceso(proceso){
    setActiveDesistimientoId(null);
    setDraftDesistimiento({ Proceso: proceso.id, NumeroCorto: proceso.Radicado || "" });
  }
  async function saveDesistimiento(updates){
    if(!activeDesistimiento) return;

    if(draftDesistimiento){
      const nuevo = {...updates};
      if(liveMode){
        setSaving(true);
        const list = listByKey('desistimientos');
        try{
          const created = await Graph.crearItemConLookups(list.siteId || siteId, list, updates);
          nuevo.id = created.id; nuevo._graphId = created.id;
        }catch(err){ console.error(err); notify("No se pudo crear el desistimiento en SharePoint: " + err.message, 'error'); setSaving(false); return; }
        setSaving(false);
      } else {
        const maxId = desistimientos.reduce((max,d) => Math.max(max, Number(d.id)||0), 0);
        nuevo.id = maxId + 1;
      }
      setDesistimientos(prev => [...prev, nuevo]);
      setDraftDesistimiento(null);
      setActiveDesistimientoId(null);
      reabrirProcesoSiCorresponde();
      notify("Creado con éxito en Lexara", 'success');
      return;
    }

    setDesistimientos(prev => prev.map(d => d.id===activeDesistimientoId ? {...d, ...updates} : d));
    if(liveMode){
      setSaving(true);
      const list = listByKey('desistimientos');
      const graphBody = await Graph.graphFieldsFromUpdates(list.siteId || siteId, list, updates);
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${activeDesistimiento._graphId}/fields`, {
          method:"PATCH", body: JSON.stringify(graphBody)
        });
      }catch(err){ console.error(err); notify("No se pudo guardar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setActiveDesistimientoId(null);
    reabrirProcesoSiCorresponde();
    notify("Guardado con éxito en Lexara", 'success');
  }
  async function performDeleteDesistimiento(id){
    const desistimiento = desistimientos.find(d => d.id===id);
    if(!desistimiento) return;
    if(liveMode){
      setSaving(true);
      const list = listByKey('desistimientos');
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${desistimiento._graphId || desistimiento.id}`, { method:"DELETE" });
      }catch(err){ console.error(err); notify("No se pudo eliminar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setDesistimientos(prev => prev.filter(d => d.id !== id));
    if(activeDesistimientoId === id) setActiveDesistimientoId(null);
  }
  function deleteDesistimiento(id){
    requestConfirm("¿Eliminar este desistimiento? Esta acción no se puede deshacer.", () => performDeleteDesistimiento(id));
  }

  function openTutela(id){ setDraftTutela(null); setActiveTutelaId(id); }
  // "+ Nueva tutela" solo abre un borrador local — no toca SharePoint hasta
  // que el usuario le da "Guardar cambios" (mismo criterio que el resto de módulos).
  function newTutela(){ setActiveTutelaId(null); setDraftTutela({}); }
  // Pedido explícito del usuario 2026-08-29: varios casos reales de Tutelas
  // comparten TODOS los datos (mismo Proceso/Tema/Juzgado/fechas) y solo
  // cambian de Cliente/Entidad — en vez de repetir el formulario completo a
  // mano, "Duplicar" abre un borrador nuevo (igual que "+ Nueva tutela")
  // pre-llenado con los mismos datos de la tutela elegida, listo para solo
  // cambiar el Cliente y guardar. No toca SharePoint hasta que se le dé
  // "Guardar cambios" — mismo criterio de siempre para un registro nuevo.
  function duplicateTutela(id){
    const original = tutelas.find(t => t.id===id);
    if(!original) return;
    // eslint-disable-next-line no-unused-vars
    const { id: _id, _graphId, ...resto } = original;
    setActiveTutelaId(null);
    setDraftTutela(resto);
  }
  function closeTutelaDrawer(){ setActiveTutelaId(null); setDraftTutela(null); }
  async function saveTutela(updates){
    if(!activeTutela) return;

    if(draftTutela){
      const nuevo = {...updates};
      if(liveMode){
        setSaving(true);
        const list = listByKey('tutelas');
        try{
          const created = await Graph.crearItemConLookups(list.siteId || siteId, list, updates);
          nuevo.id = created.id; nuevo._graphId = created.id;
        }catch(err){ console.error(err); notify("No se pudo crear la tutela en SharePoint: " + err.message, 'error'); setSaving(false); return; }
        setSaving(false);
      } else {
        const maxId = tutelas.reduce((max,t) => Math.max(max, Number(t.id)||0), 0);
        nuevo.id = maxId + 1;
      }
      setTutelas(prev => [...prev, nuevo]);
      setDraftTutela(null);
      setActiveTutelaId(null);
      notify("Creado con éxito en Lexara", 'success');
      return;
    }

    setTutelas(prev => prev.map(t => t.id===activeTutelaId ? {...t, ...updates} : t));
    if(liveMode){
      setSaving(true);
      const list = listByKey('tutelas');
      const graphBody = await Graph.graphFieldsFromUpdates(list.siteId || siteId, list, updates);
      try{
        await Graph.graphFetch(`/sites/${list.siteId || siteId}/lists/${list.listId}/items/${activeTutela._graphId}/fields`, {
          method:"PATCH", body: JSON.stringify(graphBody)
        });
      }catch(err){ console.error(err); notify("No se pudo guardar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setActiveTutelaId(null);
    notify("Guardado con éxito en Lexara", 'success');
  }
  // Corrección masiva puntual 2026-08-28, pedida explícitamente por el
  // usuario: 285 de 322 tutelas (las de agosto) quedaron con "Entidad"
  // vacía en SharePoint — consecuencia directa del bug de la columna Lookup
  // (ver graphFieldsFromUpdates) que hasta hoy impedía guardar cualquier
  // valor real ahí. El usuario confirmó por chat: "el campo entidad debe
  // quedar Grupo Colmedica si las puedes colocar tos por favor de una vez".
  // Resuelve el LookupId UNA sola vez (todas van al mismo valor) y lo
  // reutiliza en cada PATCH, en vez de repetir la búsqueda 285 veces.
  //
  // AJUSTE el mismo día (1): en datos reales, "Entidad" casi nunca estaba
  // TEXTUALMENTE vacía — tenía un valor que no coincide con ninguna Entidad
  // real de "Valores Entidad" (por eso el filtro `!t.Entidad` de la primera
  // versión no encontraba nada que corregir, aunque el Valor Abogado seguía
  // saliendo en 0).
  // AJUSTE (2): tras correr esa versión quedaron ~700 tutelas en "Colmedica"
  // (sin "GRUPO ") sin tocar, porque ese SÍ es un valor real distinto en la
  // lista de origen del Lookup (no calificaba como "inválido"). El usuario
  // confirmó explícitamente que quiere TODAS las tutelas en "GRUPO
  // COLMEDICA" sin excepción — el criterio ya no es "inválida", es
  // simplemente "no es exactamente GRUPO COLMEDICA".
  async function corregirEntidadFaltanteTutelas(){
    const ENTIDAD_UNIFICADA = "GRUPO COLMEDICA";
    const pendientes = tutelas.filter(t => t.Entidad !== ENTIDAD_UNIFICADA);
    if(!pendientes.length){ notify?.("Todas las tutelas ya tienen Entidad en GRUPO COLMEDICA.", 'info'); return { ok:0, fallidas:0 }; }
    setSaving(true);
    const list = listByKey('tutelas');
    const siteIdReal = list.siteId || siteId;
    let graphBody;
    try{
      graphBody = await Graph.graphFieldsFromUpdates(siteIdReal, list, { Entidad: "GRUPO COLMEDICA" });
    }catch(err){
      console.error(err); notify?.("No se pudo resolver la Entidad: " + err.message, 'error'); setSaving(false); return { ok:0, fallidas: pendientes.length };
    }
    let ok = 0, fallidas = 0;
    const idsOk = new Set();
    for(const t of pendientes){
      try{
        await Graph.graphFetch(`/sites/${siteIdReal}/lists/${list.listId}/items/${t._graphId || t.id}/fields`, {
          method:"PATCH", body: JSON.stringify(graphBody)
        });
        ok++; idsOk.add(t.id);
      }catch(err){ console.error('Entidad fix falló para tutela', t.id, err); fallidas++; }
      // Con ~700 registros esto puede tardar varios minutos — deja avance en
      // consola para poder confirmar que sigue corriendo (no se ve nada en
      // pantalla mientras tanto, el botón solo dice "Corrigiendo…").
      if((ok+fallidas) % 25 === 0) console.log(`[Lexara] Corrigiendo Entidad: ${ok+fallidas}/${pendientes.length}`);
    }
    setTutelas(prev => prev.map(t => idsOk.has(t.id) ? {...t, Entidad: "GRUPO COLMEDICA"} : t));
    setSaving(false);
    notify?.(`Entidad actualizada en ${ok} tutela(s)${fallidas ? ` — ${fallidas} fallaron (revisa la consola)` : ""}.`, fallidas ? 'error' : 'success');
    return { ok, fallidas };
  }
  async function performDeleteTutela(id){
    const tutela = tutelas.find(t => t.id===id);
    if(!tutela) return;
    if(liveMode){
      setSaving(true);
      const list = listByKey('tutelas');
      try{
        await Graph.graphFetch(`/sites/${list.siteId || siteId}/lists/${list.listId}/items/${tutela._graphId || tutela.id}`, { method:"DELETE" });
      }catch(err){ console.error(err); notify("No se pudo eliminar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setTutelas(prev => prev.filter(t => t.id !== id));
    if(activeTutelaId === id) setActiveTutelaId(null);
  }
  function deleteTutela(id){
    requestConfirm("¿Eliminar esta tutela? Esta acción no se puede deshacer.", () => performDeleteTutela(id));
  }

  // Tema y Valores Entidad son listas de referencia sin panel propio — se
  // editan en línea desde los botones "Tema"/"Valor entidad" del formulario
  // de Tutela (ver TutelaDrawer.jsx), por eso solo tienen un crear/guardar
  // simple (sin draft/active), igual de directo que createCliente.
  async function createTema(fields){
    const nuevo = { id: 'tmp-' + Math.random().toString(36).slice(2), ...fields };
    if(liveMode){
      setSaving(true);
      const list = listByKey('temas');
      const { id, ...nuevoSinId } = nuevo;
      try{
        const created = await Graph.crearItemConLookups(list.siteId || siteId, list, nuevoSinId);
        nuevo.id = created.id; nuevo._graphId = created.id;
      }catch(err){ console.error(err); notify("No se pudo crear el tema en SharePoint: " + err.message, 'error'); setSaving(false); return null; }
      setSaving(false);
    }
    setTemas(prev => [...prev, nuevo]);
    notify("Creado con éxito en Lexara", 'success');
    return nuevo;
  }
  async function saveTema(id, updates){
    const tema = temas.find(t => t.id===id);
    if(!tema) return;
    setTemas(prev => prev.map(t => t.id===id ? {...t, ...updates} : t));
    if(liveMode){
      setSaving(true);
      const list = listByKey('temas');
      const fields = await Graph.graphFieldsFromUpdates(list.siteId || siteId, list, updates);
      try{
        await Graph.graphFetch(`/sites/${list.siteId || siteId}/lists/${list.listId}/items/${tema._graphId || tema.id}/fields`, {
          method:"PATCH", body: JSON.stringify(fields)
        });
      }catch(err){ console.error(err); notify("No se pudo guardar el tema en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    notify("Guardado con éxito en Lexara", 'success');
  }
  async function createValorEntidad(fields){
    const nuevo = { id: 'tmp-' + Math.random().toString(36).slice(2), ...fields };
    if(liveMode){
      setSaving(true);
      const list = listByKey('valoresEntidad');
      const { id, ...nuevoSinId } = nuevo;
      try{
        const created = await Graph.crearItemConLookups(list.siteId || siteId, list, nuevoSinId);
        nuevo.id = created.id; nuevo._graphId = created.id;
      }catch(err){ console.error(err); notify("No se pudo crear el valor de entidad en SharePoint: " + err.message, 'error'); setSaving(false); return null; }
      setSaving(false);
    }
    setValoresEntidad(prev => [...prev, nuevo]);
    notify("Creado con éxito en Lexara", 'success');
    return nuevo;
  }
  async function saveValorEntidad(id, updates){
    const valor = valoresEntidad.find(v => v.id===id);
    if(!valor) return;
    setValoresEntidad(prev => prev.map(v => v.id===id ? {...v, ...updates} : v));
    if(liveMode){
      setSaving(true);
      const list = listByKey('valoresEntidad');
      const fields = await Graph.graphFieldsFromUpdates(list.siteId || siteId, list, updates);
      try{
        await Graph.graphFetch(`/sites/${list.siteId || siteId}/lists/${list.listId}/items/${valor._graphId || valor.id}/fields`, {
          method:"PATCH", body: JSON.stringify(fields)
        });
      }catch(err){ console.error(err); notify("No se pudo guardar el valor de entidad en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    notify("Guardado con éxito en Lexara", 'success');
  }

  // Horas Extras (Administración) — mismo criterio "sin panel propio" que
  // Tema/Valores Entidad. `fields` ya viene con las 4 categorías calculadas
  // (ver clasificarHorasExtra en lib/horasExtras.js) — acá solo se crea el
  // registro, siempre con Aprobado:false al principio (lo aprueba
  // Administrador/jefe aparte, ver aprobarHoraExtra).
  async function createHoraExtra(fields){
    const nuevo = { id: 'tmp-' + Math.random().toString(36).slice(2), Aprobado: false, ...fields };
    if(liveMode){
      setSaving(true);
      const list = listByKey('horasExtras');
      const { id, ...nuevoSinId } = nuevo;
      try{
        const created = await Graph.crearItemConLookups(list.siteId || siteId, list, nuevoSinId);
        nuevo.id = created.id; nuevo._graphId = created.id;
      }catch(err){ console.error(err); notify("No se pudo crear la hora extra en SharePoint: " + err.message, 'error'); setSaving(false); return null; }
      setSaving(false);
    }
    setHorasExtras(prev => [...prev, nuevo]);
    notify("Creado con éxito en Lexara", 'success');
    return nuevo;
  }
  // Chulo de aprobación — separado de un "saveHoraExtra" genérico porque es
  // la ÚNICA edición que tiene esta lista (los demás campos no se editan
  // después de creados, si algo quedó mal se borra y se vuelve a registrar).
  async function aprobarHoraExtra(id, aprobado){
    const hora = horasExtras.find(h => h.id===id);
    if(!hora) return;
    setHorasExtras(prev => prev.map(h => h.id===id ? {...h, Aprobado: aprobado} : h));
    if(liveMode){
      setSaving(true);
      const list = listByKey('horasExtras');
      const fields = await Graph.graphFieldsFromUpdates(list.siteId || siteId, list, { Aprobado: aprobado });
      try{
        await Graph.graphFetch(`/sites/${list.siteId || siteId}/lists/${list.listId}/items/${hora._graphId || hora.id}/fields`, {
          method:"PATCH", body: JSON.stringify(fields)
        });
      }catch(err){ console.error(err); notify("No se pudo guardar la aprobación en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    notify("Guardado con éxito en Lexara", 'success');
  }
  // Editar una hora extra ya registrada (Informes, "botón de editar por si
  // algo quedó mal") — pedido explícito del usuario 2026-08-31, MISMO día que
  // se agregó el registro ahí. Bloqueado en el código (no solo ocultando el
  // botón en la UI) si ya está Aprobada — "después de aprobados no se pueden
  // modificar" — así ni una llamada directa a esta función podría saltarse la
  // regla.
  async function editarHoraExtra(id, updates){
    const hora = horasExtras.find(h => h.id===id);
    if(!hora) return;
    if(hora.Aprobado){ notify("Esta hora extra ya fue aprobada, no se puede modificar.", 'error'); return; }
    setHorasExtras(prev => prev.map(h => h.id===id ? {...h, ...updates} : h));
    if(liveMode){
      setSaving(true);
      const list = listByKey('horasExtras');
      const fields = await Graph.graphFieldsFromUpdates(list.siteId || siteId, list, updates);
      try{
        await Graph.graphFetch(`/sites/${list.siteId || siteId}/lists/${list.listId}/items/${hora._graphId || hora.id}/fields`, {
          method:"PATCH", body: JSON.stringify(fields)
        });
      }catch(err){ console.error(err); notify("No se pudo guardar los cambios en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    notify("Guardado con éxito en Lexara", 'success');
  }
  // Eliminar una hora extra (Informes, "botón eliminar de la misma forma
  // editar si ya está aprobado no se pueda eliminar") — pedido explícito del
  // usuario 2026-08-31, mismo bloqueo que editarHoraExtra (ya aprobada =
  // bloqueada, reforzado en el código, no solo ocultando el botón).
  async function performEliminarHoraExtra(id){
    const hora = horasExtras.find(h => h.id===id);
    if(!hora) return;
    if(hora.Aprobado){ notify("Esta hora extra ya fue aprobada, no se puede eliminar.", 'error'); return; }
    if(liveMode){
      setSaving(true);
      const list = listByKey('horasExtras');
      try{
        await Graph.graphFetch(`/sites/${list.siteId || siteId}/lists/${list.listId}/items/${hora._graphId || hora.id}`, { method:"DELETE" });
      }catch(err){ console.error(err); notify("No se pudo eliminar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setHorasExtras(prev => prev.filter(h => h.id !== id));
  }
  function eliminarHoraExtra(id){
    const hora = horasExtras.find(h => h.id===id);
    if(hora?.Aprobado){ notify("Esta hora extra ya fue aprobada, no se puede eliminar.", 'error'); return; }
    requestConfirm("¿Eliminar esta hora extra? Esta acción no se puede deshacer.", () => performEliminarHoraExtra(id));
  }

  return {
    config, saveConfig, clearConfig,
    lists, listByKey, updateListMapping,
    liveMode, account, appActive, view, setView, role, canWrite, modulosPermitidos,
    testStatus, testConnection, applyAllMappings, downloadAllMappings,
    refreshData, refreshing,
    signIn, enterDemo, goSetup, signOut,
    saving, signingIn,
    toast, closeToast, confirmState, acceptConfirm, cancelConfirm, notify, requestConfirm,
    procesos, clientes, facturas, ordenesCompra, colaboradores, formasPago, desistimientos, tiposAccion,
    tutelas, temas, valoresEntidad, horasExtras,
    currentFilter, setFilter: setCurrentFilter, searchQuery, setSearchQuery: setSearchQuery,
    onSearch: setSearchQuery,
    activeProceso, openProceso, newProceso, closeDrawer, saveProceso, procesoViewOnly, rememberReturnToProceso,
    activeCliente, openCliente, closeClienteDrawer, saveCliente, deleteCliente, createCliente, updateCliente,
    activeFactura, openFactura, newFactura, duplicateFactura, abrirBorradorFactura, closeFacturaDrawer, saveFactura,
    printFactura, autoPrintFacturaId, clearAutoPrint, createFacturaFromOrdenCompra, newFacturaFromProceso,
    activeOrdenCompra, openOrdenCompra, newOrdenCompra, duplicateOrdenCompra, newOrdenCompraFromProceso, abrirBorradorOrdenCompra, closeOrdenCompraDrawer, saveOrdenCompra,
    printOrdenCompra, autoPrintOrdenCompraId, clearAutoPrintOrdenCompra,
    activeColaborador, openColaborador, newColaborador, closeColaboradorDrawer, saveColaborador, deleteColaborador,
    activeFormaPago, openFormaPago, newFormaPagoFromProceso, closeFormaPagoDrawer, saveFormaPago, deleteFormaPago,
    activeDesistimiento, openDesistimiento, newDesistimientoFromProceso, closeDesistimientoDrawer, saveDesistimiento, deleteDesistimiento,
    activeTutela, openTutela, newTutela, duplicateTutela, closeTutelaDrawer, saveTutela, deleteTutela, corregirEntidadFaltanteTutelas,
    createTema, saveTema, createValorEntidad, saveValorEntidad,
    createHoraExtra, aprobarHoraExtra, editarHoraExtra, eliminarHoraExtra,
  };
}
