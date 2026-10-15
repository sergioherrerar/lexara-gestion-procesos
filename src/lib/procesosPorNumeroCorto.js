// Listas de «Número Corto (Radicado)» de Términos, Audiencias y Pendientes (2026-10-15, pedido del usuario): dos procesos pueden tener el MISMO número corto
// (p. ej. 2026-00117 de dos entidades). El campo SIEMPRE sigue siendo el número corto tal cual (año, guion y cinco números); cuando el número se repite, la lista
// muestra al lado la entidad y el ID, y debajo del campo se elige a cuál de los procesos se refiere.

export const etiquetaProceso = p => `${p.Entidad || p.Cliente || 'sin entidad'} · ID ${p.id}`;

// [{ id, value, label? }] — value es siempre el número corto; label (entidad e ID) solo cuando el número se repite.
export function opcionesNumeroCorto(procesos){
  const lista = (procesos || []).filter(p => p && p.Radicado);
  const cuenta = new Map();
  lista.forEach(p => cuenta.set(p.Radicado, (cuenta.get(p.Radicado) || 0) + 1));
  return lista.map(p => (cuenta.get(p.Radicado) > 1
    ? { id: p.id, value: p.Radicado, label: etiquetaProceso(p) }
    : { id: p.id, value: p.Radicado }));
}

// Procesos cuyo número corto es exactamente el texto escrito (0, 1 o varios).
export function procesosConNumeroCorto(procesos, texto){
  const t = String(texto || '').trim();
  return t ? (procesos || []).filter(p => p && p.Radicado === t) : [];
}
