import { useState } from 'react';
import { normalize } from '../lib/graph';

// Filtro por columna: cada tabla define sus columnas ({key, value(row)}) y
// este hook guarda un texto de filtro por columna, comparando por
// "contiene" (sin distinguir mayúsculas/tildes), independiente del buscador
// general de la barra superior — se combinan ambos (AND).
export function useColumnFilters(){
  const [filters, setFilters] = useState({});

  function setFilter(key, value){
    setFilters(prev => ({...prev, [key]: value}));
  }
  function clearFilters(){ setFilters({}); }
  function rowMatches(row, columns){
    return columns.every(col => {
      const f = (filters[col.key] || "").trim();
      if(!f) return true;
      const val = normalize(String(col.value(row) ?? ""));
      return val.includes(normalize(f));
    });
  }
  const hasActiveFilters = Object.values(filters).some(v => (v||"").trim());

  return { filters, setFilter, clearFilters, rowMatches, hasActiveFilters };
}
