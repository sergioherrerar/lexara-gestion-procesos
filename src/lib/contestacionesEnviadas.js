// Tutelas → «Contestación»: reconoce en los Enviados del buzón Tutelas@ (2026-11-03, pedido del usuario) qué contestaciones ya se mandaron, por número de tutela.
// Así salen los correos de contestación (confirmado con ejemplos reales): desde Tutelas@, a la persona del cliente (Colmédica / Aliansalud), con un texto como
// «Remito contestación de tutela con (10) anexos», «Reenvió contestación por EPS sin anexos», «Remito cumplimiento por EPS», «Remito solicitud de aclaración por CMP» o
// «Remito solicitud de aplazamiento por CMP sin anexos», y a veces el Word de la respuesta adjunto («T 28379 Respuesta Aliansalud…»). Los correos «para su respectivo análisis de
// auditoría» y los que piden información al cliente NO son contestaciones: el texto tiene que empezar diciendo que se remite/reenvía una contestación, cumplimiento, aclaración,
// aplazamiento, alcance, impugnación o respuesta.
// Siglas: CMP = Colmédica · UMD / IPS = Unidad Médica y de Diagnóstico · EPS = Aliansalud.

import { sumarDiasHabilesJudiciales } from './audienciasTerminos.js';

const RE_NUM_ASUNTO = /(?:tutela|impugnaci[oó]n)s?\s*(?:no\.?|n[°º]|#)?\s*(\d{4,6})\b/i;
const RE_NUM_ADJUNTO = /^\s*T\s*(\d{4,6})\b/i;
// «Remito/Reenvío/Adjunto … contestación/cumplimiento/…» en la frase de apertura del correo.
const RE_REMITE_RESPUESTA = /\b(remito|reenvi[oó]|reenv[ií]o|adjunto)\b[^.]{0,70}\b(contestaci[oó]n|cumplimiento|aclaraci[oó]n|aplazamiento|alcance|impugnaci[oó]n|respuesta)/i;

/** 'colmedica' | 'umd' | 'aliansalud' | null, a partir de un texto. Primero las siglas (CMP, UMD/IPS, EPS) y después los nombres. */
export function entidadDeTexto(texto){
  const t = String(texto || '');
  if(/\bCMP\b/.test(t)) return 'colmedica';
  if(/\bUMD\b|\bIPS\b/.test(t)) return 'umd';
  if(/\bEPS\b/.test(t)) return 'aliansalud';
  if(/colm[eé]dic/i.test(t)) return 'colmedica';   // sin la «a» final: los nombres de adjunto largos llegan cortados («Respuesta Colmedic…»)
  if(/unidad\s+m[eé]dica|diagn[oó]stico/i.test(t)) return 'umd';
  if(/aliansalud/i.test(t)) return 'aliansalud';
  return null;
}

// Solo lo que escribió Tutelas@ al principio del correo: el resto es el hilo citado («De: … daniacp@colmedica.com»), que nombra a otras entidades y confundía la sigla.
function cuerpoPropio(vista){
  return String(vista || '').split(/_{4,}|\bDe:\s|\bEnviado( el)?:/i)[0];
}

/** De la lista de correos enviados ([{ asunto, fecha, vista, adjuntos:[nombre] }]) deja solo las contestaciones: [{ numero, entidad, fecha, tipo, asunto }]. */
export function contestacionesDeEnviados(mensajes){
  const salida = [];
  (mensajes || []).forEach(m => {
    const adjuntos = (m.adjuntos || []).map(String);
    const delFirma = adjuntos.find(a => RE_NUM_ADJUNTO.test(a));
    const numero = (RE_NUM_ASUNTO.exec(m.asunto || '') || [])[1] || (delFirma ? RE_NUM_ADJUNTO.exec(delFirma)[1] : null);
    if(!numero) return;
    const cuerpo = cuerpoPropio(m.vista);
    // Con el Word propio de la firma («T 12345 …») basta; sin él, la frase de apertura tiene que decir que remite una contestación, cumplimiento, aplazamiento…
    // (los «sin anexos» llevan solo la imagen de la firma como adjunto, por eso no se exige que haya adjuntos reales).
    if(!delFirma && !RE_REMITE_RESPUESTA.test(cuerpo)) return;
    const texto = `${cuerpo} ${delFirma || ''}`;
    const tipo = /aplazamiento/i.test(texto) ? 'Aplazamiento' : /cumplimiento/i.test(texto) ? 'Cumplimiento' : /aclaraci[oó]n/i.test(texto) ? 'Solicitud de aclaración' : /impugnaci[oó]n/i.test(texto) ? 'Impugnación' : 'Contestación';
    salida.push({ numero: String(Number(numero)), entidad: entidadDeTexto(texto) || entidadDeTexto(m.asunto), fecha: m.fecha || '', tipo, asunto: m.asunto || '' });
  });
  return salida;
}

const esAplazamiento = t => /aplaz/i.test(String(t || ''));

/** ¿La fila de Tutelas (por su Cliente/Entidad) es de esa entidad? Sin entidad reconocible en la fila, cualquier correo de ese número le sirve. */
function mismaEntidad(tutela, entidadCorreo){
  if(!entidadCorreo) return true;
  // El Cliente es quien distingue (Colmédica / Aliansalud / Unidad Médica); la Entidad dice «GRUPO COLMEDICA» en casi todas las filas, así que solo sirve si el Cliente no dice nada.
  const deFila = entidadDeTexto(tutela.Cliente) || entidadDeTexto(tutela.Entidad);
  return !deFila || deFila === entidadCorreo;
}

/**
 * Map id de tutela → { fecha, tipo, asunto } con el envío más reciente que le corresponde; las que no están en el mapa siguen por contestar.
 * Una fila de tipo «Aplazamiento» solo se da por enviada con un correo de aplazamiento, y las demás filas solo con correos que NO sean de aplazamiento
 * (pedir un aplazamiento no es contestar la tutela).
 */
export function enviadasPorTutela(tutelas, contestaciones){
  const porNumero = new Map();
  (contestaciones || []).forEach(c => { if(!porNumero.has(c.numero)) porNumero.set(c.numero, []); porNumero.get(c.numero).push(c); });
  const mapa = new Map();
  // Cuántas filas tiene cada número de tutela: la entidad del correo solo sirve para distinguir entre varias filas del MISMO número (p. ej. Colmédica y Aliansalud); con una sola fila,
  // el correo de ese número es de esa fila aunque el cliente registrado no coincida con la sigla.
  const filasPorNumero = new Map();
  (tutelas || []).forEach(t => { const n = String(Number(t.NoTutela)); filasPorNumero.set(n, (filasPorNumero.get(n) || 0) + 1); });
  (tutelas || []).forEach(t => {
    const unica = filasPorNumero.get(String(Number(t.NoTutela))) === 1;
    const filaAplaz = esAplazamiento(t.TipoRespuesta);
    const candidatos = (porNumero.get(String(Number(t.NoTutela))) || [])
      .filter(c => (c.tipo === 'Aplazamiento') === filaAplaz)
      .filter(c => unica || mismaEntidad(t, c.entidad));
    if(!candidatos.length) return;
    // Primero los correos que nombran a la entidad de la fila; los que no nombran a ninguna solo sirven si no hay otro.
    const propios = candidatos.filter(c => c.entidad);
    const elegidos = propios.length ? propios : candidatos;
    mapa.set(t.id, elegidos.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0]);
  });
  return mapa;
}

/**
 * Regla del aplazamiento (2026-11-03, tutela 28374): cuando de un mismo número de tutela ya se ENVIÓ la fila de tipo «Aplazamiento», las demás filas de ese número ganan un día hábil
 * judicial más de plazo por cada aplazamiento enviado. Devuelve el vencimiento efectivo ('AAAA-MM-DD') de la fila `t` y cuántos días se le sumaron.
 * `estaEnviada(fila)` dice si esa fila ya se contestó (guardada o reconocida en Enviados).
 */
export function vencimientoEfectivo(t, tutelas, estaEnviada){
  const venc = String(t.FechaVencimiento || '').slice(0, 10);
  if(!venc || esAplazamiento(t.TipoRespuesta)) return { fecha: venc, ampliado: 0 };
  const n = (tutelas || []).filter(x => x.id !== t.id && String(Number(x.NoTutela)) === String(Number(t.NoTutela)) && esAplazamiento(x.TipoRespuesta) && estaEnviada(x)).length;
  return n ? { fecha: sumarDiasHabilesJudiciales(venc, n) || venc, ampliado: n } : { fecha: venc, ampliado: 0 };
}
