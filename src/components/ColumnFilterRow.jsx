// Fila de filtros individuales por columna, debajo de los encabezados.
// col.filterable === false omite el input (columnas de solo acciones/iconos).
export default function ColumnFilterRow({ columns, filters, onChange }){
  return (
    <tr className="column-filter-row">
      {columns.map(col => (
        <th key={col.key}>
          {col.filterable !== false && (
            <input
              type="text"
              className="column-filter-input"
              placeholder="Filtrar…"
              value={filters[col.key] || ""}
              onChange={e => onChange(col.key, e.target.value)}
            />
          )}
        </th>
      ))}
    </tr>
  );
}
