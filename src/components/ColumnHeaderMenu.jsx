import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
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
// 2026-11-25 (pedido del usuario: «al dar clic se desaparece, no muestra el filtro completo; mejóralo lo mejor que puedas»): dos causas en la tabla «Todas las publicaciones de las redes»
// (y en cualquier tabla cerca del borde inferior). (1) El menú se ponía justo debajo del encabezado sin mirar si cabía en la pantalla, así que se salía por abajo y quedaba cortado.
// (2) Se cerraba con CUALQUIER movimiento de la página, y el navegador mueve la página solo cuando el cuadro de texto (autoFocus) queda fuera de la vista: el menú se cerraba apenas abría.
// Ahora: se mide el menú y se abre hacia abajo o hacia arriba según donde quepa (si no cabe en ninguno, ocupa la pantalla con su propio desplazamiento); el encabezado y el pie
// (Quitar filtro / Listo) quedan siempre a la vista; al mover la página el menú se reacomoda en vez de cerrarse (solo se cierra si el encabezado sale de la pantalla); y el cuadro de
// texto toma el foco sin mover la página (en el celular no, para no abrir el teclado encima).
export default function ColumnHeaderMenu({ column, sort, onSort, filterValue, onFilterChange, rows }){
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const cabRef = useRef(null);
  const cuerpoRef = useRef(null);
  const pieRef = useRef(null);
  const inputRef = useRef(null);

  const calcular = useCallback(() => {
    const btn = btnRef.current;
    if(!btn) return;
    const r = btn.getBoundingClientRect();
    const vh = window.innerHeight, vw = window.innerWidth, M = 8;
    const ancho = Math.min(310, vw - M * 2);
    const left = Math.max(M, Math.min(r.left, vw - ancho - M));
    // Alto natural del menú (encabezado + contenido completo + pie), sin importar el tope que tenga ahora.
    const natural = (cabRef.current?.offsetHeight || 0) + (cuerpoRef.current?.scrollHeight || 0) + (pieRef.current?.offsetHeight || 0) + 2;
    const abajo = vh - r.bottom - M - 4;
    const arriba = r.top - M - 4;
    let top, maxHeight;
    if(natural <= abajo){ top = r.bottom + 4; maxHeight = abajo; }
    else if(natural <= arriba){ top = r.top - 4 - natural; maxHeight = natural; }
    else if(Math.max(abajo, arriba) < 280){ top = M; maxHeight = vh - M * 2; }   // ni arriba ni abajo hay sitio: usa la pantalla entera
    else if(abajo >= arriba){ top = r.bottom + 4; maxHeight = abajo; }
    else { maxHeight = arriba; top = r.top - 4 - arriba; }
    setPos(prev => (prev && prev.top === top && prev.left === left && prev.maxHeight === maxHeight && prev.ancho === ancho) ? prev : { top, left, maxHeight, ancho });
    return r;
  }, []);

  useEffect(() => {
    if(!open) return;
    function onDocPointer(e){
      if(btnRef.current?.contains(e.target)) return;
      if(menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKeyDown(e){ if(e.key === 'Escape'){ setOpen(false); btnRef.current?.focus(); } }
    // El menú sigue al encabezado cuando la página se mueve o cambia de tamaño; solo se cierra si el encabezado sale por completo de la pantalla.
    // El desplazamiento DENTRO del menú (su lista) se ignora, para que marcar casillas nunca lo cierre (bug del 2026-09-19).
    function onMover(e){
      if(e && e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      const r = btnRef.current?.getBoundingClientRect();
      if(!r || r.bottom < 0 || r.top > window.innerHeight){ setOpen(false); return; }
      calcular();
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onMover, true);
    window.addEventListener('resize', onMover);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onMover, true);
      window.removeEventListener('resize', onMover);
    };
  }, [open, calcular]);

  // Primera medida al abrir (el menú ya está en pantalla pero oculto hasta tener posición).
  useLayoutEffect(() => {
    if(open) calcular(); else setPos(null);
  }, [open, calcular]);
  // El cuadro de texto toma el foco sin mover la página (en pantallas táctiles no, para no abrir el teclado encima del menú).
  const yaEnfocado = useRef(false);
  useEffect(() => {
    if(!open){ yaEnfocado.current = false; return; }
    if(pos && !yaEnfocado.current){
      yaEnfocado.current = true;
      if(!window.matchMedia?.('(pointer: coarse)').matches) inputRef.current?.focus({ preventScroll: true });
    }
  }, [open, pos]);

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
    return <th style={{textAlign:'center'}}><span style={column.labelColor ? { color: column.labelColor } : undefined}>{column.label}</span></th>;
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
          <span style={column.labelColor ? { color: column.labelColor } : undefined}>{column.label}</span>
          {isSorted && <span className="col-header-sort-arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
          {isFiltered && <span className="col-header-filter-dot" title="Columna filtrada" />}
          <svg className="col-header-chevron" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        {open && createPortal(
          <div
            className="col-header-menu col-header-menu-portal" ref={menuRef} role="dialog" aria-label={'Ordenar y filtrar ' + column.label}
            style={{ top: pos ? pos.top : 0, left: pos ? pos.left : 0, width: pos ? pos.ancho : 310, maxHeight: pos ? pos.maxHeight : undefined, visibility: pos ? 'visible' : 'hidden' }}
          >
            <div className="chm-cab" ref={cabRef}>
              <span className="chm-titulo">{column.label}</span>
              {isFiltered && <span className="chm-estado">Filtrada</span>}
              <button type="button" className="chm-cerrar" onClick={() => { setOpen(false); btnRef.current?.focus(); }} aria-label="Cerrar">✕</button>
            </div>
            <div className="chm-cuerpo" ref={cuerpoRef}>
              <div className="chm-orden">
                <button type="button" className={'chm-orden-btn' + (isSorted && sort.dir === 'asc' ? ' activo' : '')} onClick={() => { onSort(column.key, 'asc'); setOpen(false); }}><span aria-hidden="true">↑</span> De la A a la Z</button>
                <button type="button" className={'chm-orden-btn' + (isSorted && sort.dir === 'desc' ? ' activo' : '')} onClick={() => { onSort(column.key, 'desc'); setOpen(false); }}><span aria-hidden="true">↓</span> De la Z a la A</button>
              </div>
              {isSorted && (
                <button type="button" className="col-header-menu-item col-header-menu-item-muted" onClick={() => { onSort(null); setOpen(false); }}>Quitar orden</button>
              )}
              <div className="col-header-menu-divider" />
              <label className="col-header-menu-label">Filtrar por</label>
              <input
                ref={inputRef}
                type="text"
                className="col-header-menu-input"
                placeholder={esColumnaFecha ? "dd/mm/aaaa…" : "Escribe para filtrar…"}
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
                <label className="col-header-menu-label">O elige de la lista{valoresElegidos.length ? ' · ' + valoresElegidos.length + ' elegidos' : ''}</label>
                <div className="col-header-menu-checklist">
                  {valoresDisponibles.length > 4 && (
                    <CasillaTresEstados
                      checked={valoresElegidos.length === valoresDisponibles.length}
                      indeterminate={valoresElegidos.length > 0}
                      onChange={() => alternarGrupo(valoresDisponibles)}
                    >(Seleccionar todo)</CasillaTresEstados>
                  )}
                  {valoresDisponibles.map(v => (
                    <label key={v} className="col-header-menu-check" title={v}>
                      <input type="checkbox" checked={valoresElegidos.includes(v)} onChange={() => alternarValor(v)} />
                      <span>{v}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            </div>
            <div className="chm-pie" ref={pieRef}>
              <button type="button" className="chm-quitar" disabled={!isFiltered} onClick={() => onFilterChange(column.key, { texto: "", valores: [] })}>Quitar filtro</button>
              <button type="button" className="chm-listo" onClick={() => { setOpen(false); btnRef.current?.focus(); }}>Listo</button>
            </div>
          </div>,
          document.body
        )}
      </div>
    </th>
  );
}
