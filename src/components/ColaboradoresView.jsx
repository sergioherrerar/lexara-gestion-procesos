import { ICON_SVG } from '../config';
import IconButton, { IconTextButton } from './IconButton';
import ColumnFilterRow from './ColumnFilterRow';
import { useColumnFilters } from '../hooks/useColumnFilters';

const COLUMNS = [
  {key:'nombre', label:'Nombre', value: c => c.Nombre || ""},
  {key:'correo', label:'Correo', value: c => c.Correo || ""},
  {key:'telefono', label:'Teléfono', value: c => c.Telefono || ""},
  {key:'direccion', label:'Dirección', value: c => c.Direccion || ""},
  {key:'rol', label:'Rol', value: c => c.Rol || ""},
  {key:'activo', label:'Activo', value: c => c.Activo ? "Sí" : "No"},
  {key:'acciones', label:'Acciones', filterable:false},
];

export default function ColaboradoresView({ colaboradores, searchQuery, onOpenColaborador, onCreateColaborador, onDeleteColaborador, canWrite = true }){
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
        {canWrite && <IconTextButton icon="add" variant="primary" onClick={onCreateColaborador}>Nuevo colaborador</IconTextButton>}
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
                <td style={{whiteSpace:'nowrap'}}>
                  <div className="row-actions">
                    <IconButton icon="edit" variant="edit" label={canWrite ? "Editar colaborador" : "Ver colaborador"} onClick={() => onOpenColaborador(c.id)} />
                    {canWrite && <IconButton icon="delete" variant="delete" label="Eliminar colaborador" onClick={() => onDeleteColaborador(c.id)} />}
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={7}><div className="empty-state"><div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />No hay colaboradores para mostrar.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
