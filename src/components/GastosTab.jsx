import { useState } from 'react';
import { fmtDate, fmtMonto, parseMonto, listarSoportesGastosDelMes, crearLinkCompartidoSoporte } from '../lib/graph';
import { MESES_NOMBRES } from '../lib/horasExtras';
import { TIPO_DOCUMENTO_OPTIONS, ENTIDAD_BANCARIA_OPTIONS, TIPO_CUENTA_OPTIONS, datosBancoProveedor, sumaValores, filtrarPorMes, generarRegistrosGastosExcel, generarRegistrosGastosHTML, siguienteNumeroConsecutivo } from '../lib/gastos';
import IconButton, { IconTextButton } from './IconButton';
import ColumnHeaderMenu from './ColumnHeaderMenu';
import { useColumnFilters } from '../hooks/useColumnFilters';
import { useColumnSort } from '../hooks/useColumnSort';

// Años disponibles en el selector — el año en curso +/- 1, suficiente
// margen para registros recién cerrados de diciembre o ya cargados de
// enero, sin tener que mantener esta lista a mano.
function aniosDisponibles(){
  const actual = new Date().getFullYear();
  return [actual-1, actual, actual+1];
}

// "Gastos" (Administración) — pedido explícito del usuario 2026-09-01,
// reemplaza el Excel mensual real ("PAGOS DE {MES} {AÑO}.xlsx") por 4 listas
// reales de SharePoint (ver SHAREPOINT_LISTS_CONFIG en config.js y
// lib/gastos.js). 4 sub-pestañas internas, una por lista — Proveedores Gastos
// MD es la única que persiste entre meses, las otras 3 se piensan como "del
// mes en curso". Identificación/Entidad/Cuenta/Tipo Cuenta de cada registro
// se buscan en vivo contra Proveedores por el nombre de "Pagado a" (mismo
// criterio que el VLOOKUP del Excel real) — nunca se guardan repetidos.
const SUB_TABS = [
  {key:'proveedores', label:'Proveedores'},
  {key:'cuentasCobro', label:'Cuentas de Cobro'},
  {key:'pagosPorRealizar', label:'Pagos por Realizar'},
  {key:'gastos', label:'Gastos'},
];

