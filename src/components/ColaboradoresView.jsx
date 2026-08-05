import { ICON_SVG } from '../config';
import ColumnFilterRow from './ColumnFilterRow';
import { useColumnFilters } from '../hooks/useColumnFilters';

const COLUMNS = [
  {key:'nombre', label:'Nombre', value: c => c.Nombre || ""},
  {key:'correo', label:'Correo', value: c => c.Correo || ""},
  {key:'telefono', label:'Teléfono', value: c => c.Telefono || ""},
  {key:'direccion', label:'Dirección', value: c => c.Direccion || ""},
  {key:'rol', label:'Rol', value: c => c.Rol || ""},
  {key:'activo', label:'Activo', value: c => c.Activo ? "Sí" : "No"},
];

// Vista de solo lectura — para editar/crear/eliminar colaboradores hay que
// ir a Configuración (solo Administrador llega ahí, ver src/lib/permissions.js).
export default function ColaboradoresView({ colaboradores, searchQuery }){
  const { filters, setFilter, clearFilters, rowMatches, hasActiveFilters } = useColumnFilters();
  const query = (searchQuery||"").trim().toLowerCase();
  const rows = colaboradores.filter(c => (!query ||
    (c.Nombre||"").toLowerCase().includes(query) ||
    (c.Correo||"").toLowerCase().includes(query)) && rowMatches(c, COLUMNS))
    .sort((a,b) => (a.Nombre||"").localeCompare(b.Nombre||""));

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Colaborador Lexara</h1>
          <p>{rows.length} de {colaboradores.length} colaboradores{hasActiveFilters && <> · <button type="button" className="clear-filters-link" onClick={clearFilters}>Limpiar filtros de columna</button></>}</p>
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
                <td className="cliente">{c.Nombre || "—"}</td>
                <td>{c.Correo || "—"}</td>
                <td>{c.Telefono || "—"}</td>
                <td>{c.Direccion || "—"}</td>
                <td>{c.Rol || "—"}</td>
                <td>{c.Activo ? "Sí" : "No"}</td>
              </tr>
            )) : (
              <tr><td colSpan={6}><div className="empty-state"><div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />No hay colaboradores para mostrar.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
