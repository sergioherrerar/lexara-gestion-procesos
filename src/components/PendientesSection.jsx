import { useState } from 'react';
import IconButton, { IconTextButton } from './IconButton';
import ColumnHeaderMenu from './ColumnHeaderMenu';
import { useColumnFilters } from '../hooks/useColumnFilters';
import { useColumnSort } from '../hooks/useColumnSort';
import { esColaboradorVigente } from '../lib/permissions';

// Módulo "Pendientes" (2026-09-17, pedido explícito del usuario: "ayúdame a
// mirar si puedo hacer con mismo TO DO visualizar las tareas y asignarlas").
// Reusa la lista real "Pendientes" que ya existía en SharePoint (ver
// config.js) en vez de Microsoft To Do (personal, no se puede asignar a
// otra persona) o Planner (necesitaría un Microsoft 365 Group aparte). Un
// Pendiente puede ir opcionalmente ligado a un Proceso judicial (búsqueda
// por Número Corto, mismo patrón que Audiencias/Términos) o quedar suelto
// como tarea independiente — y si tiene fecha, useLexaraApp.js lo agenda
// también en el mismo calendario de Outlook.
const ESTADO_OPTIONS = ["Vigente", "Terminado"];

function soloFechaISO(v){ return String(v || "").slice(0, 10); }

