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

// Fecha de hoy en formato "yyyy-mm-dd", para comparar contra Fecha
// Vencimiento (que llega como fecha/hora ISO) sin líos de huso horario.
function hoyISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function TutelasView({ tutelas, searchQuery, onOpenTutela, onCreateTutela, onDuplicateTutela, onDeleteTutela, canWrite = true }){
  const { filters, setFilter, clearFilters, rowMatches, hasActiveFilters } = useColumnFilters();
  const { sort, setSortKey, sortRows } = useColumnSort();
  // Contador de tutelas que vencen hoy — se recalcula en cada render, así
  // que siempre queda al día con lo último que haya en `tutelas` (recién
  // cargado o después de un refresh).
  const vencenHoy = tutelas.filter(t => String(t.FechaVencimiento||"").slice(0,10) === hoyISO()).length;
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
  // Diferencia por tipo (pedido explícito del usuario 2026-08-31, ajustado
  // 2026-09-01 a "solo las del día") — desglose del mismo badge "vencen
  // hoy" de arriba: cuántas de las que vencen HOY son Tutela/Impugnación/
  // Otras, sobre el total de `tutelas` (sin filtrar por búsqueda/columna,
  // igual que vencenHoy) — antes contaba todo lo filtrado/buscado en
  // pantalla, sin importar la fecha.
  const tutelasHoy = tutelas.filter(t => String(t.FechaVencimiento||"").slice(0,10) === hoyISO());
  const conteoTutela = tutelasHoy.filter(t => (t.TipoRespuesta||"").trim().toUpperCase() === 'TUTELA').length;
  const conteoImpugnacion = tutelasHoy.filter(t => (t.TipoRespuesta||"").trim().toUpperCase() === 'IMPUGNACION').length;
  const conteoOtras = tutelasHoy.length - conteoTutela - conteoImpugnacion;

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Tutelas</h1>
          <p>{rows.length} de {tutelas.length} tutelas{hasActiveFilters && <> · <button type="button" className="clear-filters-link" onClick={clearFilters}>Limpiar filtros de columna</button></>}</p>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:12, flexWrap:'wrap'}}>
          <span className={"badge " + (vencenHoy > 0 ? "badge-alerta" : "badge-gris")} style={{fontSize:14, padding:'8px 16px'}}>
            {vencenHoy} {vencenHoy === 1 ? "vence" : "vencen"} hoy
          </span>
          {canWrite && <IconTextButton icon="add" variant="primary" onClick={onCreateTutela}>Nueva tutela</IconTextButton>}
        </div>
      </div>
      {/* Diferencia por tipo, solo de lo que vence HOY (pedido explícito del
          usuario 2026-09-01) — en su propia fila, separada del título/botón
          de arriba: metida en la misma fila del view-header (que no tiene
          flex-wrap) empujaba el título hacia abajo en pantallas angostas.
          Alineada a la derecha, también pedido explícito. */}
      <div style={{display:'flex', gap:10, flexWrap:'wrap', justifyContent:'flex-end', marginBottom:16}}>
        <span className="badge badge-verde">{conteoTutela} Tutelas</span>
        <span className="badge badge-naranja">{conteoImpugnacion} Impugnaciones</span>
        <span className="badge badge-gris">{conteoOtras} Otras contestaciones</span>
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
                    {canWrite && <IconButton icon="duplicate" variant="duplicate" label="Duplicar tutela" onClick={() => onDuplicateTutela(t.id)} />}
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
