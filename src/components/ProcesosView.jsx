import { useState } from 'react';
import { ICON_SVG } from '../config';
import { stripHtml, estadoBadgeClass } from '../lib/graph';
import IconButton from './IconButton';

function matchesFilter(p, currentFilter){
  if(currentFilter==='todos') return true;
  return (stripHtml(p.Entidad) || "Sin entidad") === currentFilter;
}
function isTerminado(p){
  return (stripHtml(p.EstadoVT) || "").toLowerCase().includes('termin');
}

export default function ProcesosView({ procesos, currentFilter, setFilter, searchQuery, onOpenProceso }){
  const [showTerminados, setShowTerminados] = useState(false);
  const entidades = Array.from(new Set(procesos.map(p => stripHtml(p.Entidad) || "Sin entidad"))).sort((a,b)=>a.localeCompare(b));
  const filters = [{key:'todos', label:'Todos'}, ...entidades.map(e => ({key:e, label:e}))];
  const totalTerminados = procesos.filter(isTerminado).length;

  const query = (searchQuery||"").trim().toLowerCase();
  const rows = procesos.filter(p => matchesFilter(p, currentFilter) && (showTerminados ? isTerminado(p) : !isTerminado(p)) && (!query ||
    (p.Radicado||"").toLowerCase().includes(query) ||
    (p.Cliente||"").toLowerCase().includes(query) ||
    (p.Apoderado||"").toLowerCase().includes(query)))
    .sort((a,b) => (a.Radicado||"").localeCompare(b.Radicado||""));

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Procesos judiciales</h1>
          <p>{rows.length} de {procesos.length} procesos</p>
        </div>
      </div>
      <div className="toolbar">
        {filters.map(f => (
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
              <th>Numero_Corto</th><th>Cliente</th><th>Despacho</th><th>Estado</th><th>Carpeta</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map(p => (
              <tr
                key={p.id}
                onClick={() => onOpenProceso(p.id)}
                role="button" tabIndex={0}
                onKeyDown={e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); onOpenProceso(p.id); } }}
              >
                <td className="radicado">{p.Radicado || "—"}</td>
                <td className="cliente">{p.Cliente || "—"}</td>
                <td>{p.Despacho || "—"}{p.NumeroDespacho ? ` · ${p.NumeroDespacho}` : ""}</td>
                <td><span className={"badge badge-truncate " + estadoBadgeClass(p.Estado)}>{stripHtml(p.Estado) || "—"}</span></td>
                <td>{p.LinkCarpeta ? <IconButton icon="open" variant="open" label="Abrir carpeta" href={p.LinkCarpeta} onClick={e => e.stopPropagation()} /> : "—"}</td>
                <td style={{whiteSpace:'nowrap'}}>
                  <div className="row-actions">
                    <IconButton icon="edit" variant="edit" label="Editar proceso" onClick={e => { e.stopPropagation(); onOpenProceso(p.id); }} />
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
