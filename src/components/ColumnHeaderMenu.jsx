import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { fmtDate, clavePorDia } from '../lib/graph';

// Encabezado de columna con menú desplegable (ordenar A-Z/Z-A + filtrar por
// texto + checklist de valores exactos), parecido al AutoFiltro de columna
// de Excel/SharePoint. Reemplaza la fila fija de cuadros de filtro que había
// antes debajo del encabezado — ahora todo vive dentro de este menú, columna
// por columna.
//
// El menú se dibuja con un portal a document.body (2026-09-16, bug real
// reportado por el usuario con una captura: el desplegable se veía cortado
// — solo "De la A a la Z"/"De la Z a la A" visibles, sin el cuadro de texto
// ni "Quitar filtro" — y no se podía ni ver ni quitar el filtro activo).
// Causa: `.table-wrap` tiene `overflow-x:auto` para el scroll horizontal de
// tablas anchas, pero por la especificación de CSS, poner overflow-x en
// cualquier valor que no sea "visible" hace que overflow-y también se
// vuelva "auto" en automático — así que ese contenedor también recortaba
// verticalmente cualquier cosa que se saliera de su alto, incluido este
// menú. Un portal saca el menú de ese contenedor por completo.
//
// El checklist de valores exactos se agregó el mismo día (bug real,
// reportado en Tutelas): escribir "Colmedica" en el texto libre también
// traía "GRUPO COLMEDICA" (la contiene como texto) y no había forma de
// pedir SOLO las filas cuya Entidad es exactamente "Colmedica". `rows`
// (opcional) trae el dataset completo de la tabla para armar la lista de
// valores realmente presentes en esa columna; sin ese prop, el menú sigue
// funcionando igual que antes (solo texto libre), así que es
// retrocompatible en las tablas donde todavía no se haya conectado.
export default function ColumnHeaderMenu({ column, sort, onSort, filterValue, onFilterChange, rows }){
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if(!open) return;
    function onDocPointer(e){
      if(btnRef.current?.contains(e.target)) return;
      if(menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKeyDown(e){ if(e.key === 'Escape') setOpen(false); }
    // Cierra al hacer scroll (en vez de recalcular posición) — más simple y
    // evita que el menú quede "flotando" en un lugar equivocado si el
    // usuario mueve la tabla o la página mientras está abierto.
    function onScroll(){ setOpen(false); }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  useLayoutEffect(() => {
    if(!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    // El menú mide mínimo 210px (ver .col-header-menu en styles.css) — con
    // el botón cerca del borde derecho (frecuente en columnas angostas de
    // celular) se recorta el margen si se deja "left: r.left" a secas.
    const ANCHO_MENU = 210;
    const MARGEN = 8;
    const left = Math.max(MARGEN, Math.min(r.left, window.innerWidth - ANCHO_MENU - MARGEN));
    setPos({ top: r.bottom + 4, left });
  }, [open]);

  const valoresDisponibles = useMemo(() => {
    if(!rows || !rows.length || column.filterable === false || typeof column.value !== 'function') return [];
    const set = new Set();
    rows.forEach(r => {
      // clavePorDia (2026-09-17) — agrupa un datetime ("...T14:06:51Z") por
      // su día en vez de por el instante exacto, si no cada fila con hora
      // distinta salía como una fila aparte en la lista.
      const v = clavePorDia(column.value(r));
      if(v) set.add(v);
    });
    return Array.from(set).sort((a,b) => a.localeCompare(b));
  }, [rows, column]);

  if(column.filterable === false){
    return <th>{column.label}</th>;
  }

  const isSorted = !!sort && sort.key === column.key;
  const texto = filterValue?.texto || "";
  const valoresElegidos = filterValue?.valores || [];
  const isFiltered = !!texto.trim() || valoresElegidos.length > 0;

  function alternarValor(valor){
    const yaElegido = valoresElegidos.includes(valor);
    const nuevos = yaElegido ? valoresElegidos.filter(v => v !== valor) : [...valoresElegidos, valor];
    onFilterChange(column.key, { valores: nuevos });
  }

  return (
    <th className="col-header-cell">
      <div className="col-header-menu-wrap">
        <button
          ref={btnRef}
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
        {open && pos && createPortal(
          <div className="col-header-menu col-header-menu-portal" ref={menuRef} style={{ top: pos.top, left: pos.left }}>
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
              value={texto}
              onChange={e => onFilterChange(column.key, { texto: e.target.value })}
            />
            {valoresDisponibles.length > 0 && (
              <>
                <label className="col-header-menu-label">O elige de la lista</label>
                <div className="col-header-menu-checklist">
                  {valoresDisponibles.map(v => (
                    <label key={v} className="col-header-menu-check">
                      <input type="checkbox" checked={valoresElegidos.includes(v)} onChange={() => alternarValor(v)} />
                      <span>{fmtDate(v)}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            {isFiltered && (
              <button type="button" className="col-header-menu-item col-header-menu-item-muted" onClick={() => onFilterChange(column.key, { texto: "", valores: [] })}>Quitar filtro</button>
            )}
          </div>,
          document.body
        )}
      </div>
    </th>
  );
}
