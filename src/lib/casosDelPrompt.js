// Casos NOMBRADOS en el PROMPT MAESTRO de la abogada (PARTE III, secciones 16 a 31): para esos casos se aplican sus reglas de fondo (quitar y renumerar los bloques
// del modelo que no aplican, reescribir lo que el caso exige). Para cualquier otro caso se conserva el modelo completo. Mismos patrones que usa el artefacto.
const PATRONES = [
  [16, /no adscrit|puerta de entrada|red no adscrita|medico externo|cruce/],
  [17, /soat|accidente de transito|furips/],
  [18, /exclusion|cobertura|tope|medicina prepagada|plan (zafiro|rubi|diamante)|clausula/],
  [19, /preexistenc|declaracion (del )?estado de salud/],
  [20, /incapacidad|prestacion economica|licencia (de )?(maternidad|paternidad)/],
  [21, /empleador|\barl\b|riesgos laborales|mora|reintegro|estabilidad laboral|suspension del servicio/],
  [22, /portabilidad/],
  [24, /no (se encuentra|esta|ha estado) afiliad|no afiliad|vinculacion por error|sin afiliacion/],
  [25, /agend|programacion de (la )?cita|cuidador|enfermeria|libre escogencia/],
  [26, /invima|uso fuera de etiqueta|indicacion/],
  [27, /derecho de peticion|pqrs?\b/],
];
const POR_TIPO = { alcance: [28], aclaracion: [29], impugnacion: [30], aplazamiento: [31], cumplimiento: [28], requerimiento: [28] };
const sinTildes = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Secciones del PROMPT MAESTRO (16 a 31) que nombran este caso; vacío si el caso no está nombrado. */
export function casosNombradosEnPrompt({ tipo, cliente, texto }){
  const ids = [...(POR_TIPO[tipo] || [])];
  if(tipo === 'contestacion' || !POR_TIPO[tipo]){
    const base = sinTildes(texto);
    PATRONES.forEach(([n, re]) => { if(re.test(base) && !ids.includes(n)) ids.push(n); });
    if(cliente === 'umd' && !ids.includes(23)) ids.unshift(23);
  }
  return ids;
}
