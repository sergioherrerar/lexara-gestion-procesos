// «Solicitud de propuesta» (2026-11-27, pedido del usuario): un cliente le escribe a Gerencia pidiendo una propuesta de honorarios (p. ej. Aliansalud, 23-nov: «Solicitud de Propuesta de honorarios – Demanda proceso
// monitorio IDU contra Aliansalud EPS»). Aquí se RECONOCE ese correo y se sacan de él los datos para llenar la propuesta (quién la pidió, su cargo, a quién va, el proceso y las partes). La propuesta se responde
// en el MISMO hilo. Funciones puras, sin red; los datos extraídos son una ayuda: la persona los revisa y los corrige.
const sinTildes = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const limpiar = s => String(s || '').replace(/\s+/g, ' ').replace(/^[\s,;:.\-–]+|[\s,;:\-–]+$/g, '').trim();

/** ¿El correo pide una propuesta de honorarios o de servicios? (de alguien de afuera, no de nuestro propio equipo) */
export function esSolicitudDePropuesta(asunto, vista, remitente){
  if(/@lexaraabogados\.com$/i.test(String(remitente || '').trim())) return false;
  const a = sinTildes(asunto), t = a + ' ' + sinTildes(vista);
  if(/^(re|rv|fw|fwd)\s*:\s*(aprobacion|aceptacion)/.test(a) || /^(aprobacion|aceptacion)/.test(a)) return false;   // las respuestas de aprobación no son solicitudes
  return /solicitud de (una )?(propuesta|cotizacion)|solicit\w+ (tu |su |la )?(amable )?(colaboracion con )?(una )?propuesta (de )?(honorarios|servicios)|propuesta de (honorarios|servicios profesionales)|cotizacion de honorarios/.test(t);
}

const ENTIDADES_POR_DOMINIO = [
  [/aliansalud\.com\.co$/i, { entidad: 'ALIANSALUD EPS', corta: 'la EPS' }],
  [/colmedica\.com$/i, { entidad: 'COLMÉDICA', corta: 'la compañía' }],
  [/umd\.com\.co$/i, { entidad: 'UMD', corta: 'la compañía' }],
  [/sos\.com\.co$/i, { entidad: 'SERVICIO OCCIDENTAL DE SALUD EPS', corta: 'la EPS' }],
  [/famisanar\.com\.co$/i, { entidad: 'FAMISANAR EPS', corta: 'la EPS' }],
];
function entidadDeCorreo(correo){
  const dom = String(correo || '').split('@')[1] || '';
  const conocida = ENTIDADES_POR_DOMINIO.find(([re]) => re.test(dom));
  if(conocida) return conocida[1];
  const nucleo = dom.split('.')[0] || '';
  return { entidad: nucleo ? nucleo.toUpperCase() : '', corta: 'la entidad' };
}

/**
 * Datos para llenar la propuesta, a partir del correo de solicitud.
 * entrada: { asunto, texto (cuerpo en texto plano, con el hilo citado), remitente (correo), remitenteNombre, cc: [correos] }
 * salida: { atteNombre, atteCargo, tratamiento, correoPara, cc, entidad, entidadCorta, tipoProceso, numeroProceso, demandante, demandado, rol, asuntoProceso }
 */
export function extraerDatosSolicitud({ asunto, texto, remitente, remitenteNombre, cc }){
  const t = String(texto || '').replace(/\r/g, '');
  // lo que escribió quien pide: hasta donde empieza el hilo citado («De: …»)
  const propio = t.split(/\n\s*(?:De|From)\s*:\s/)[0];
  const tratamiento = /respetad[oa]s?\s+doctora/i.test(propio) ? 'Dra.' : /respetad[oa]s?\s+doctor\b/i.test(propio) ? 'Dr.' : 'Señores';

  // firma: las dos líneas que siguen a «Cordialmente» (nombre y cargo)
  let atteNombre = '', atteCargo = '';
  const cord = /cordialmente[,.]?\s*\n+([^\n]+)\n+([^\n]+)/i.exec(propio);
  if(cord){
    atteNombre = limpiar(cord[1]).replace(/\.+$/, '');
    const cargo = limpiar(cord[2]);
    if(!/^(https?:|www\.|tel|cel|\+?\d)|\.com/i.test(cargo)) atteCargo = cargo;
  }
  if(!atteNombre || atteNombre.length > 70) atteNombre = limpiar(String(remitenteNombre || '').replace(/\s*[-–]\s*(aliansalud|colm[eé]dica|umd|sos|famisanar)\s*$/i, ''));

  const { entidad, corta } = entidadDeCorreo(remitente);

  // el proceso: tabla «Referencia / Demandante / Demandada» del correo original (suele ir en el hilo citado) o, si no, el asunto
  const campo = re => { const m = re.exec(t); return m ? limpiar(m[1]) : ''; };
  const referencia = campo(/referencia\s*:\s*([^\n]+)/i);
  let demandante = campo(/demandante\s*:\s*([^\n]+)/i);
  let demandado = campo(/demandad[oa]\s*:\s*([^\n]+)/i);
  const asuntoProceso = limpiar(String(asunto || '').replace(/^\s*((re|rv|fw|fwd)\s*:\s*)+/i, '').replace(/^solicitud de (una )?propuesta( de honorarios| de servicios)?\s*[-–:]?\s*/i, ''));
  if((!demandante || !demandado)){
    const m = /\b(?:demanda|proceso)[^–\-]*?\s(.+?)\s+contra\s+(.+)$/i.exec(asuntoProceso);
    if(m){ if(!demandante) demandante = limpiar(m[1]); if(!demandado) demandado = limpiar(m[2]); }
  }
  let tipoProceso = '';
  if(referencia){
    tipoProceso = limpiar(referencia.replace(/\(.*$/, '').replace(/^proceso\s+/i, '')).toUpperCase();
  }else if(/monitorio/i.test(asuntoProceso)) tipoProceso = 'MONITORIO DEL TRABAJO Y LA SEGURIDAD SOCIAL';
  const radicados = t.match(/\b\d{23}\b/g) || [];
  const numeroProceso = radicados.length === 1 ? radicados[0] : '';
  const nombreEntidad = sinTildes(entidad.split(' ')[0]);
  const rol = demandado && nombreEntidad && sinTildes(demandado).includes(nombreEntidad) ? 'parte demandada' : (demandante && nombreEntidad && sinTildes(demandante).includes(nombreEntidad) ? 'parte demandante' : 'parte demandada');
  return {
    atteNombre, atteCargo, tratamiento, correoPara: String(remitente || '').trim(), cc: (cc || []).filter(Boolean),
    entidad, entidadCorta: corta, tipoProceso, numeroProceso, demandante, demandado, rol, asuntoProceso,
  };
}
