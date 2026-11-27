// Moverse entre los procesos de la MISMA ENTIDAD (2026-11-28, pedido del usuario: botones «primero, atrás, siguiente, último» y un buscador ya filtrado por la entidad/grupo a la que pertenece el proceso abierto).
// La lista sigue el orden de la tabla de Procesos (por número corto). Se queda con los procesos de la misma Entidad y del mismo tipo de estado (vigentes con vigentes; si el abierto es un terminado, con terminados).
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const esTerminado = p => String(p && p.EstadoVT || '').trim().toUpperCase() === 'TERMINADO';

export function entidadDe(p){ return String(p && p.Entidad || '').trim(); }

/** { lista, indice, entidad }: los procesos entre los que se navega (ordenados por número corto) y la posición del abierto. */
export function vecinosDeProceso(procesos, actual){
  if(!actual) return { lista: [], indice: -1, entidad: '' };
  const ent = norm(entidadDe(actual));
  const term = esTerminado(actual);
  const lista = (procesos || []).filter(p => p && (String(p.id) === String(actual.id) || (ent && norm(entidadDe(p)) === ent && esTerminado(p) === term)))
    .sort((a, b) => String(a.Radicado || '').localeCompare(String(b.Radicado || ''), 'es', { numeric: true }) || (Number(a.id) || 0) - (Number(b.id) || 0));
  const indice = lista.findIndex(p => String(p.id) === String(actual.id));
  return { lista, indice, entidad: entidadDe(actual) };
}

/** Procesos de la lista que coinciden con lo escrito (número corto, cliente, partes, despacho, número completo); máx. `max`. */
export function buscarEnLista(lista, texto, max = 8){
  const q = norm(texto);
  if(q.length < 2) return [];
  return (lista || []).filter(p => [p.Radicado, p.NoCompleto, p.Cliente, p.Demandante, p.Demandado, p.Despacho, p.NumeroContrato].some(v => norm(v).includes(q))).slice(0, max);
}