function PendienteForm({ inicial, colaboradores, procesos, onGuardar, onCancelar, guardando }){
  const [form, setForm] = useState(() => {
    if(!inicial) return { Pendiente:"", PendienteDe:"", PendientePara:"", FechaPendiente:"", Estado:"Vigente", Observacion:"", numeroCorto:"", ProcesoMD:null };
    const procesoInicial = inicial.ProcesoMD ? (procesos||[]).find(p => String(p.id) === String(inicial.ProcesoMD)) : null;
    return {
      Pendiente: inicial.Pendiente || "", PendienteDe: inicial.PendienteDe || "", PendientePara: inicial.PendientePara || "",
      FechaPendiente: soloFechaISO(inicial.FechaPendiente), Estado: inicial.Estado || "Vigente", Observacion: inicial.Observacion || "",
      numeroCorto: procesoInicial?.Radicado || "", ProcesoMD: inicial.ProcesoMD || null,
    };
  });
  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }
  function buscarProceso(val){
    const matched = (procesos||[]).find(p => p.Radicado === val);
    setForm(prev => ({ ...prev, numeroCorto: val, ProcesoMD: matched ? matched.id : null }));
  }
  const procesoEncontrado = form.ProcesoMD ? (procesos||[]).find(p => String(p.id) === String(form.ProcesoMD)) : null;
  // Solo trabajadores activos (pedido explícito del usuario 2026-09-17) —
  // mismo criterio ya usado en Vacaciones/Horas Extras: Activo=Sí y Tipo de
  // Colaborador=Trabajador, no Contratista (ver esColaboradorVigente).
  const colaboradoresActivos = (colaboradores||[]).filter(esColaboradorVigente);

  function handleGuardar(){
    if(!form.Pendiente.trim()) return;
    const { numeroCorto, ...payload } = form;
    onGuardar(payload);
  }

  return (
    <div className="panel" style={{marginBottom:14}}>
      <div className="panel-body" style={{padding:'14px 20px', display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end'}}>
        <div className="field" style={{flex:1, minWidth:240}}>
          <label>Pendiente</label>
          <input type="text" value={form.Pendiente} onChange={e => setField('Pendiente', e.target.value)} placeholder="¿Qué hay que hacer?" />
        </div>
        <div className="field" style={{minWidth:190}}>
          <label>Pendiente de</label>
          <select value={form.PendienteDe} onChange={e => setField('PendienteDe', e.target.value)}>
            <option value="">Selecciona…</option>
            {/* Si el valor ya guardado no está en la lista (colaborador ya
                inactivo, o registro viejo), se agrega igual como opción para
                no perderlo de vista al editar — mismo criterio ya usado en
                Abogado responsable (AudienciasTerminosTab). */}
            {form.PendienteDe && !colaboradoresActivos.some(c => c.Nombre === form.PendienteDe) && (
              <option value={form.PendienteDe}>{form.PendienteDe}</option>
            )}
            {colaboradoresActivos.map(c => <option value={c.Nombre} key={c.id}>{c.Nombre}</option>)}
          </select>
        </div>
        <div className="field" style={{minWidth:190}}>
          <label>Pendiente para</label>
          <select value={form.PendientePara} onChange={e => setField('PendientePara', e.target.value)}>
            <option value="">Selecciona…</option>
            {form.PendientePara && !colaboradoresActivos.some(c => c.Nombre === form.PendientePara) && (
              <option value={form.PendientePara}>{form.PendientePara}</option>
            )}
            {colaboradoresActivos.map(c => <option value={c.Nombre} key={c.id}>{c.Nombre}</option>)}
          </select>
        </div>
        <div className="field" style={{maxWidth:160}}>
          <label>Fecha pendiente</label>
          <input type="date" value={form.FechaPendiente} onChange={e => setField('FechaPendiente', e.target.value)} />
        </div>
        <div className="field" style={{maxWidth:150}}>
          <label>Estado</label>
          <select value={form.Estado} onChange={e => setField('Estado', e.target.value)}>
            {ESTADO_OPTIONS.map(o => <option value={o} key={o}>{o}</option>)}
          </select>
        </div>
        <div className="field" style={{minWidth:220}}>
          <label>Proceso vinculado (opcional)</label>
          <input type="text" list="pendientes-procesos-datalist" value={form.numeroCorto} onChange={e => buscarProceso(e.target.value)} placeholder="Escribe el Número Corto…" />
          <datalist id="pendientes-procesos-datalist">
            {(procesos||[]).filter(p => p.Radicado).map(p => <option value={p.Radicado} key={p.id} />)}
          </datalist>
          {form.numeroCorto && !procesoEncontrado && (
            <div className="field-warning">Ese número corto no coincide con ningún proceso — se guardará como tarea suelta.</div>
          )}
          {procesoEncontrado && <div className="field-info">Cliente: {procesoEncontrado.Cliente || "—"}</div>}
        </div>
        <div className="field" style={{flex:1, minWidth:200}}>
          <label>Observación</label>
          <input type="text" value={form.Observacion} onChange={e => setField('Observacion', e.target.value)} />
        </div>
        <div style={{display:'flex', gap:8}}>
          <IconTextButton icon="add" variant="primary" disabled={guardando || !form.Pendiente.trim()} onClick={handleGuardar}>{guardando ? "Guardando…" : "Guardar"}</IconTextButton>
          <button type="button" className="btn-secondary" onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

const COLUMNAS = [
  {key:'pendiente', label:'Pendiente', value: p => p.Pendiente || ""},
  {key:'pendienteDe', label:'Pendiente de', value: p => p.PendienteDe || ""},
  {key:'pendientePara', label:'Pendiente para', value: p => p.PendientePara || ""},
  {key:'fecha', label:'Fecha', value: p => soloFechaISO(p.FechaPendiente)},
  {key:'estado', label:'Estado', value: p => p.Estado || ""},
  {key:'proceso', label:'Proceso', filterable:false},
  {key:'observacion', label:'Observación', value: p => p.Observacion || ""},
  {key:'acciones', label:'Acciones', filterable:false},
];

// Exportado (2026-09-17, pedido explícito del usuario: "que tal si creamos
// un nuevo modulo llamado vencimientos en el cual esté audiencias termino
// pendientes") como una sección embebible, sin su propio título de página —
// vive como una sub-pestaña más dentro de VencimientosView.jsx, igual que
// Audiencias/Términos (ver AudienciasTerminosTab.jsx).
export function PendientesSection({ pendientes, colaboradores, procesos, onCrear, onEditar, onEliminar, canWrite = true }){
  const [abierto, setAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const { filters, setFilter, clearFilters, rowMatches, hasActiveFilters } = useColumnFilters();
  const { sort, setSortKey, sortRows } = useColumnSort();

  const columnas = canWrite ? COLUMNAS : COLUMNAS.filter(c => c.key !== 'acciones');
  const filasSinOrdenar = (pendientes||[]).filter(p => rowMatches(p, columnas));
  const filas = sort ? sortRows(filasSinOrdenar, columnas) : filasSinOrdenar.sort((a,b) => String(b.FechaPendiente||"").localeCompare(String(a.FechaPendiente||"")));
  const nCols = columnas.length;

  async function guardarNuevo(datos){
    setGuardando(true);
    try{ await onCrear(datos); setAbierto(false); } finally { setGuardando(false); }
  }
  async function guardarEdicion(id, datos){
    setGuardando(true);
    try{ await onEditar(id, datos); setEditandoId(null); } finally { setGuardando(false); }
  }

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:14, flexWrap:'wrap', gap:10}}>
        {canWrite && !abierto && <IconTextButton icon="add" variant="primary" onClick={() => { setAbierto(true); setEditandoId(null); }}>Nuevo pendiente</IconTextButton>}
        {hasActiveFilters && <button type="button" className="clear-filters-link" onClick={clearFilters}>Limpiar filtros de columna</button>}
      </div>
      {abierto && <PendienteForm colaboradores={colaboradores} procesos={procesos} onGuardar={guardarNuevo} onCancelar={() => setAbierto(false)} guardando={guardando} />}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columnas.map(c => <ColumnHeaderMenu key={c.key} column={c} sort={sort} onSort={setSortKey} filterValue={filters[c.key]} onFilterChange={setFilter} rows={pendientes} />)}
            </tr>
          </thead>
          <tbody>
            {filas.length ? filas.map(p => {
              const proceso = p.ProcesoMD ? (procesos||[]).find(pr => String(pr.id) === String(p.ProcesoMD)) : null;
              return editandoId===p.id ? (
                <tr key={p.id}><td colSpan={nCols}><PendienteForm inicial={p} colaboradores={colaboradores} procesos={procesos} onGuardar={d => guardarEdicion(p.id, d)} onCancelar={() => setEditandoId(null)} guardando={guardando} /></td></tr>
              ) : (
                <tr key={p.id}>
                  <td className="cliente">{p.Pendiente || "—"}</td>
                  <td>{p.PendienteDe || "—"}</td>
                  <td>{p.PendientePara || "—"}</td>
                  <td>{soloFechaISO(p.FechaPendiente) || "—"}</td>
                  <td><span className={"badge " + (p.Estado==='Terminado' ? "badge-gris" : "badge-verde")}>{p.Estado || "Vigente"}</span></td>
                  <td>{proceso ? <>{proceso.Radicado}{proceso.Cliente ? <div className="save-hint">{proceso.Cliente}</div> : null}</> : "—"}</td>
                  <td>{p.Observacion || "—"}</td>
                  {canWrite && (
                    <td><div className="row-actions">
                      <IconButton icon="edit" variant="edit" label={`Editar pendiente`} onClick={() => { setEditandoId(p.id); setAbierto(false); }} />
                      <IconButton icon="delete" variant="delete" label={`Eliminar pendiente`} onClick={() => onEliminar(p.id)} />
                    </div></td>
                  )}
                </tr>
              );
            }) : <tr><td colSpan={nCols}><div className="empty-state empty-state-compact">Todavía no hay pendientes registrados.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
