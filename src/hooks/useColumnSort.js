import { useState } from 'react';

// Orden por columna, al estilo de una lista de SharePoint/Excel (clic en el
// encabezado → "De la A a la Z"/"De la Z a la A"). Si no hay ninguna
// columna ordenada (sort === null), sortRows no toca el orden que ya
// traían las filas — cada vista sigue aplicando su propio orden por
// defecto (por Radicado, por número de factura, etc.) antes de pasar por
// aquí, y este hook solo lo sobreescribe si el usuario elige una columna.
export function useColumnSort(){
  const [sort, setSort] = useState(null); // {key, dir:'asc'|'desc'} | null

  function setSortKey(key, dir){
    if(!key){ setSort(null); return; }
    setSort({key, dir});
  }

  function sortRows(rows, columns){
    if(!sort) return rows;
    const col = columns.find(c => c.key === sort.key);
    if(!col || !col.value) return rows;
    const sorted = [...rows].sort((a, b) =>
      String(col.value(a) ?? "").localeCompare(String(col.value(b) ?? ""), 'es', {numeric:true, sensitivity:'base'})
    );
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
  }

  return { sort, setSortKey, sortRows };
}
