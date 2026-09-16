import { useState } from 'react';
import { normalize } from '../lib/graph';

// Filtro por columna: cada tabla define sus columnas ({key, value(row)}) y
// este hook guarda, por columna, un filtro de texto ("contiene", sin
// distinguir mayúsculas/tildes) Y una lista de valores exactos elegidos de
// un checklist (como el AutoFiltro de Excel) — independiente del buscador
// general de la barra superior — se combinan ambos (AND) entre columnas.
//
// El checklist se agregó 2026-09-16 (bug real reportado por el usuario en
// Tutelas, con captura): escribir "Colmedica" en el filtro de texto de
// Entidad también traía "GRUPO COLMEDICA" (la contiene como texto), y no
// había forma de pedir SOLO las filas cuya Entidad es exactamente
// "Colmedica". Ahora, si se marca al menos un valor del checklist, ese
// filtro manda (coincidencia EXACTA, sin importar qué haya escrito en el
// cuadro de texto); el texto libre sigue funcionando igual que antes cuando
// no hay ningún valor marcado.
export function useColumnFilters(){
  const [filters, setFilters] = useState({});

  // `patch` es un objeto parcial ({texto} y/o {valores}) que se combina con
  // lo que ya había para esa columna — así ColumnHeaderMenu puede actualizar
  // el texto y el checklist por separado sin pisarse entre sí.
  function setFilter(key, patch){
    setFilters(prev => ({
      ...prev,
      [key]: { texto: '', valores: [], ...prev[key], ...patch },
    }));
  }
  function clearFilters(){ setFilters({}); }

  function rowMatches(row, columns){
    return columns.every(col => {
      const f = filters[col.key];
      if(!f) return true;
      const valorCrudo = String(col.value(row) ?? "").trim();
      if(f.valores && f.valores.length) return f.valores.includes(valorCrudo);
      const texto = (f.texto || "").trim();
      if(!texto) return true;
      return normalize(valorCrudo).includes(normalize(texto));
    });
  }
  const hasActiveFilters = Object.values(filters).some(f => (f?.texto || "").trim() || (f?.valores || []).length);

  return { filters, setFilter, clearFilters, rowMatches, hasActiveFilters };
}
