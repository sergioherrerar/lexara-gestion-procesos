import { ICON_SVG } from '../config';
import { stripHtml, estadoBadgeClass } from '../lib/graph';

function matchesFilter(p, currentFilter){
  if(currentFilter==='todos') return true;
  return (stripHtml(p.Entidad) || "Sin entidad") === currentFilter;
}

export default function ProcesosView({ procesos, currentFilter, setFilter, searchQuery, onOpenProceso }){
  const entidades = Array.from(new Set(procesos.map(p => stripHtml(p.Entidad) || "Sin entidad"))).sort((a,b)=>a.localeCompare(b));
  const filters = [{key:'todos', label:'Todos'}, ...entidades.map(e => ({key:e, label:e}))];

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
        {filters.map(f => (
          <div key={f.key} className={"filter-chip" + (currentFilter===f.key ? " active" : "")} onClick={() => setFilter(f.key)}>{f.label}</div>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Numero_Corto</th><th>Cliente</th><th>Despacho</th><th>No. despacho</th><th>Estado</th><th>Carpeta</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map(p => (
              <tr key={p.id} onClick={() => onOpenProceso(p.id)}>
                <td className="radicado">{p.Radicado || "—"}</td>
                <td className="cliente">{p.Cliente || "—"}</td>
                <td>{p.Despacho || "—"}</td>
                <td>{p.NumeroDespacho || "—"}</td>
                <td><span className={"badge badge-truncate " + estadoBadgeClass(p.Estado)}>{stripHtml(p.Estado) || "—"}</span></td>
                <td>{p.LinkCarpeta ? <a href={p.LinkCarpeta} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{color:'var(--verde-oscuro)', fontWeight:600, textDecoration:'underline'}}>Abrir</a> : "—"}</td>
                <td style={{whiteSpace:'nowrap'}}>
                  <button type="button" className="btn-secondary" style={{padding:'5px 10px', fontSize:'12px'}} onClick={e => { e.stopPropagation(); onOpenProceso(p.id); }}>Editar</button>
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