function ProveedorForm({ inicial, onGuardar, onCancelar, guardando }){
  const [form, setForm] = useState(inicial || { PagadoA:"", Identificacion:"", Entidad:"", Cuenta:"", TipoCuenta:"", Observacion:"" });
  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }
  return (
    <div className="panel" style={{marginBottom:14}}>
      <div className="panel-body" style={{padding:'14px 20px', display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end'}}>
        <div className="field" style={{minWidth:220}}><label>Pagado a</label><input type="text" value={form.PagadoA} onChange={e => setField('PagadoA', e.target.value)} /></div>
        <div className="field" style={{maxWidth:160}}><label>Identificación</label><input type="text" value={form.Identificacion} onChange={e => setField('Identificacion', e.target.value)} /></div>
        <div className="field" style={{maxWidth:180}}>
          <label>Entidad</label>
          <select value={form.Entidad} onChange={e => setField('Entidad', e.target.value)}>
            <option value="">— seleccionar —</option>
            {ENTIDAD_BANCARIA_OPTIONS.map(o => <option value={o} key={o}>{o}</option>)}
          </select>
        </div>
        <div className="field" style={{maxWidth:160}}><label>Cuenta</label><input type="text" value={form.Cuenta} onChange={e => setField('Cuenta', e.target.value)} /></div>
        <div className="field" style={{maxWidth:150}}>
          <label>Tipo Cuenta</label>
          <select value={form.TipoCuenta} onChange={e => setField('TipoCuenta', e.target.value)}>
            <option value="">— seleccionar —</option>
            {TIPO_CUENTA_OPTIONS.map(o => <option value={o} key={o}>{o}</option>)}
          </select>
        </div>
        <div className="field" style={{flex:1, minWidth:200}}><label>Observación</label><input type="text" value={form.Observacion} onChange={e => setField('Observacion', e.target.value)} /></div>
        <IconTextButton icon="add" variant="primary" disabled={guardando} onClick={() => onGuardar(form)}>{guardando ? "Guardando…" : "Guardar"}</IconTextButton>
        <button type="button" className="btn-secondary" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

// Columnas filtrables/ordenables — pedido explícito del usuario 2026-09-02
// ("a esta tablas de gastos incluye el filtro en cada columna"), mismo
// componente/patrón ya usado en Procesos/Tutelas/Clientes/etc.
const COLUMNAS_PROVEEDORES = [
  {key:'pagadoA', label:'Pagado a', value: p => p.PagadoA || ""},
  {key:'identificacion', label:'Identificación', value: p => p.Identificacion || ""},
  {key:'entidad', label:'Entidad', value: p => p.Entidad || ""},
  {key:'cuenta', label:'Cuenta', value: p => p.Cuenta || ""},
  {key:'tipoCuenta', label:'Tipo Cuenta', value: p => p.TipoCuenta || ""},
  {key:'observacion', label:'Observación', value: p => p.Observacion || ""},
  {key:'acciones', label:'Acciones', filterable:false},
];

function ProveedoresSection({ proveedores, onCrear, onEditar, onEliminar, canWrite }){
  const [abierto, setAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const { filters, setFilter, rowMatches } = useColumnFilters();
  const { sort, setSortKey, sortRows } = useColumnSort();
  const columnas = canWrite ? COLUMNAS_PROVEEDORES : COLUMNAS_PROVEEDORES.filter(c => c.key !== 'acciones');
  const filas = sortRows(
    [...(proveedores||[])].filter(p => rowMatches(p, columnas)).sort((a,b) => (a.PagadoA||"").localeCompare(b.PagadoA||"")),
    columnas
  );
  async function guardar(datos){
    setGuardando(true);
    try{
      if(editandoId) await onEditar(editandoId, datos);
      else await onCrear(datos);
      setAbierto(false); setEditandoId(null);
    } finally { setGuardando(false); }
  }
  return (
    <div>
      {canWrite && !abierto && !editandoId && (
        <div style={{marginBottom:14}}><IconTextButton icon="add" variant="primary" onClick={() => setAbierto(true)}>Nuevo proveedor</IconTextButton></div>
      )}
      {abierto && <ProveedorForm onGuardar={guardar} onCancelar={() => setAbierto(false)} guardando={guardando} />}
      <div className="table-wrap">
        <table>
          <thead><tr>{columnas.map(c => <ColumnHeaderMenu key={c.key} column={c} sort={sort} onSort={setSortKey} filterValue={filters[c.key]} onFilterChange={setFilter} />)}</tr></thead>
          <tbody>
            {filas.length ? filas.map(p => (
              editandoId===p.id ? (
                <tr key={p.id}><td colSpan={columnas.length}><ProveedorForm inicial={p} onGuardar={d => guardar(d)} onCancelar={() => setEditandoId(null)} guardando={guardando} /></td></tr>
              ) : (
                <tr key={p.id}>
                  <td className="cliente">{p.PagadoA}</td>
                  <td>{p.Identificacion || "—"}</td>
                  <td>{p.Entidad || "—"}</td>
                  <td>{p.Cuenta || "—"}</td>
                  <td>{p.TipoCuenta || "—"}</td>
                  <td>{p.Observacion || "—"}</td>
                  {canWrite && (
                    <td><div className="row-actions">
                      <IconButton icon="edit" variant="edit" label={`Editar ${p.PagadoA}`} onClick={() => { setEditandoId(p.id); setAbierto(false); }} />
                      <IconButton icon="delete" variant="delete" label={`Eliminar ${p.PagadoA}`} onClick={() => onEliminar(p.id)} />
                    </div></td>
                  )}
                </tr>
              )
            )) : <tr><td colSpan={columnas.length}><div className="empty-state empty-state-compact">Todavía no hay proveedores registrados.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Fila genérica para Cuentas de Cobro/Pagos por Realizar/Gastos — comparten
// casi todos los campos (Pagado a + Observación + Fecha + Valor a pagar),
// solo Pagos por Realizar/Gastos suman Numero + Tipo Documento, y Gastos
// suma los 2 soportes. `conNumero`/`conTipo`/`conSoportes` prenden esas
// columnas extra sin repetir todo el componente 3 veces.
function RegistroForm({ inicial, conNumero, conTipo, proveedores, onGuardar, onCancelar, guardando }){
  const vacio = { Numero:"", PagadoA:"", Observacion:"", Fecha:"", ValorAPagar:"", TipoDocumento:"" };
  // Ojo: el formulario SOLO maneja las llaves de `vacio` — nunca hace
  // `{...inicial}` completo. Un registro real trae también SoporteFactura/
  // SoportePago, y si esas 2 se colaran acá se reenviarían de nuevo al
  // guardar (aunque el usuario no haya tocado nada) — bug real reportado
  // por el usuario 2026-09-01 ("cuando le doy editar lo guardo sin hacer
  // cambios sale igual"). Los soportes se editan aparte, solo desde
  // SoporteField.
  // "Fecha" se recorta a los primeros 10 caracteres por el mismo motivo que
  // ya se corrigió en ProcesoDrawer.jsx: si SharePoint la devuelve con hora
  // incluida, el <input type="date"> la rechaza en silencio y se ve vacía.
  const [form, setForm] = useState(() => {
    if(!inicial) return vacio;
    const limitado = {};
    Object.keys(vacio).forEach(k => { limitado[k] = inicial[k] ?? ""; });
    limitado.Fecha = String(limitado.Fecha||"").slice(0,10);
    limitado.ValorAPagar = inicial.ValorAPagar!=null ? fmtMonto(Number(inicial.ValorAPagar)) : "";
    return limitado;
  });
  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }
  const banco = datosBancoProveedor(form.PagadoA, proveedores);
  return (
    <div className="panel" style={{marginBottom:14}}>
      <div className="panel-body" style={{padding:'14px 20px'}}>
        <div style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end', marginBottom:10}}>
          {conNumero && <div className="field" style={{maxWidth:150}}><label>Numero</label><input type="text" value={form.Numero} onChange={e => setField('Numero', e.target.value)} /></div>}
          <div className="field" style={{minWidth:220}}>
            <label>Pagado a</label>
            <input type="text" list="gastos-proveedores-datalist" value={form.PagadoA} onChange={e => setField('PagadoA', e.target.value)} />
          </div>
          <div className="field" style={{maxWidth:160}}><label>Fecha</label><input type="date" value={form.Fecha} onChange={e => setField('Fecha', e.target.value)} /></div>
          <div className="field" style={{maxWidth:220}}>
            <label>Valor a pagar</label>
            <input type="text" className="input-money" value={form.ValorAPagar} onChange={e => setField('ValorAPagar', e.target.value)} onBlur={e => setField('ValorAPagar', fmtMonto(parseMonto(e.target.value)))} />
          </div>
          {conTipo && (
            <div className="field" style={{maxWidth:170}}>
              <label>Tipo Documento</label>
              <select value={form.TipoDocumento} onChange={e => setField('TipoDocumento', e.target.value)}>
                <option value="">— seleccionar —</option>
                {TIPO_DOCUMENTO_OPTIONS.map(o => <option value={o} key={o}>{o}</option>)}
              </select>
            </div>
          )}
          <div className="field" style={{flex:1, minWidth:200}}><label>Observación</label><input type="text" value={form.Observacion} onChange={e => setField('Observacion', e.target.value)} /></div>
        </div>
        <p className="save-hint" style={{margin:'0 0 10px'}}>
          {form.PagadoA ? <>Banco: <strong>{banco.entidad}</strong> · Cuenta: <strong>{banco.cuenta}</strong> ({banco.tipoCuenta}) · Identificación: <strong>{banco.identificacion}</strong>{banco.entidad==='—' && " — proveedor no encontrado en Proveedores Gastos MD, créalo ahí primero."}</> : "Escribe \"Pagado a\" para ver los datos bancarios del proveedor."}
        </p>
        <div style={{display:'flex', gap:8}}>
          <IconTextButton icon="add" variant="primary" disabled={guardando} onClick={() => onGuardar({ ...form, ValorAPagar: parseMonto(form.ValorAPagar) })}>{guardando ? "Guardando…" : "Guardar"}</IconTextButton>
          <button type="button" className="btn-secondary" onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// Selector de soporte — pedido explícito del usuario 2026-09-01: los PDF de
// soporte NO siguen ningún esquema de nombre, así que en vez de adivinar
// (como sí se puede con las facturas Siigo), se listan los archivos de la
// carpeta del mes que le corresponde a la Fecha del gasto y el usuario elige
// uno con un clic — ver listarSoportesGastosDelMes en graph.js.
function SoporteField({ label, url, fecha, shareUrl, onElegir }){
  const [buscando, setBuscando] = useState(false);
  const [archivos, setArchivos] = useState(null);
  const [resolviendo, setResolviendo] = useState(false);
  const [error, setError] = useState("");
  async function handleBuscar(){
    if(!fecha){ return; }
    setBuscando(true);
    try{ setArchivos(await listarSoportesGastosDelMes(shareUrl, fecha)); }
    catch(err){ console.error(err); setArchivos([]); }
    finally{ setBuscando(false); }
  }
  // Bug real 2026-09-01: guardar el "webUrl" nativo del archivo (la ruta
  // completa con todas las carpetas anidadas) fácilmente pasa de 255
  // caracteres una vez codificados los espacios — el límite clásico de
  // SharePoint para la URL de una columna de Hipervínculo — y SharePoint lo
  // rechazaba con un Graph 400 genérico. Se pide un enlace de COMPARTIR
  // (siempre corto) justo antes de guardarlo — ver crearLinkCompartidoSoporte
  // en graph.js.
  async function handleElegirArchivo(f){
    setResolviendo(true); setError("");
    try{
      const linkCorto = await crearLinkCompartidoSoporte(f.driveId, f.itemId);
      onElegir({ nombre: f.nombre, url: linkCorto });
    }catch(err){ console.error(err); setError("No se pudo generar el enlace: " + err.message); }
    finally{ setResolviendo(false); }
  }
  if(url){
    return (
      <div style={{display:'flex', alignItems:'center', gap:6}}>
        <IconButton icon="open" variant="open" label={`Abrir ${label}`} href={url} onClick={e => e.stopPropagation()} />
        <button type="button" className="btn-secondary" style={{fontSize:11, padding:'3px 8px'}} onClick={() => onElegir(null)}>Quitar</button>
      </div>
    );
  }
  if(resolviendo) return <span className="save-hint">Generando enlace…</span>;
  if(archivos){
    return (
      <div style={{display:'flex', alignItems:'center', gap:4}}>
        <select
          value=""
          onChange={e => { const f = archivos.find(a => a.url===e.target.value); if(f) handleElegirArchivo(f); }}
          style={{maxWidth:180}}
        >
          <option value="">{buscando ? "— actualizando… —" : archivos.length ? `— elegir (${archivos.length}) —` : "— sin PDF en esa carpeta —"}</option>
          {archivos.map(a => <option value={a.url} key={a.url}>{a.nombre}</option>)}
        </select>
        {/* La lista solo se pide al abrir por primera vez — si el usuario
            sube un PDF nuevo a la carpeta DESPUÉS de eso, sin este botón no
            hay forma de verlo sin recargar toda la página. Bug real
            reportado 2026-09-02 ("al introducir más documentos a la
            carpeta no se actualiza"). */}
        <IconButton icon="refresh" variant="refresh" label="Actualizar lista de archivos" spinning={buscando} onClick={handleBuscar} />
        {error && <div style={{color:'var(--rojo, #a3281c)', fontSize:11, marginTop:4}}>{error}</div>}
      </div>
    );
  }
  return (
    <button type="button" className="btn-secondary" style={{fontSize:11, padding:'3px 8px'}} disabled={buscando || !fecha} onClick={handleBuscar}>
      {buscando ? "Buscando…" : "Elegir…"}
    </button>
  );
}

function RegistrosSection({ nombreLista, registros, proveedores, conNumero, conTipo, conSoportes, shareUrl, siguienteNumero, onCrear, onEditar, onEliminar, canWrite }){
  const hoyRef = new Date();
  const [mes, setMes] = useState(hoyRef.getMonth());
  const [anio, setAnio] = useState(hoyRef.getFullYear());
  const [abierto, setAbierto] = useState(false);
  const [formInicialNuevo, setFormInicialNuevo] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [generandoExcel, setGenerandoExcel] = useState(false);
  // "Todos" (pedido explícito del usuario 2026-09-01) — quita el filtro de
  // Mes/Año para ver la lista completa de una vez. Cambiar el Mes o el Año
  // después vuelve a activar el filtro solo, sin un paso aparte.
  const [verTodos, setVerTodos] = useState(false);
  const { filters, setFilter, rowMatches } = useColumnFilters();
  const { sort, setSortKey, sortRows } = useColumnSort();

  // Columnas filtrables/ordenables — pedido explícito del usuario 2026-09-02
  // ("a esta tablas de gastos incluye el filtro en cada columna"). "Entidad"
  // no es un campo propio del registro (se busca en vivo en Proveedores por
  // "Pagado a", ver datosBancoProveedor en lib/gastos.js), así que su
  // `value` hace la misma búsqueda para que el filtro/orden por esa columna
  // funcione contra lo que de verdad se ve en pantalla.
  const columnas = [
    ...(conNumero ? [{key:'numero', label:'Numero', value: r => r.Numero || ""}] : []),
    {key:'pagadoA', label:'Pagado a', value: r => r.PagadoA || ""},
    {key:'entidad', label:'Entidad', value: r => datosBancoProveedor(r.PagadoA, proveedores).entidad || ""},
    {key:'fecha', label:'Fecha', value: r => r.Fecha || ""},
    {key:'valorAPagar', label:'Valor a pagar', value: r => r.ValorAPagar ?? ""},
    ...(conTipo ? [{key:'tipoDocumento', label:'Tipo Documento', value: r => r.TipoDocumento || ""}] : []),
    {key:'observacion', label:'Observación', value: r => r.Observacion || ""},
    ...(conSoportes ? [{key:'soporteFactura', label:'Soporte Factura', filterable:false}] : []),
    ...(conSoportes ? [{key:'soportePago', label:'Soporte Pago', filterable:false}] : []),
    ...(canWrite ? [{key:'acciones', label:'Acciones', filterable:false}] : []),
  ];

  // Solo el mes elegido — pedido explícito del usuario 2026-09-01 ("coloca
  // la lista del mes que solo salga ese mes"). A diferencia del Excel real
  // (un archivo nuevo cada mes), esta lista de SharePoint sigue creciendo
  // mes tras mes, así que hace falta un filtro para no ver todo junto. Los
  // filtros de columna se combinan (AND) con el de Mes/Año; el orden por
  // columna (si el usuario eligió uno) reemplaza el orden por Fecha de
  // siempre, igual criterio que en Tutelas/Procesos.
  const filasSinOrdenar = (verTodos ? [...(registros||[])] : filtrarPorMes(registros, anio, mes)).filter(r => rowMatches(r, columnas));
  const filas = sort ? sortRows(filasSinOrdenar, columnas) : filasSinOrdenar.sort((a,b) => String(b.Fecha||"").localeCompare(String(a.Fecha||"")));
  const total = sumaValores(filas);
  function cambiarMes(v){ setMes(v); setVerTodos(false); }
  function cambiarAnio(v){ setAnio(v); setVerTodos(false); }

  // Al abrir "Nuevo registro" (o "Duplicar"), si esta lista usa "Numero"
  // (Pagos por Realizar/Gastos), se propone de una vez el próximo
  // consecutivo de 5 dígitos — pedido explícito del usuario 2026-09-01, para
  // nombrar el PDF de soporte con el mismo número al subirlo. Al duplicar,
  // el número SIEMPRE se reemplaza por uno nuevo (nunca se repite el del
  // original) — es un gasto distinto, con su propio soporte.
  function abrirNuevo(){ setAbierto(true); setFormInicialNuevo(conNumero ? { Numero: siguienteNumero } : null); setEditandoId(null); }
  function abrirDuplicado(r){
    // eslint-disable-next-line no-unused-vars
    const { id, _graphId, SoporteFactura, SoportePago, Numero, ...resto } = r;
    setFormInicialNuevo(conNumero ? { ...resto, Numero: siguienteNumero } : resto); setAbierto(true); setEditandoId(null);
  }
  function cerrarNuevo(){ setAbierto(false); setFormInicialNuevo(null); }
  async function guardarNuevo(datos){
    setGuardando(true);
    try{ await onCrear(datos); cerrarNuevo(); } finally { setGuardando(false); }
  }
  async function guardarEdicion(id, datos){
    setGuardando(true);
    try{ await onEditar(id, datos); setEditandoId(null); } finally { setGuardando(false); }
  }
  function nombreArchivoActual(){
    return verTodos ? `${nombreLista} - Todos` : `${nombreLista} ${MESES_NOMBRES[mes]} ${anio}`;
  }
  async function handleDescargarExcel(){
    setGenerandoExcel(true);
    try{ await generarRegistrosGastosExcel(nombreArchivoActual(), filas, proveedores, { conNumero, conTipo }); }
    finally { setGenerandoExcel(false); }
  }
  // Descargar HTML — pedido explícito del usuario 2026-09-01, para poder
  // enviárselo a un tercero (ej. la contadora externa) con el link real de
  // cada soporte como enlace en el que puede hacer clic, sin adjuntar PDF
  // sueltos aparte.
  function handleDescargarHTML(){
    generarRegistrosGastosHTML(nombreArchivoActual(), filas, proveedores, { conNumero, conTipo, conSoportes });
  }

  const nCols = columnas.length;
  return (
    <div>
      <datalist id="gastos-proveedores-datalist">
        {(proveedores||[]).map(p => <option value={p.PagadoA} key={p.id} />)}
      </datalist>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:14, flexWrap:'wrap', gap:10}}>
        <div style={{display:'flex', alignItems:'flex-end', gap:10, flexWrap:'wrap'}}>
          {canWrite && !abierto && <IconTextButton icon="add" variant="primary" onClick={abrirNuevo}>Nuevo registro</IconTextButton>}
          <div className="field" style={{maxWidth:150}}>
            <label>Mes</label>
            <select value={mes} onChange={e => cambiarMes(Number(e.target.value))} disabled={verTodos}>
              {MESES_NOMBRES.map((m,i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </div>
          <div className="field" style={{maxWidth:110}}>
            <label>Año</label>
            <select value={anio} onChange={e => cambiarAnio(Number(e.target.value))} disabled={verTodos}>
              {aniosDisponibles().map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <button type="button" className={verTodos ? "btn-secondary active" : "btn-secondary"} onClick={() => setVerTodos(v => !v)}>
            {verTodos ? "Ver solo el mes" : "Todos"}
          </button>
          <IconTextButton icon="excel" variant="secondary" onClick={handleDescargarExcel} disabled={generandoExcel}>
            {generandoExcel ? "Generando…" : "Descargar Excel"}
          </IconTextButton>
          <IconTextButton icon="html" variant="secondary" onClick={handleDescargarHTML}>Descargar HTML</IconTextButton>
        </div>
      </div>
      {abierto && <RegistroForm inicial={formInicialNuevo} conNumero={conNumero} conTipo={conTipo} proveedores={proveedores} onGuardar={guardarNuevo} onCancelar={cerrarNuevo} guardando={guardando} />}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columnas.map(c => <ColumnHeaderMenu key={c.key} column={c} sort={sort} onSort={setSortKey} filterValue={filters[c.key]} onFilterChange={setFilter} />)}
            </tr>
          </thead>
          <tbody>
            {filas.length ? filas.map(r => (
              editandoId===r.id ? (
                <tr key={r.id}><td colSpan={nCols}><RegistroForm inicial={r} conNumero={conNumero} conTipo={conTipo} proveedores={proveedores} onGuardar={d => guardarEdicion(r.id, d)} onCancelar={() => setEditandoId(null)} guardando={guardando} /></td></tr>
              ) : (
                <tr key={r.id}>
                  {conNumero && <td>{r.Numero || "—"}</td>}
                  <td className="cliente">{r.PagadoA}</td>
                  <td>{datosBancoProveedor(r.PagadoA, proveedores).entidad}</td>
                  <td>{fmtDate(r.Fecha)}</td>
                  <td style={{textAlign:'right', whiteSpace:'nowrap'}}>$ {fmtMonto(Number(r.ValorAPagar)||0)}</td>
                  {conTipo && <td>{r.TipoDocumento || "—"}</td>}
                  <td>{r.Observacion || "—"}</td>
                  {conSoportes && (
                    <td><SoporteField label="Soporte Factura" url={r.SoporteFactura} fecha={r.Fecha} shareUrl={shareUrl} onElegir={archivo => onEditar(r.id, { SoporteFactura: archivo ? archivo.url : null })} /></td>
                  )}
                  {conSoportes && (
                    <td><SoporteField label="Soporte Pago" url={r.SoportePago} fecha={r.Fecha} shareUrl={shareUrl} onElegir={archivo => onEditar(r.id, { SoportePago: archivo ? archivo.url : null })} /></td>
                  )}
                  {canWrite && (
                    <td><div className="row-actions">
                      <IconButton icon="duplicate" variant="duplicate" label={`Duplicar registro de ${r.PagadoA}`} onClick={() => abrirDuplicado(r)} />
                      <IconButton icon="edit" variant="edit" label={`Editar registro de ${r.PagadoA}`} onClick={() => { setEditandoId(r.id); cerrarNuevo(); }} />
                      <IconButton icon="delete" variant="delete" label={`Eliminar registro de ${r.PagadoA}`} onClick={() => onEliminar(r.id)} />
                    </div></td>
                  )}
                </tr>
              )
            )) : <tr><td colSpan={nCols}><div className="empty-state empty-state-compact">No hay registros en {MESES_NOMBRES[mes]} de {anio}.</div></td></tr>}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr>
                {conNumero && <td></td>}
                <td colSpan={2}></td>
                <td style={{textAlign:'right', whiteSpace:'nowrap'}}><strong>Total</strong></td>
                <td style={{textAlign:'right', whiteSpace:'nowrap'}}><strong>$ {fmtMonto(total)}</strong></td>
                {conTipo && <td></td>}
                <td></td>
                {conSoportes && <td></td>}
                {conSoportes && <td></td>}
                {canWrite && <td></td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export default function GastosTab({ config, proveedoresGastos, cuentasCobroGastos, pagosPorRealizar, gastos,
  onCrearProveedorGastos, onEditarProveedorGastos, onEliminarProveedorGastos,
  onCrearCuentaCobroGastos, onEditarCuentaCobroGastos, onEliminarCuentaCobroGastos,
  onCrearPagoPorRealizar, onEditarPagoPorRealizar, onEliminarPagoPorRealizar,
  onCrearGasto, onEditarGasto, onEliminarGasto, canWrite }){
  const [subTab, setSubTab] = useState('proveedores');
  const shareUrl = config?.GASTOS_SOPORTES_SHARE_URL;
  // Un solo consecutivo compartido entre Pagos por Realizar y Gastos (ver
  // siguienteNumeroConsecutivo en lib/gastos.js) — nunca se repite el mismo
  // número entre las dos listas.
  const siguienteNumero = siguienteNumeroConsecutivo(pagosPorRealizar, gastos);
  return (
    <div>
      <div className="subnav-panel">
        <div className="subtabs">
          {SUB_TABS.map(t => (
            <button key={t.key} type="button" className={"subtab" + (subTab===t.key ? " active" : "")} onClick={() => setSubTab(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>
      {subTab==='proveedores' && (
        <ProveedoresSection proveedores={proveedoresGastos} onCrear={onCrearProveedorGastos} onEditar={onEditarProveedorGastos} onEliminar={onEliminarProveedorGastos} canWrite={canWrite} />
      )}
      {subTab==='cuentasCobro' && (
        <RegistrosSection nombreLista="Cuentas de Cobro" registros={cuentasCobroGastos} proveedores={proveedoresGastos} conNumero={false} conTipo={false} conSoportes={false}
          onCrear={onCrearCuentaCobroGastos} onEditar={onEditarCuentaCobroGastos} onEliminar={onEliminarCuentaCobroGastos} canWrite={canWrite} />
      )}
      {subTab==='pagosPorRealizar' && (
        <RegistrosSection nombreLista="Pagos por Realizar" registros={pagosPorRealizar} proveedores={proveedoresGastos} conNumero conTipo conSoportes={false} siguienteNumero={siguienteNumero}
          onCrear={onCrearPagoPorRealizar} onEditar={onEditarPagoPorRealizar} onEliminar={onEliminarPagoPorRealizar} canWrite={canWrite} />
      )}
      {subTab==='gastos' && (
        <RegistrosSection nombreLista="Gastos" registros={gastos} proveedores={proveedoresGastos} conNumero conTipo conSoportes shareUrl={shareUrl} siguienteNumero={siguienteNumero}
          onCrear={onCrearGasto} onEditar={onEditarGasto} onEliminar={onEliminarGasto} canWrite={canWrite} />
      )}
    </div>
  );
}
