// Filtro de lista con casillas (como los "slicers" del boceto que pasó el
// usuario) — marca uno o varios valores y solo esos quedan incluidos; sin
// nada marcado, no filtra (se ven todos). `options`: [{value, count}].
export default function ChecklistFilter({ title, options, selected, onToggle, onClear }){
  return (
    <div className="checklist-filter">
      <div className="checklist-filter-head">
        <span>{title}</span>
        {selected.size > 0 && (
          <button type="button" className="checklist-filter-clear" onClick={onClear} title="Limpiar este filtro">✕</button>
        )}
      </div>
      <div className="checklist-filter-body">
        {options.length ? options.map(o => (
          <label className="checklist-filter-row" key={o.value}>
            <input type="checkbox" checked={selected.has(o.value)} onChange={() => onToggle(o.value)} />
            <span className="checklist-filter-label" title={o.value}>{o.value}</span>
            <span className="checklist-filter-count">{o.count}</span>
          </label>
        )) : <div className="checklist-filter-empty">Sin datos</div>}
      </div>
    </div>
  );
}
