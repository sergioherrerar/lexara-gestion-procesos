// «Tipo de contrato» de un colaborador (2026-10-19, pedido del usuario: el campo «Tipo de colaborador» (Trabajador / Contratista) pasa a llamarse «Tipo de contrato»
// y se incluye en todas las certificaciones laborales). La columna de SharePoint sigue siendo la misma (TipodeColaborador); solo cambian el rótulo y las opciones.
// Los valores viejos «Trabajador» se leen como «Indefinido» (regla del usuario 2026-09-15: todo Trabajador tenía contrato a término indefinido).

// Deben coincidir EXACTO con las opciones de la columna «Opción» de SharePoint (Equipo MD → Tipo de contrato): no se pueden escribir valores a mano.
export const TIPOS_CONTRATO = ['Indefinido', 'Término fijo', 'Obra o labor', 'Aprendizaje', 'Estudiante Universitario', 'Contratista'];

const clave = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** Valor de SharePoint (viejo o nuevo) → una de las opciones de TIPOS_CONTRATO; si no se reconoce, el texto tal cual; vacío → ''. */
export function tipoContratoCanonico(valor){
  const n = clave(valor);
  if(!n) return '';
  if(n === 'trabajador' || n.startsWith('indefinid') || n.includes('termino indefinido')) return 'Indefinido';
  if(n.includes('fijo')) return 'Término fijo';
  if(n.includes('obra') || n.includes('labor')) return 'Obra o labor';
  if(n.includes('aprendiz')) return 'Aprendizaje';
  if(n.includes('estudiante')) return 'Estudiante Universitario';
  if(n === 'contratista' || n.includes('prestacion de servicios')) return 'Contratista';
  return String(valor).trim();
}

export const esContratista = valor => tipoContratoCanonico(valor) === 'Contratista';

// Cómo se nombra el contrato en la certificación laboral («… mediante contrato de trabajo a término indefinido, desde el …»).
// Sin tipo definido se mantiene lo de siempre (término indefinido).
export function frasePrincipalContrato(valor){
  switch(tipoContratoCanonico(valor) || 'Indefinido'){   // un valor que no se reconoce no se presenta como «indefinido»: queda «contrato de trabajo» a secas
    case 'Término fijo': return 'contrato de trabajo a término fijo';
    case 'Obra o labor': return 'contrato de trabajo por obra o labor';
    case 'Aprendizaje': return 'contrato de aprendizaje';
    case 'Estudiante Universitario': return 'vinculación de práctica como estudiante universitario';
    case 'Contratista': return 'contrato de prestación de servicios';
    case 'Indefinido': return 'contrato de trabajo a término indefinido';
    default: return 'contrato de trabajo';
  }
}
