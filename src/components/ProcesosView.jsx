import { useState } from 'react';
import { ICON_SVG } from '../config';
import { stripHtml, estadoBadgeClass } from '../lib/graph';
import IconButton, { IconTextButton } from './IconButton';
import ColumnFilterRow from './ColumnFilterRow';
import { useColumnFilters } from '../hooks/useColumnFilters';

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
  {key:'carpeta', label:'Carpeta', filterable:false},
  {key:'acciones', label:'Acciones', filterable:false},
];

export default function ProcesosView({ procesos, currentFilter, setFilter, searchQuery, onOpenProceso, onCreateProceso, canWrite = true }){
  const [showTerminados, setShowTerminados] = useState(false);
  const { filters, setFilter: setColFilter, clearFilters, rowMatches, hasActiveFilters } = useColumnFilters();
  const entidades = Array.from(new Set(procesos.map(p => stripHtml(p.Entidad) || "Sin entidad"))).sort((a,b)=>a.localeCompare(b));
  const filterChips = [{key:'todos', label:'Todos'}, ...entidades.map(e => ({key:e, label:e}))];
  const totalTerminados = procesos.filter(isTerminado).length;

  const query = (searchQuery||"").trim().toLowerCase();
  const rows = procesos.filter(p => matchesFilter(p, currentFilter) && (showTerminados ? isTerminado(p) : !isTerminado(p)) && (!query ||
    (p.Radicado||"").toLowerCase().includes(query) ||
    (p.Cliente||"").toLowerCase().includes(query) ||
    (p.Apoderado||"").toLowerCase().includes(query)) && rowMatches(p, COLUMNS))
    .sort((a,b) => (a.Radicado||"").localeCompare(b.Radicado||""));

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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map(c => <th key={c.key}>{c.label}</th>)}
            </tr>
            <ColumnFilterRow columns={COLUMNS} filters={filters} onChange={setColFilter} />
          </thead>
          <tbody>
            {rows.length ? rows.map(p => (
              <tr
                key={p.id}
                onClick={() => onOpenProceso(p.id, {viewOnly: !canWrite})}
                role="button" tabIndex={0}
                onKeyDown={e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); onOpenProceso(p.id, {viewOnly: !canWrite}); } }}
              >
                <td className="radicado">{p.Radicado || "—"}</td>
                <td className="cliente">{p.Cliente || "—"}</td>
                <td>{p.Despacho || "—"}{p.NumeroDespacho ? ` · ${p.NumeroDespacho}` : ""}</td>
                <td><span className={"badge badge-truncate " + estadoBadgeClass(p.Estado)}>{stripHtml(p.Estado) || "—"}</span></td>
                <td>{p.LinkCarpeta ? <IconButton icon="open" variant="open" label="Abrir carpeta" href={p.LinkCarpeta} onClick={e => e.stopPropagation()} /> : "—"}</td>
                <td style={{whiteSpace:'nowrap'}}>
                  <div className="row-actions">
                    <IconButton icon="view" variant="view" label="Ver proceso (solo consulta)" onClick={e => { e.stopPropagation(); onOpenProceso(p.id, {viewOnly:true}); }} />
                    {canWrite && <IconButton icon="edit" variant="edit" label="Editar proceso" onClick={e => { e.stopPropagation(); onOpenProceso(p.id, {viewOnly:false}); }} />}
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={6}><div className="empty-state"><div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />No se encontraron procesos con ese criterio.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
