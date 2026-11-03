// Tutelas → «Contestación»: reconoce en los Enviados del buzón Tutelas@ (2026-11-03, pedido del usuario) qué contestaciones ya se mandaron, por número de tutela.
// Así salen los correos de contestación (confirmado con ejemplos reales): desde Tutelas@, a la persona del cliente (Colmédica / Aliansalud), con el Word de la respuesta adjunto
// («T 28379 Respuesta Aliansalud…», «T 28230 Cumplimiento…», «T 27981 Solicitud de aclaración…») y un texto como «Remito contestación de tutela con (10) anexos»,
// «Remito cumplimiento por EPS» o «Remito solicitud de aclaración por CMP». Los reenvíos «para su análisis de auditoría» NO llevan adjuntos ni se cuentan.
// Siglas: CMP = Colmédica · UMD / IPS = Unidad Médica y de Diagnóstico · EPS = Aliansalud.

const RE_NUM_ASUNTO = /(?:tutela|impugnaci[oó]n)s?\s*(?:no\.?|n[°º]|#)?\s*(\d{4,6})\b/i;
const RE_NUM_ADJUNTO = /^\s*T\s*(\d{4,6})\b/i;
const RE_ES_RESPUESTA = /contestaci[oó]n|cumplimiento|aclaraci[oó]n|respuesta|impugnaci[oó]n/i;

/** 'colmedica' | 'umd' | 'aliansalud' | null, a partir de un texto (siglas o nombre). */
export function entidadDeTexto(texto){
  const t = String(texto || '');
  if(/\bCMP\b|colm[eé]dica/i.test(t)) return 'colmedica';
  if(/\bUMD\b|\bIPS\b|unidad\s+m[eé]dica|diagn[oó]stico/i.test(t)) return 'umd';
  if(/\bEPS\b|aliansalud/i.test(t)) return 'aliansalud';
  return null;
}

/** De la lista de correos enviados ([{ asunto, fecha, vista, adjuntos:[nombre] }]) deja solo las contestaciones: [{ numero, entidad, fecha, tipo, asunto }]. */
export function contestacionesDeEnviados(mensajes){
  const salida = [];
  (mensajes || []).forEach(m => {
    const adjuntos = (m.adjuntos || []).map(String);
    const delFirma = adjuntos.find(a => RE_NUM_ADJUNTO.test(a));
    const numero = (RE_NUM_ASUNTO.exec(m.asunto || '') || [])[1] || (delFirma ? RE_NUM_ADJUNTO.exec(delFirma)[1] : null);
    if(!numero || !adjuntos.length) return;
    const texto = `${m.vista || ''} ${delFirma || ''}`;
    // Con el Word propio de la firma («T 12345 …») basta; sin él, el texto del correo tiene que decir que es una contestación/cumplimiento/aclaración.
    if(!delFirma && !RE_ES_RESPUESTA.test(texto)) return;
    const tipo = /cumplimiento/i.test(texto) ? 'Cumplimiento' : /aclaraci[oó]n/i.test(texto) ? 'Solicitud de aclaración' : /impugnaci[oó]n/i.test(texto) ? 'Impugnación' : 'Contestación';
    salida.push({ numero: String(Number(numero)), entidad: entidadDeTexto(`${delFirma || ''} ${m.vista || ''}`) || entidadDeTexto(m.asunto), fecha: m.fecha || '', tipo, asunto: m.asunto || '' });
  });
  return salida;
}

/** ¿La fila de Tutelas (por su Entidad/Cliente) es de esa entidad? Sin entidad reconocible en la fila, cualquier correo de ese número le sirve. */
function mismaEntidad(tutela, entidadCorreo){
  if(!entidadCorreo) return true;
  // El Cliente es quien distingue (Colmédica / Aliansalud / Unidad Médica); la Entidad dice «GRUPO COLMEDICA» en casi todas las filas, así que solo sirve si el Cliente no dice nada.
  const deFila = entidadDeTexto(tutela.Cliente) || entidadDeTexto(tutela.Entidad);
  return !deFila || deFila === entidadCorreo;
}

/** Map id de tutela → { fecha, tipo, asunto } con el envío más reciente que le corresponde. Las que no están en el mapa siguen por contestar. */
export function enviadasPorTutela(tutelas, contestaciones){
  const porNumero = new Map();
  (contestaciones || []).forEach(c => { if(!porNumero.has(c.numero)) porNumero.set(c.numero, []); porNumero.get(c.numero).push(c); });
  const mapa = new Map();
  (tutelas || []).forEach(t => {
    const candidatos = (porNumero.get(String(Number(t.NoTutela))) || []).filter(c => mismaEntidad(t, c.entidad));
    if(!candidatos.length) return;
    mapa.set(t.id, candidatos.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0]);
  });
  return mapa;
}
