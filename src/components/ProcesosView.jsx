import { useState } from 'react';
import { ICON_SVG } from '../config';
import { stripHtml, estadoBadgeClass } from '../lib/graph';
import IconButton, { IconTextButton } from './IconButton';
import ColumnHeaderMenu from './ColumnHeaderMenu';
import { useColumnFilters } from '../hooks/useColumnFilters';
import { useColumnSort } from '../hooks/useColumnSort';
import { generarFichaProcesoPDF } from '../lib/informeProceso';
import { generarInformeClienteHTML } from '../lib/exportarInformeCliente';

function matchesFilter(p, currentFilter){
  if(currentFilter==='todos') return true;
  return (stripHtml(p.Entidad) || "Sin entidad") === currentFilter;
}
function isTerminado(p){
  return (stripHtml(p.EstadoVT) || "").toLowerCase().includes('termin');
}

const COLUMNS = [
  {key:'radicado', label:'Numero_Corto', value: p => p.Radicado || ""},
  {key:'cliente', label:'Cliente', value: p => p.Cliente || ""},
  {key:'despacho', label:'Despacho', value: p => `${p.Despacho||""} ${p.NumeroDespacho||""}`.trim()},
  {key:'estado', label:'Estado', value: p => stripHtml(p.Estado) || ""},
  {key:'observaciones', label:'Observación', value: p => stripHtml(p.Observaciones) || ""},
  {key:'carpeta', label:'Carpeta', filterable:false},
  {key:'acciones', label:'Acciones', filterable:false},
];

