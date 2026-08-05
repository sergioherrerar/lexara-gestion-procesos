import { useState, useCallback, useEffect } from 'react';
import { INITIAL_CONFIG, SHAREPOINT_LISTS_CONFIG, DEMO_PROCESOS, DEMO_CLIENTES, DEMO_FACTURAS, DEMO_ORDENES_COMPRA } from '../config';
import * as Graph from '../lib/graph';

export function useLexaraApp(){
  const [config, setConfigState] = useState(INITIAL_CONFIG);
  const [lists, setLists] = useState(() => SHAREPOINT_LISTS_CONFIG.map(l => ({...l, mapping:{...l.mapping}})));
  const [liveMode, setLiveMode] = useState(false);
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
  const [activeClienteId, setActiveClienteId] = useState(null);
  const [activeFacturaId, setActiveFacturaId] = useState(null);
  const [draftFactura, setDraftFactura] = useState(null);
  const [autoPrintFacturaId, setAutoPrintFacturaId] = useState(null);
  const [activeOrdenCompraId, setActiveOrdenCompraId] = useState(null);
  const [draftOrdenCompra, setDraftOrdenCompra] = useState(null);
  const [autoPrintOrdenCompraId, setAutoPrintOrdenCompraId] = useState(null);
  const [currentFilter, setCurrentFilter] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [toast, setToast] = useState(null); // {msg, type}
  const [confirmState, setConfirmState] = useState(null); // {message, onConfirm}

  // Reemplaza alert() — un aviso flotante con el estilo de la app en vez del
  // cuadro nativo del navegador. Se cierra solo a los 5s o al hacer clic en la X.
  const notify = useCallback((msg, type = 'info') => {
    setToast({ msg, type });
  }, []);
  function closeToast(){ setToast(null); }
  useEffect(() => {
    if(!toast) return;
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

  // Arranque: si ya hay credenciales fijas en el código, prepara MSAL de una vez.
  useEffect(() => {
    if(config.CLIENT_ID && config.TENANT_ID) Graph.initMsal(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listByKey = useCallback((key) => lists.find(l => l.key===key), [lists]);

  function enterDemo(silent){
    setLiveMode(false);
    setProcesos(JSON.parse(JSON.stringify(DEMO_PROCESOS)));
    setClientes(JSON.parse(JSON.stringify(DEMO_CLIENTES)));
    setFacturas(JSON.parse(JSON.stringify(DEMO_FACTURAS)));
    setOrdenesCompra(JSON.parse(JSON.stringify(DEMO_ORDENES_COMPRA)));
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
      const acc = accOverride || await Graph.ensureSignedIn(config);
      setAccount(acc);
      const sid = siteId || await Graph.fetchSiteId(config);
      setSiteId(sid);
      const updated = [];
      for(const list of lists){
        try{
          const connected = await Graph.connectList(sid, list);
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

  async function signIn(){
    if(!config.CLIENT_ID || !config.TENANT_ID){
      notify("Primero configura Client ID y Tenant ID en la sección de Configuración.", 'error');
      goSetup();
      return;
    }
    setSigningIn(true);
    try{
      const acc = await Graph.ensureSignedIn(config);
      setAccount(acc);
      if(Graph.allRequiredMapped(lists)){
        const sid = await Graph.fetchSiteId(config);
        setSiteId(sid);
        const updated = [];
        for(const list of lists){
          const connected = await Graph.connectList(sid, list);
          updated.push({...connected, items: Graph.transformListItems(connected)});
        }
        setLists(updated);
        setProcesos(updated.find(l => l.key==='procesos')?.items || []);
        setClientes(updated.find(l => l.key==='clientes')?.items || []);
        setFacturas(updated.find(l => l.key==='facturacion')?.items || []);
        setOrdenesCompra(updated.find(l => l.key==='ordenesCompra')?.items || []);
        setLiveMode(true);
        setAppActive(true);
      } else {
        setAppActive(true);
        setView('setup');
        await testConnection(acc);
      }
    }catch(err){
      console.error(err);
      notify("No fue posible iniciar sesión. Revisa la consola para más detalle.", 'error');
    }
    setSigningIn(false);
  }

  async function refreshData(){
    if(!liveMode || refreshing) return;
    setRefreshing(true);
    try{
      const sid = siteId || await Graph.fetchSiteId(config);
      setSiteId(sid);
      const updated = [];
      for(const list of lists){
        const connected = await Graph.connectList(sid, list);
        updated.push({...connected, items: Graph.transformListItems(connected)});
      }
      setLists(updated);
      setProcesos(updated.find(l => l.key==='procesos')?.items || []);
      setClientes(updated.find(l => l.key==='clientes')?.items || []);
      setFacturas(updated.find(l => l.key==='facturacion')?.items || []);
      setOrdenesCompra(updated.find(l => l.key==='ordenesCompra')?.items || []);
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
  }

  const activeProceso = procesos.find(p => p.id===activeProcesoId) || null;
  const activeCliente = clientes.find(c => c.id===activeClienteId) || null;
  const activeFactura = draftFactura || facturas.find(f => f.id===activeFacturaId) || null;
  const activeOrdenCompra = draftOrdenCompra || ordenesCompra.find(o => o.id===activeOrdenCompraId) || null;

  function openProceso(id){ setActiveProcesoId(id); }
  function closeDrawer(){ setActiveProcesoId(null); }
  async function saveProceso(updates){
    if(!activeProceso) return;
    setProcesos(prev => prev.map(p => p.id===activeProcesoId ? {...p, ...updates} : p));
    if(liveMode){
      setSaving(true);
      const list = listByKey('procesos');
      const graphBody = Graph.graphFieldsFromUpdates(list, updates);
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${activeProceso._graphId}/fields`, {
          method:"PATCH", body: JSON.stringify(graphBody)
        });
      }catch(err){ console.error(err); notify("No se pudo guardar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setActiveProcesoId(null);
  }

  function openCliente(id){ setActiveClienteId(id); }
  function closeClienteDrawer(){ setActiveClienteId(null); }
  async function saveCliente(updates){
    if(!activeCliente) return;
    setClientes(prev => prev.map(c => c.id===activeClienteId ? {...c, ...updates} : c));
    if(liveMode){
      setSaving(true);
      const list = listByKey('clientes');
      const fields = Graph.graphFieldsFromUpdates(list, updates);
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${activeCliente._graphId || activeCliente.id}/fields`, {
          method:"PATCH", body: JSON.stringify(fields)
        });
      }catch(err){ console.error(err); notify("No se pudo guardar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setActiveClienteId(null);
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
      const fields = Graph.graphFieldsFromUpdates(list, updates);
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
      const graphFields = Graph.graphFieldsFromUpdates(list, nuevoSinId);
      try{
        const created = await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items`, {
          method:"POST", body: JSON.stringify({ fields: graphFields })
        });
        nuevo.id = created.id; nuevo._graphId = created.id;
      }catch(err){ console.error(err); notify("No se pudo crear el cliente en SharePoint: " + err.message, 'error'); setSaving(false); return null; }
      setSaving(false);
    }
    setClientes(prev => [...prev, nuevo]);
    return nuevo;
  }

  function openFactura(id){ setDraftFactura(null); setActiveFacturaId(id); }
  // Abre la factura e imprime automáticamente, para el botón de imprimir de la tabla.
  function printFactura(id){ setDraftFactura(null); setActiveFacturaId(id); setAutoPrintFacturaId(id); }
  function clearAutoPrint(){ setAutoPrintFacturaId(null); }
  // "+ Nueva factura" solo abre un borrador local — no toca SharePoint hasta
  // que el usuario le da "Guardar cambios" (evita registros vacíos huérfanos).
  function newFactura(){ setActiveFacturaId(null); setDraftFactura({}); }
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
  function closeFacturaDrawer(){ setActiveFacturaId(null); setDraftFactura(null); }
  async function saveFactura(updates){
    if(!activeFactura) return;

    if(draftFactura){
      const nuevo = {...updates};
      if(liveMode){
        setSaving(true);
        const list = listByKey('facturacion');
        const graphFields = {};
        Object.keys(updates).forEach(key => { if(list.mapping[key]) graphFields[list.mapping[key]] = updates[key]; });
        try{
          const created = await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items`, {
            method:"POST", body: JSON.stringify({ fields: graphFields })
          });
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
      return;
    }

    setFacturas(prev => prev.map(f => f.id===activeFacturaId ? {...f, ...updates} : f));
    if(liveMode){
      setSaving(true);
      const list = listByKey('facturacion');
      const graphBody = {};
      Object.keys(updates).forEach(key => { if(list.mapping[key]) graphBody[list.mapping[key]] = updates[key]; });
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${activeFactura._graphId}/fields`, {
          method:"PATCH", body: JSON.stringify(graphBody)
        });
      }catch(err){ console.error(err); notify("No se pudo guardar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setActiveFacturaId(null);
  }

  function openOrdenCompra(id){ setDraftOrdenCompra(null); setActiveOrdenCompraId(id); }
  // Abre la orden de compra e imprime automáticamente, para el botón de imprimir de la tabla.
  function printOrdenCompra(id){ setDraftOrdenCompra(null); setActiveOrdenCompraId(id); setAutoPrintOrdenCompraId(id); }
  function clearAutoPrintOrdenCompra(){ setAutoPrintOrdenCompraId(null); }
  // "+ Nueva orden de compra" solo abre un borrador local — no toca SharePoint
  // hasta que el usuario le da "Guardar cambios" (mismo criterio que Facturación).
  function newOrdenCompra(){ setActiveOrdenCompraId(null); setDraftOrdenCompra({}); }
  function closeOrdenCompraDrawer(){ setActiveOrdenCompraId(null); setDraftOrdenCompra(null); }
  async function saveOrdenCompra(updates){
    if(!activeOrdenCompra) return;

    if(draftOrdenCompra){
      const nuevo = {...updates};
      if(liveMode){
        setSaving(true);
        const list = listByKey('ordenesCompra');
        const graphFields = Graph.graphFieldsFromUpdates(list, updates);
        try{
          const created = await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items`, {
            method:"POST", body: JSON.stringify({ fields: graphFields })
          });
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
      return;
    }

    setOrdenesCompra(prev => prev.map(o => o.id===activeOrdenCompraId ? {...o, ...updates} : o));
    if(liveMode){
      setSaving(true);
      const list = listByKey('ordenesCompra');
      const graphBody = Graph.graphFieldsFromUpdates(list, updates);
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${activeOrdenCompra._graphId}/fields`, {
          method:"PATCH", body: JSON.stringify(graphBody)
        });
      }catch(err){ console.error(err); notify("No se pudo guardar en SharePoint: " + err.message, 'error'); setSaving(false); return; }
      setSaving(false);
    }
    setActiveOrdenCompraId(null);
  }

  return {
    config, saveConfig, clearConfig,
    lists, listByKey, updateListMapping,
    liveMode, account, appActive, view, setView,
    testStatus, testConnection, applyAllMappings, downloadAllMappings,
    refreshData, refreshing,
    signIn, enterDemo, goSetup, signOut,
    saving, signingIn,
    toast, closeToast, confirmState, acceptConfirm, cancelConfirm,
    procesos, clientes, facturas, ordenesCompra,
    currentFilter, setFilter: setCurrentFilter, searchQuery, setSearchQuery: setSearchQuery,
    onSearch: setSearchQuery,
    activeProceso, openProceso, closeDrawer, saveProceso,
    activeCliente, openCliente, closeClienteDrawer, saveCliente, deleteCliente, createCliente, updateCliente,
    activeFactura, openFactura, newFactura, closeFacturaDrawer, saveFactura,
    printFactura, autoPrintFacturaId, clearAutoPrint, createFacturaFromOrdenCompra,
    activeOrdenCompra, openOrdenCompra, newOrdenCompra, closeOrdenCompraDrawer, saveOrdenCompra,
    printOrdenCompra, autoPrintOrdenCompraId, clearAutoPrintOrdenCompra,
  };
}
