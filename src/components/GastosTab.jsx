import { useState } from 'react';
import { fmtDate, fmtMonto, parseMonto, listarSoportesGastosDelMes } from '../lib/graph';
import { TIPO_DOCUMENTO_OPTIONS, ENTIDAD_BANCARIA_OPTIONS, TIPO_CUENTA_OPTIONS, datosBancoProveedor, sumaValores } from '../lib/gastos';
import IconButton, { IconTextButton } from './IconButton';

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

function ProveedoresSection({ proveedores, onCrear, onEditar, onEliminar, canWrite }){
  const [abierto, setAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const filas = [...(proveedores||[])].sort((a,b) => (a.PagadoA||"").localeCompare(b.PagadoA||""));
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
          <thead><tr><th>Pagado a</th><th>Identificación</th><th>Entidad</th><th>Cuenta</th><th>Tipo Cuenta</th><th>Observación</th>{canWrite && <th>Acciones</th>}</tr></thead>
          <tbody>
            {filas.length ? filas.map(p => (
              editandoId===p.id ? (
                <tr key={p.id}><td colSpan={7}><ProveedorForm inicial={p} onGuardar={d => guardar(d)} onCancelar={() => setEditandoId(null)} guardando={guardando} /></td></tr>
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
            )) : <tr><td colSpan={7}><div className="empty-state empty-state-compact">Todavía no hay proveedores registrados.</div></td></tr>}
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
  const [form, setForm] = useState(inicial ? { ...vacio, ...inicial, ValorAPagar: inicial.ValorAPagar!=null ? fmtMonto(Number(inicial.ValorAPagar)) : "" } : vacio);
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
          <div className="field" style={{maxWidth:160}}>
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
  async function handleBuscar(){
    if(!fecha){ return; }
    setBuscando(true);
    try{ setArchivos(await listarSoportesGastosDelMes(shareUrl, fecha)); }
    catch(err){ console.error(err); setArchivos([]); }
    finally{ setBuscando(false); }
  }
  if(url){
    return (
      <div style={{display:'flex', alignItems:'center', gap:6}}>
        <IconButton icon="open" variant="open" label={`Abrir ${label}`} href={url} onClick={e => e.stopPropagation()} />
        <button type="button" className="btn-secondary" style={{fontSize:11, padding:'3px 8px'}} onClick={() => onElegir(null)}>Quitar</button>
      </div>
    );
  }
  if(archivos){
    return (
      <select
        value=""
        onChange={e => { const f = archivos.find(a => a.url===e.target.value); if(f) onElegir(f.url); }}
        style={{maxWidth:180}}
      >
        <option value="">{archivos.length ? `— elegir (${archivos.length}) —` : "— sin PDF en esa carpeta —"}</option>
        {archivos.map(a => <option value={a.url} key={a.url}>{a.nombre}</option>)}
      </select>
    );
  }
  return (
    <button type="button" className="btn-secondary" style={{fontSize:11, padding:'3px 8px'}} disabled={buscando || !fecha} onClick={handleBuscar}>
      {buscando ? "Buscando…" : "Elegir…"}
    </button>
  );
}

function RegistrosSection({ registros, proveedores, conNumero, conTipo, conSoportes, shareUrl, onCrear, onEditar, onEliminar, canWrite }){
  const [abierto, setAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const filas = [...(registros||[])].sort((a,b) => String(b.Fecha||"").localeCompare(String(a.Fecha||"")));
  const total = sumaValores(filas);
  async function guardar(datos){
    setGuardando(true);
    try{
      if(editandoId) await onEditar(editandoId, datos);
      else await onCrear(datos);
      setAbierto(false); setEditandoId(null);
    } finally { setGuardando(false); }
  }
  const nCols = 4 + (conNumero?1:0) + (conTipo?1:0) + (conSoportes?2:0) + (canWrite?1:0);
  return (
    <div>
      <datalist id="gastos-proveedores-datalist">
        {(proveedores||[]).map(p => <option value={p.PagadoA} key={p.id} />)}
      </datalist>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:10}}>
        {canWrite && !abierto && !editandoId && <IconTextButton icon="add" variant="primary" onClick={() => setAbierto(true)}>Nuevo registro</IconTextButton>}
        <span className="badge badge-verde" style={{fontSize:13, padding:'6px 14px'}}>Total: $ {fmtMonto(total)}</span>
      </div>
      {abierto && <RegistroForm conNumero={conNumero} conTipo={conTipo} proveedores={proveedores} onGuardar={guardar} onCancelar={() => setAbierto(false)} guardando={guardando} />}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {conNumero && <th>Numero</th>}
              <th>Pagado a</th><th>Entidad</th><th>Fecha</th><th>Valor a pagar</th>
              {conTipo && <th>Tipo Documento</th>}
              <th>Observación</th>
              {conSoportes && <th>Soporte Factura</th>}
              {conSoportes && <th>Soporte Pago</th>}
              {canWrite && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filas.length ? filas.map(r => (
              editandoId===r.id ? (
                <tr key={r.id}><td colSpan={nCols}><RegistroForm inicial={r} conNumero={conNumero} conTipo={conTipo} proveedores={proveedores} onGuardar={d => guardar(d)} onCancelar={() => setEditandoId(null)} guardando={guardando} /></td></tr>
              ) : (
                <tr key={r.id}>
                  {conNumero && <td>{r.Numero || "—"}</td>}
                  <td className="cliente">{r.PagadoA}</td>
                  <td>{datosBancoProveedor(r.PagadoA, proveedores).entidad}</td>
                  <td>{fmtDate(r.Fecha)}</td>
                  <td style={{textAlign:'right'}}>$ {fmtMonto(Number(r.ValorAPagar)||0)}</td>
                  {conTipo && <td>{r.TipoDocumento || "—"}</td>}
                  <td>{r.Observacion || "—"}</td>
                  {conSoportes && (
                    <td><SoporteField label="Soporte Factura" url={r.SoporteFactura} fecha={r.Fecha} shareUrl={shareUrl} onElegir={url => onEditar(r.id, { SoporteFactura: url || "" })} /></td>
                  )}
                  {conSoportes && (
                    <td><SoporteField label="Soporte Pago" url={r.SoportePago} fecha={r.Fecha} shareUrl={shareUrl} onElegir={url => onEditar(r.id, { SoportePago: url || "" })} /></td>
                  )}
                  {canWrite && (
                    <td><div className="row-actions">
                      <IconButton icon="edit" variant="edit" label={`Editar registro de ${r.PagadoA}`} onClick={() => { setEditandoId(r.id); setAbierto(false); }} />
                      <IconButton icon="delete" variant="delete" label={`Eliminar registro de ${r.PagadoA}`} onClick={() => onEliminar(r.id)} />
                    </div></td>
                  )}
                </tr>
              )
            )) : <tr><td colSpan={nCols}><div className="empty-state empty-state-compact">Todavía no hay registros.</div></td></tr>}
          </tbody>
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
  return (
    <div>
      <div className="drawer-tabs" style={{padding:'0 0 14px', border:'none'}}>
        {SUB_TABS.map(t => (
          <button key={t.key} type="button" className={"drawer-tab" + (subTab===t.key ? " active" : "")} onClick={() => setSubTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {subTab==='proveedores' && (
        <ProveedoresSection proveedores={proveedoresGastos} onCrear={onCrearProveedorGastos} onEditar={onEditarProveedorGastos} onEliminar={onEliminarProveedorGastos} canWrite={canWrite} />
      )}
      {subTab==='cuentasCobro' && (
        <RegistrosSection registros={cuentasCobroGastos} proveedores={proveedoresGastos} conNumero={false} conTipo={false} conSoportes={false}
          onCrear={onCrearCuentaCobroGastos} onEditar={onEditarCuentaCobroGastos} onEliminar={onEliminarCuentaCobroGastos} canWrite={canWrite} />
      )}
      {subTab==='pagosPorRealizar' && (
        <RegistrosSection registros={pagosPorRealizar} proveedores={proveedoresGastos} conNumero conTipo conSoportes={false}
          onCrear={onCrearPagoPorRealizar} onEditar={onEditarPagoPorRealizar} onEliminar={onEliminarPagoPorRealizar} canWrite={canWrite} />
      )}
      {subTab==='gastos' && (
        <RegistrosSection registros={gastos} proveedores={proveedoresGastos} conNumero conTipo conSoportes shareUrl={shareUrl}
          onCrear={onCrearGasto} onEditar={onEditarGasto} onEliminar={onEliminarGasto} canWrite={canWrite} />
      )}
    </div>
  );
}
