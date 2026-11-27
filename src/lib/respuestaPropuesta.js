// «Respuesta a la propuesta» (2026-11-27, pedido del usuario: «cuando la respondan»): después de enviada una propuesta de servicios, se busca en el correo de Gerencia la RESPUESTA del cliente en el mismo hilo
// (la conversación) y se distingue si parece una ACEPTACIÓN (p. ej. Aliansalud: «Aprobación de Propuesta de honorarios… me complace informarte la aceptación de la propuesta»). Es solo una pista: la aceptación
// la confirma una persona. Funciones puras, sin red.
const sinTildes = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** ¿El texto parece aceptar la propuesta? */
export function pareceAceptacion(asunto, texto){
  const a = sinTildes(asunto), t = a + ' ' + sinTildes(texto);
  if(/no (es )?(aprob|acept)|no aceptamos|no (nos )?(es )?posible aceptar|rechaz|declin/.test(t)) return false;
  return /aprobacion|aceptacion|aprobamos|aprobada|aceptamos|aceptada|acepto la propuesta|de acuerdo con (la|su) propuesta|queda(mos)? de acuerdo|puede(n)? proceder|pueden iniciar|adelante con (la|el)/.test(t);
}

/**
 * De los correos de la bandeja, los que responden a una propuesta: misma conversación, recibidos después de crearla y que no sean de nuestro equipo.
 * propuesta: { conversacion, creadoEn | fecha }; correos: [{ id, conversacion, fecha, remitente, remitenteNombre, asunto, resumen, enlace }]
 * → null si nadie ha respondido; si no, { tipo: 'aceptacion' | 'respuesta', correo, total }
 */
export function respuestaDePropuesta(propuesta, correos){
  if(!propuesta || !propuesta.conversacion) return null;
  const desde = String(propuesta.creadoEn || propuesta.fecha || '');
  const respuestas = (correos || []).filter(c => c.conversacion === propuesta.conversacion && !/@lexaraabogados\.com$/i.test(String(c.remitente || '')) && String(c.fecha || '') > desde)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  if(!respuestas.length) return null;
  const acepta = respuestas.filter(c => pareceAceptacion(c.asunto, c.resumen));
  const elegido = acepta.length ? acepta[acepta.length - 1] : respuestas[respuestas.length - 1];
  return { tipo: acepta.length ? 'aceptacion' : 'respuesta', correo: elegido, total: respuestas.length };
}
