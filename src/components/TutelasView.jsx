import { ICON_SVG } from '../config';
import { fmtDate } from '../lib/graph';
import IconButton, { IconTextButton } from './IconButton';
import ColumnHeaderMenu from './ColumnHeaderMenu';
import { useColumnFilters } from '../hooks/useColumnFilters';
import { useColumnSort } from '../hooks/useColumnSort';

const COLUMNS = [
  {key:'noTutela', label:'No. Tutela', value: t => t.NoTutela || ""},
  {key:'cliente', label:'Cliente', value: t => t.Cliente || ""},
  {key:'entidad', label:'Entidad', value: t => t.Entidad || ""},
  {key:'tema', label:'Tema', value: t => t.Tema || ""},
  {key:'juzgado', label:'Juzgado', value: t => t.Juzgado || ""},
  {key:'tipoRespuesta', label:'Tipo Respuesta', value: t => t.TipoRespuesta || ""},
  {key:'fechaNotificacion', label:'Fecha Notificación', value: t => t.FechaNotificacion || ""},
  {key:'fechaVencimiento', label:'Fecha Vencimiento', value: t => t.FechaVencimiento || ""},
  {key:'acciones', label:'Acciones', filterable:false},
];

export default function TutelasView({ tutelas, searchQuery, onOpenTutela, onCreateTutela, onDeleteTutela, canWrite = true }){
  const { filters, setFilter, clearFilters, rowMatches, hasActiveFilters } = useColumnFilters();
  const { sort, setSortKey, sortRows } = useColumnSort();
  const query = (searchQuery||"").trim().toLowerCase();
  // "No Tutela" es una columna numérica en SharePoint (llega como number,
  // no string) — .toLowerCase()/.localeCompare no existen en números y
  // tumbaban la búsqueda/orden sin avisar. Se envuelve todo en String().
  const rows = tutelas.filter(t => (!query ||
    String(t.NoTutela||"").toLowerCase().includes(query) ||
    String(t.Cliente||"").toLowerCase().includes(query) ||
    String(t.Entidad||"").toLowerCase().includes(query)) && rowMatches(t, COLUMNS))
    .sort((a,b) => String(b.FechaVencimiento||"").localeCompare(String(a.FechaVencimiento||"")));
  const sortedRows = sortRows(rows, COLUMNS);

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Tutelas</h1>
          <p>{rows.length} de {tutelas.length} tutelas{hasActiveFilters && <> · <button type="button" className="clear-filters-link" onClick={clearFilters}>Limpiar filtros de columna</button></>}</p>
        </div>
        {canWrite && <IconTextButton icon="add" variant="primary" onClick={onCreateTutela}>Nueva tutela</IconTextButton>}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map(c => (
                <ColumnHeaderMenu key={c.key} column={c} sort={sort} onSort={setSortKey} filterValue={filters[c.key]} onFilterChange={setFilter} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length ? sortedRows.map(t => (
              <tr key={t.id}>
                <td className="cliente">{t.NoTutela || "—"}</td>
                <td>{t.Cliente || "—"}</td>
                <td>{t.Entidad || "—"}</td>
                <td>{t.Tema || "—"}</td>
                <td><span className="juzgado-truncate">{t.Juzgado || "—"}</span></td>
                <td>{t.TipoRespuesta || "—"}</td>
                <td>{fmtDate(t.FechaNotificacion)}</td>
                <td>{fmtDate(t.FechaVencimiento)}</td>
                <td style={{whiteSpace:'nowrap'}}>
                  <div className="row-actions">
                    <IconButton icon="edit" variant="edit" label={canWrite ? "Editar tutela" : "Ver tutela"} onClick={() => onOpenTutela(t.id)} />
                    {canWrite && <IconButton icon="delete" variant="delete" label="Eliminar tutela" onClick={() => onDeleteTutela(t.id)} />}
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={9}><div className="empty-state"><div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />No hay tutelas para mostrar.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
