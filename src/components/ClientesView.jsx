import { ICON_SVG } from '../config';
import { procesosForCliente } from '../lib/graph';
import IconButton from './IconButton';
import ColumnFilterRow from './ColumnFilterRow';
import { useColumnFilters } from '../hooks/useColumnFilters';

const COLUMNS = [
  {key:'razonSocial', label:'Razón social', value: c => c.RazonSocial || ""},
  {key:'nit', label:'NIT', value: c => c.Nit || ""},
  {key:'direccion', label:'Dirección', value: c => c.Direccion || ""},
  {key:'telefono', label:'Teléfono', value: c => c.Telefono || ""},
  {key:'correo', label:'Correo', value: c => c.Correo || ""},
  {key:'entidad', label:'Entidad', value: c => c.Entidad || ""},
  {key:'procesos', label:'Procesos', filterable:false},
  {key:'acciones', label:'Acciones', filterable:false},
];

export default function ClientesView({ clientes, procesos, searchQuery, onOpenCliente, onDeleteCliente }){
  const { filters, setFilter, clearFilters, rowMatches, hasActiveFilters } = useColumnFilters();
  const query = (searchQuery||"").trim().toLowerCase();
  const rows = clientes.filter(c => (!query ||
    (c.RazonSocial||"").toLowerCase().includes(query) ||
    (c.Nit||"").toLowerCase().includes(query) ||
    (c.Correo||"").toLowerCase().includes(query) ||
    (c.Direccion||"").toLowerCase().includes(query)) && rowMatches(c, COLUMNS))
    .sort((a,b) => (a.RazonSocial||"").localeCompare(b.RazonSocial||""));

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Clientes</h1>
          <p>{rows.length} de {clientes.length} clientes{hasActiveFilters && <> · <button type="button" className="clear-filters-link" onClick={clearFilters}>Limpiar filtros de columna</button></>}</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map(c => <th key={c.key}>{c.label}</th>)}
            </tr>
            <ColumnFilterRow columns={COLUMNS} filters={filters} onChange={setFilter} />
          </thead>
          <tbody>
            {rows.length ? rows.map(c => (
              <tr key={c.id}>
                <td className="cliente">{c.RazonSocial || "—"}</td>
                <td>{c.Nit || "—"}</td>
                <td>{c.Direccion || "—"}</td>
                <td>{c.Telefono || "—"}</td>
                <td>{c.Correo || "—"}</td>
                <td>{c.Entidad || "—"}</td>
                <td>{procesosForCliente(procesos, c).length}</td>
                <td style={{whiteSpace:'nowrap'}}>
                  <div className="row-actions">
                    <IconButton icon="edit" variant="edit" label="Editar cliente" onClick={() => onOpenCliente(c.id)} />
                    <IconButton icon="delete" variant="delete" label="Eliminar cliente" onClick={() => onDeleteCliente(c.id)} />
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={8}><div className="empty-state"><div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />No hay clientes para mostrar.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
