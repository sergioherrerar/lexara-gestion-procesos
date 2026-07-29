import { useState, useCallback, useEffect } from 'react';
import { INITIAL_CONFIG, SHAREPOINT_LISTS_CONFIG, DEMO_PROCESOS, DEMO_CLIENTES } from '../config';
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
  const [activeProcesoId, setActiveProcesoId] = useState(null);
  const [activeClienteId, setActiveClienteId] = useState(null);
  const [currentFilter, setCurrentFilter] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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
      alert("Primero configura Client ID y Tenant ID en la sección de Configuración.");
      goSetup();
      return;
    }
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
        setLiveMode(true);
        setAppActive(true);
      } else {
        setAppActive(true);
        setView('setup');
        await testConnection(acc);
      }
    }catch(err){
      console.error(err);
      alert("No fue posible iniciar sesión. Revisa la consola para más detalle.");
    }
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
    }catch(err){
      console.error(err);
      alert("No se pudo actualizar la información: " + err.message);
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
      alert("Mapea los campos obligatorios antes de continuar:\n" + missing.join("\n"));
      return;
    }
    const updated = lists.map(list => list.connectError ? list : {...list, items: Graph.transformListItems(list)});
    setLists(updated);
    setProcesos(updated.find(l => l.key==='procesos')?.items || []);
    setClientes(updated.find(l => l.key==='clientes')?.items || []);
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

  function openProceso(id){ setActiveProcesoId(id); }
  function closeDrawer(){ setActiveProcesoId(null); }
  async function saveProceso(updates){
    if(!activeProceso) return;
    setProcesos(prev => prev.map(p => p.id===activeProcesoId ? {...p, ...updates} : p));
    if(liveMode){
      const list = listByKey('procesos');
      const graphBody = {};
      Object.keys(updates).forEach(key => { if(list.mapping[key]) graphBody[list.mapping[key]] = updates[key]; });
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${activeProceso._graphId}/fields`, {
          method:"PATCH", body: JSON.stringify(graphBody)
        });
      }catch(err){ console.error(err); alert("No se pudo guardar en SharePoint: " + err.message); return; }
    }
    setActiveProcesoId(null);
  }

  function openCliente(id){ setActiveClienteId(id); }
  function closeClienteDrawer(){ setActiveClienteId(null); }
  async function saveCliente(updates){
    if(!activeCliente) return;
    setClientes(prev => prev.map(c => c.id===activeClienteId ? {...c, ...updates} : c));
    if(liveMode){
      const list = listByKey('clientes');
      const fields = {};
      Object.keys(updates).forEach(key => { if(list.mapping[key]) fields[list.mapping[key]] = updates[key]; });
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${activeCliente._graphId || activeCliente.id}/fields`, {
          method:"PATCH", body: JSON.stringify(fields)
        });
      }catch(err){ console.error(err); alert("No se pudo guardar en SharePoint: " + err.message); return; }
    }
    setActiveClienteId(null);
  }
  async function deleteCliente(id){
    const cliente = clientes.find(c => c.id===id);
    if(!cliente) return;
    if(!confirm(`¿Eliminar al cliente "${cliente.RazonSocial}"? Esta acción no se puede deshacer.`)) return;
    if(liveMode){
      const list = listByKey('clientes');
      try{
        await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items/${cliente._graphId || cliente.id}`, { method:"DELETE" });
      }catch(err){ console.error(err); alert("No se pudo eliminar en SharePoint: " + err.message); return; }
    }
    setClientes(prev => prev.filter(c => c.id !== id));
    if(activeClienteId === id) setActiveClienteId(null);
  }
  async function createCliente(fields){
    const nuevo = { id: 'tmp-' + Math.random().toString(36).slice(2), Entidad:"", ...fields };
    if(liveMode){
      const list = listByKey('clientes');
      const graphFields = {};
      Object.keys(nuevo).forEach(key => { if(key!=='id' && list.mapping[key]) graphFields[list.mapping[key]] = nuevo[key]; });
      try{
        const created = await Graph.graphFetch(`/sites/${siteId}/lists/${list.listId}/items`, {
          method:"POST", body: JSON.stringify({ fields: graphFields })
        });
        nuevo.id = created.id; nuevo._graphId = created.id;
      }catch(err){ console.error(err); alert("No se pudo crear el cliente en SharePoint: " + err.message); return null; }
    }
    setClientes(prev => [...prev, nuevo]);
    return nuevo;
  }

  return {
    config, saveConfig, clearConfig,
    lists, listByKey, updateListMapping,
    liveMode, account, appActive, view, setView,
    testStatus, testConnection, applyAllMappings, downloadAllMappings,
    refreshData, refreshing,
    signIn, enterDemo, goSetup, signOut,
    procesos, clientes,
    currentFilter, setFilter: setCurrentFilter, searchQuery, setSearchQuery: setSearchQuery,
    onSearch: setSearchQuery,
    activeProceso, openProceso, closeDrawer, saveProceso,
    activeCliente, openCliente, closeClienteDrawer, saveCliente, deleteCliente, createCliente,
  };
}
