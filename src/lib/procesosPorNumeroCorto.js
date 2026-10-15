// Listas de «Número Corto (Radicado)» de Términos, Audiencias y Pendientes (2026-10-15, pedido del usuario): dos procesos pueden tener el MISMO número corto
// (p. ej. 2026-00117 de dos entidades) y en la lista aparecía repetido sin poder distinguirlos. Cuando un número se repite, cada opción lleva la entidad y el ID del proceso.

// [{ id, value }] — value es lo que se ve (y se escribe en el campo) en la lista desplegable.
export function opcionesNumeroCorto(procesos){
  const lista = (procesos || []).filter(p => p && p.Radicado);
  const cuenta = new Map();
  lista.forEach(p => cuenta.set(p.Radicado, (cuenta.get(p.Radicado) || 0) + 1));
  return lista.map(p => ({
    id: p.id,
    value: cuenta.get(p.Radicado) > 1 ? `${p.Radicado} · ${p.Entidad || p.Cliente || 'sin entidad'} · ID ${p.id}` : p.Radicado,
  }));
}

// { proceso, ambiguo }: el proceso al que corresponde lo escrito, o ambiguo=true si el número solo está repetido y hay que elegir uno de la lista.
export function buscarPorNumeroCorto(procesos, texto){
  const t = String(texto || '').trim();
  if(!t) return { proceso: null, ambiguo: false };
  const exacta = opcionesNumeroCorto(procesos).find(o => o.value === t);
  if(exacta) return { proceso: (procesos || []).find(p => p.id === exacta.id) || null, ambiguo: false };
  const iguales = (procesos || []).filter(p => p && p.Radicado === t);
  return { proceso: null, ambiguo: iguales.length > 1 };
}