export default function ProcesosView({ procesos, currentFilter, setFilter, searchQuery, onOpenProceso, onCreateProceso, canWrite = true, config, notify }){
  const [showTerminados, setShowTerminados] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(null); // id del proceso mientras genera su ficha en PDF
  const [clienteInforme, setClienteInforme] = useState('');
  const { filters, setFilter: setColFilter, clearFilters, rowMatches, hasActiveFilters } = useColumnFilters();
  const { sort, setSortKey, sortRows } = useColumnSort();

  async function handleGenerarFicha(proceso){
    setGenerandoPDF(proceso.id);
    try{ await generarFichaProcesoPDF(proceso); }
    finally { setGenerandoPDF(null); }
  }
  const entidades = Array.from(new Set(procesos.map(p => stripHtml(p.Entidad) || "Sin entidad"))).sort((a,b)=>a.localeCompare(b));
  const filterChips = [{key:'todos', label:'Todos'}, ...entidades.map(e => ({key:e, label:e}))];
  const totalTerminados = procesos.filter(isTerminado).length;

  // Informe HTML por Cliente (con botón de pago) — pedido explícito del
  // usuario 2026-08-25: en vez de darle acceso al cliente para que inicie
  // sesión y vea solo lo suyo, se genera un archivo aparte que el despacho
  // descarga y envía por correo — ver [[project_dashboard_analisis_entidad]]
  // (mismo patrón que el export HTML del Dashboard) y exportarInformeCliente.js.
  const clientesDistintos = Array.from(new Set(procesos.map(p => (p.Cliente||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  function handleDescargarInformeCliente(){
    if(!clienteInforme) return;
    try{
      generarInformeClienteHTML(procesos, clienteInforme, config?.DAVIVIENDA_PAGOS_URL);
    } catch(err){
      console.error(err);
      notify?.("No se pudo generar el informe del cliente: " + err.message, 'error');
    }
  }

  const query = (searchQuery||"").trim().toLowerCase();
  const rows = procesos.filter(p => matchesFilter(p, currentFilter) && (showTerminados ? isTerminado(p) : !isTerminado(p)) && (!query ||
    (p.Radicado||"").toLowerCase().includes(query) ||
    (p.Cliente||"").toLowerCase().includes(query) ||
    (p.Apoderado||"").toLowerCase().includes(query)) && rowMatches(p, COLUMNS))
    .sort((a,b) => (a.Radicado||"").localeCompare(b.Radicado||""));
  const sortedRows = sortRows(rows, COLUMNS);

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Procesos judiciales</h1>
          <p>{rows.length} de {procesos.length} procesos{hasActiveFilters && <> · <button type="button" className="clear-filters-link" onClick={clearFilters}>Limpiar filtros de columna</button></>}</p>
        </div>
        {canWrite && <IconTextButton icon="add" variant="primary" onClick={onCreateProceso}>Nuevo proceso judicial</IconTextButton>}
      </div>
      <div className="toolbar">
        {filterChips.map(f => (
          <div
            key={f.key}
            className={"filter-chip" + (currentFilter===f.key ? " active" : "")}
            onClick={() => setFilter(f.key)}
            role="button" tabIndex={0}
            onKeyDown={e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); setFilter(f.key); } }}
          >{f.label}</div>
        ))}
        <div
          className={"filter-chip filter-chip-terminados" + (showTerminados ? " active" : "")}
          style={{marginLeft:'auto'}}
          onClick={() => setShowTerminados(v => !v)}
          role="button" tabIndex={0}
          onKeyDown={e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); setShowTerminados(v => !v); } }}
        >
          {showTerminados ? "← Ver vigentes" : `Ver terminados (${totalTerminados})`}
        </div>
      </div>
      <div className="informe-cliente-bar">
        <span className="informe-cliente-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6M9 11h6"/></svg>
        </span>
        <span className="informe-cliente-label">Informe para un cliente:</span>
        <select value={clienteInforme} onChange={e => setClienteInforme(e.target.value)}>
          <option value="">— Selecciona un cliente —</option>
          {clientesDistintos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <IconTextButton icon="html" variant="primary" onClick={handleDescargarInformeCliente} disabled={!clienteInforme}>Descargar informe del cliente</IconTextButton>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map(c => (
                <ColumnHeaderMenu key={c.key} column={c} sort={sort} onSort={setSortKey} filterValue={filters[c.key]} onFilterChange={setColFilter} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length ? sortedRows.map(p => (
              <tr
                key={p.id}
                onClick={() => onOpenProceso(p.id, {viewOnly: !canWrite})}
                role="button" tabIndex={0}
                onKeyDown={e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); onOpenProceso(p.id, {viewOnly: !canWrite}); } }}
              >
                <td className="radicado">{p.Radicado || "—"}</td>
                <td className="cliente">{p.Cliente || "—"}</td>
                <td>{p.Despacho || "—"}{p.NumeroDespacho ? ` · ${p.NumeroDespacho}` : ""}</td>
                <td><span className={"badge badge-truncate " + estadoBadgeClass(p.EstadoVT, p.FechaUltimoEstado, p.Estado)}>{stripHtml(p.Estado) || "—"}</span></td>
                <td><span className="obs-truncate">{stripHtml(p.Observaciones) || "—"}</span></td>
                <td>{p.LinkCarpeta ? <IconButton icon="open" variant="open" label="Abrir carpeta" href={p.LinkCarpeta} onClick={e => e.stopPropagation()} /> : "—"}</td>
                <td style={{whiteSpace:'nowrap'}}>
                  <div className="row-actions">
                    <IconButton icon="view" variant="view" label="Ver proceso (solo consulta)" onClick={e => { e.stopPropagation(); onOpenProceso(p.id, {viewOnly:true}); }} />
                    {canWrite && <IconButton icon="edit" variant="edit" label="Editar proceso" onClick={e => { e.stopPropagation(); onOpenProceso(p.id, {viewOnly:false}); }} />}
                    <IconButton icon="pdf" variant="pdf" label="Descargar ficha en PDF" spinning={generandoPDF===p.id} onClick={e => { e.stopPropagation(); handleGenerarFicha(p); }} />
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={7}><div className="empty-state"><div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />No se encontraron procesos con ese criterio.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
