import { useState, useRef, useEffect } from 'react';

// Encabezado de columna con menú desplegable (ordenar A-Z/Z-A + filtrar por
// texto), parecido al de una lista de SharePoint/Excel. Reemplaza la fila
// fija de cuadros de filtro que había antes debajo del encabezado — ahora
// todo vive dentro de este menú, columna por columna.
export default function ColumnHeaderMenu({ column, sort, onSort, filterValue, onFilterChange }){
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if(!open) return;
    function onDocPointer(e){ if(ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onKeyDown(e){ if(e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if(column.filterable === false){
    return <th>{column.label}</th>;
  }

  const isSorted = !!sort && sort.key === column.key;
  const isFiltered = !!(filterValue || "").trim();

  return (
    <th className="col-header-cell">
      <div className="col-header-menu-wrap" ref={ref}>
        <button
          type="button"
          className={"col-header-btn" + (isSorted || isFiltered ? " active" : "")}
          onClick={() => setOpen(v => !v)}
        >
          <span>{column.label}</span>
          {isSorted && <span className="col-header-sort-arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
          {isFiltered && <span className="col-header-filter-dot" title="Columna filtrada" />}
          <svg className="col-header-chevron" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        {open && (
          <div className="col-header-menu">
            <button type="button" className="col-header-menu-item" onClick={() => { onSort(column.key, 'asc'); setOpen(false); }}>De la A a la Z</button>
            <button type="button" className="col-header-menu-item" onClick={() => { onSort(column.key, 'desc'); setOpen(false); }}>De la Z a la A</button>
            {isSorted && (
              <button type="button" className="col-header-menu-item col-header-menu-item-muted" onClick={() => { onSort(null); setOpen(false); }}>Quitar orden</button>
            )}
            <div className="col-header-menu-divider" />
            <label className="col-header-menu-label">Filtrar por</label>
            <input
              type="text"
              className="col-header-menu-input"
              placeholder="Escribe para filtrar…"
              autoFocus
              value={filterValue || ""}
              onChange={e => onFilterChange(column.key, e.target.value)}
            />
            {isFiltered && (
              <button type="button" className="col-header-menu-item col-header-menu-item-muted" onClick={() => onFilterChange(column.key, "")}>Quitar filtro</button>
            )}
          </div>
        )}
      </div>
    </th>
  );
}
