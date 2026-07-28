import { ICON_SVG } from '../config';
import { stripHtml, estadoBadgeClass } from '../lib/graph';

const FILTERS = [
  {key:'todos', label:'Todos'},
  {key:'activos', label:'Activos'},
  {key:'apelacion', label:'En apelación / corte'},
  {key:'terminados', label:'Terminados'},
];

function matchesFilter(p, currentFilter){
  const e = (p.Estado||"").toLowerCase();
  if(currentFilter==='activos') return !e.includes('termin');
  if(currentFilter==='apelacion') return e.includes('apelaci') || e.includes('corte') || e.includes('casaci');
  if(currentFilter==='terminados') return e.includes('termin');
  return true;
}

export default function ProcesosView({ procesos, currentFilter, setFilter, searchQuery, onOpenProceso }){
  const query = (searchQuery||"").trim().toLowerCase();
  const rows = procesos.filter(p => matchesFilter(p, currentFilter) && (!query ||
    (p.Radicado||"").toLowerCase().includes(query) ||
    (p.Cliente||"").toLowerCase().includes(query) ||
    (p.Apoderado||"").toLowerCase().includes(query)));

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Procesos judiciales</h1>
          <p>{rows.length} de {procesos.length} procesos</p>
        </div>
      </div>
      <div className="toolbar">
        {FILTERS.map(f => (
          <div key={f.key} className={"filter-chip" + (currentFilter===f.key ? " active" : "")} onClick={() => setFilter(f.key)}>{f.label}</div>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Numero_Corto</th><th>Cliente</th><th>Despacho</th><th>No. despacho</th><th>Estado</th><th>Carpeta</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map(p => (
              <tr key={p.id} onClick={() => onOpenProceso(p.id)}>
                <td className="radicado">{p.Radicado || "—"}</td>
                <td className="cliente">{p.Cliente || "—"}</td>
                <td>{p.Despacho || "—"}</td>
                <td>{p.NumeroDespacho || "—"}</td>
                <td><span className={"badge badge-truncate " + estadoBadgeClass(p.Estado)} title={stripHtml(p.Estado)}>{stripHtml(p.Estado) || "—"}</span></td>
                <td>{p.LinkCarpeta ? <a href={p.LinkCarpeta} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{color:'var(--verde-oscuro)', fontWeight:600, textDecoration:'underline'}}>Abrir</a> : "—"}</td>
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
