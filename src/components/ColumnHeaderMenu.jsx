import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { clavePorDia } from '../lib/graph';
import { MESES_NOMBRES } from '../lib/horasExtras';

// Casilla de 3 estados (marcada / vacía / "algunos") — como Año y Mes en el
// árbol de fechas de abajo, un checkbox HTML normal no tiene forma de pintar
// "algunos de mis hijos están marcados" con una sola prop, hay que tocar la
// propiedad `.indeterminate` del elemento directamente en el DOM.
function CasillaTresEstados({ checked, indeterminate, onChange, children }){
  const ref = useRef(null);
  useEffect(() => { if(ref.current) ref.current.indeterminate = !checked && indeterminate; }, [checked, indeterminate]);
  return (
    <label className="col-header-menu-check">
      <input ref={ref} type="checkbox" checked={checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

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
    //
    // BUG REAL corregido 2026-09-19 (reportado por el usuario: "se da clic
    // para seleccionar cualquier elemento de la fila y se quita el filtro"):
    // el checklist de "O elige de la lista" (o el árbol de fechas) puede
    // necesitar su propio scroll interno cuando hay muchos valores — como el
    // evento "scroll" no burbujea pero SÍ pasa por la fase de captura, este
    // listener en `window` con `capture:true` también se disparaba al
    // desplazarse DENTRO del propio menú, cerrándolo antes de que el clic en
    // la casilla llegara a registrarse. Se ignora el scroll que viene de
    // dentro del menú mismo.
    function onScroll(e){
      // e.target no siempre es un elemento real (el resize no trae target
      // usable, y algunos scroll sintéticos tampoco) — .contains() exige un
      // Node de verdad o truena.
      if(e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
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

  // Columna de fecha (2026-09-19, pedido explícito del usuario: "que en
  // fecha sea igual a Excel en todas las tablas que contengas fechas") — se
  // detecta sola por la FORMA del dato (AAAA-MM-DD, lo que ya deja
  // clavePorDia), sin tener que marcar cada columna de cada tabla a mano; se
  // arma un árbol Año > Mes > Día como el AutoFiltro de Excel, en vez del
  // checklist plano de siempre.
  const esColumnaFecha = valoresDisponibles.length > 0 && valoresDisponibles.every(v => /^\d{4}-\d{2}-\d{2}$/.test(v));
  const arbolFechas = useMemo(() => {
    if(!esColumnaFecha) return null;
    const anios = new Map(); // "2026" -> Map("03" -> ["2026-03-05","2026-03-12",...])
    valoresDisponibles.forEach(v => {
      const [anio, mes] = v.split('-');
      if(!anios.has(anio)) anios.set(anio, new Map());
      const meses = anios.get(anio);
      if(!meses.has(mes)) meses.set(mes, []);
      meses.get(mes).push(v);
    });
    return anios;
  }, [esColumnaFecha, valoresDisponibles]);
  // Expandido por defecto (2026-09-19) — con pocas fechas (el caso normal en
  // este portal) ver todo de una vez sin tener que ir abriendo año por año y
  // mes por mes es más simple para un usuario no técnico; igual se puede
  // colapsar con la flechita si la lista llega a ser larga.
  const [colapsados, setColapsados] = useState(() => new Set());
  function alternarColapso(clave){
    setColapsados(prev => {
      const next = new Set(prev);
      next.has(clave) ? next.delete(clave) : next.add(clave);
      return next;
    });
  }

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
  // Marcar/desmarcar un grupo entero de días de una sola vez (clic en el
  // checkbox de un Año o de un Mes) — mismo comportamiento que Excel: si
  // todos los días del grupo ya estaban marcados, los quita todos; si no
  // (ninguno o "algunos" — estado indeterminado), los marca todos.
  function alternarGrupo(dias){
    const todosMarcados = dias.every(d => valoresElegidos.includes(d));
    const sinElGrupo = valoresElegidos.filter(v => !dias.includes(v));
    onFilterChange(column.key, { valores: todosMarcados ? sinElGrupo : [...sinElGrupo, ...dias] });
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
              placeholder={esColumnaFecha ? "dd/mm/aaaa…" : "Escribe para filtrar…"}
              autoFocus
              value={texto}
              onChange={e => onFilterChange(column.key, { texto: e.target.value })}
            />
            {esColumnaFecha && arbolFechas && (
              <>
                <label className="col-header-menu-label">O elige de la lista</label>
                <div className="col-header-menu-checklist col-header-menu-arbol-fecha">
                  <CasillaTresEstados
                    checked={valoresElegidos.length === valoresDisponibles.length}
                    indeterminate={valoresElegidos.length > 0}
                    onChange={() => alternarGrupo(valoresDisponibles)}
                  >(Seleccionar todo)</CasillaTresEstados>
                  {Array.from(arbolFechas.entries()).map(([anio, meses]) => {
                    const diasDelAnio = Array.from(meses.values()).flat();
                    const anioColapsado = colapsados.has(anio);
                    return (
                      <div key={anio} className="col-header-menu-arbol-nivel">
                        <div className="col-header-menu-arbol-fila">
                          <button type="button" className="col-header-menu-arbol-flecha" onClick={() => alternarColapso(anio)} aria-label={anioColapsado ? `Mostrar ${anio}` : `Ocultar ${anio}`}>
                            {anioColapsado ? '▸' : '▾'}
                          </button>
                          <CasillaTresEstados
                            checked={diasDelAnio.every(d => valoresElegidos.includes(d))}
                            indeterminate={diasDelAnio.some(d => valoresElegidos.includes(d))}
                            onChange={() => alternarGrupo(diasDelAnio)}
                          >{anio}</CasillaTresEstados>
                        </div>
                        {!anioColapsado && Array.from(meses.entries()).map(([mes, dias]) => {
                          const claveMes = `${anio}-${mes}`;
                          const mesColapsado = colapsados.has(claveMes);
                          return (
                            <div key={mes} className="col-header-menu-arbol-nivel col-header-menu-arbol-nivel-2">
                              <div className="col-header-menu-arbol-fila">
                                <button type="button" className="col-header-menu-arbol-flecha" onClick={() => alternarColapso(claveMes)} aria-label={mesColapsado ? `Mostrar ${MESES_NOMBRES[Number(mes)-1]}` : `Ocultar ${MESES_NOMBRES[Number(mes)-1]}`}>
                                  {mesColapsado ? '▸' : '▾'}
                                </button>
                                <CasillaTresEstados
                                  checked={dias.every(d => valoresElegidos.includes(d))}
                                  indeterminate={dias.some(d => valoresElegidos.includes(d))}
                                  onChange={() => alternarGrupo(dias)}
                                >{MESES_NOMBRES[Number(mes)-1]}</CasillaTresEstados>
                              </div>
                              {!mesColapsado && dias.map(d => (
                                <div key={d} className="col-header-menu-arbol-nivel col-header-menu-arbol-nivel-3">
                                  <CasillaTresEstados checked={valoresElegidos.includes(d)} indeterminate={false} onChange={() => alternarValor(d)}>
                                    {Number(d.slice(8,10))}
                                  </CasillaTresEstados>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {!esColumnaFecha && valoresDisponibles.length > 0 && (
              <>
                <label className="col-header-menu-label">O elige de la lista</label>
                <div className="col-header-menu-checklist">
                  {valoresDisponibles.map(v => (
                    <label key={v} className="col-header-menu-check">
                      <input type="checkbox" checked={valoresElegidos.includes(v)} onChange={() => alternarValor(v)} />
                      <span>{v}</span>
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
