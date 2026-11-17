// SAMAI (https://samai.consejodeestado.gov.co): la sede electrónica de la jurisdicción de lo contencioso administrativo (juzgados y tribunales administrativos y Consejo de Estado).
// Pedido del usuario (2026-11-17): «por tipo de proceso identifique su entidad a consultar, SAMAI por ejemplo administrativos». SAMAI no tiene API pública y sus páginas piden sesión,
// pero SÍ se puede llegar directo a un proceso con una dirección armada (probado 2026-11-17 con tres radicados reales):
//   · Proceso:     /Vistas/Casos/list_procesos.aspx?guid=<radicado de 23 dígitos><código de corporación>
//   · Expediente:  /PaginasTransversales/DocumentosExpediente.aspx?numproceso=<radicado>&corporacion=<código>
// El código de la corporación son los 7 primeros dígitos del radicado (p. ej. 1100133 Juzgado Administrativo de Bogotá, 2500023 Tribunal Administrativo de Cundinamarca) y es el de la
// corporación donde está el proceso AHORA: si subió en apelación al Consejo de Estado, el código es 1100103 (el mismo proceso con el código del Tribunal da «Sin resultados»).
// Los documentos que se ven en el expediente dependen del acceso de la cuenta de SAMAI (público, o sujeto procesal reconocido en ese proceso).
export const URL_SAMAI = 'https://samai.consejodeestado.gov.co/';
export const CORPORACION_CONSEJO_ESTADO = '1100103';

const soloDigitos = v => String(v || '').replace(/\D/g, '');

/** ¿Es un proceso de la jurisdicción de lo contencioso administrativo (se consulta en SAMAI)? Por el radicado (entidad 33 = juzgado administrativo, 23 = tribunal administrativo, 11001 03 = Consejo de Estado) o por el nombre del despacho. */
export function esContenciosoAdministrativo(radicado, despacho){
  const r = soloDigitos(radicado);
  if(/administrativ|consejo de estado/i.test(String(despacho || ''))) return true;
  if(r.length !== 23) return false;
  return ['33', '23'].includes(r.slice(5, 7)) || r.slice(0, 7) === CORPORACION_CONSEJO_ESTADO;
}

/** Código de la corporación de SAMAI: el Consejo de Estado si el despacho lo dice (proceso en apelación); si no, los 7 primeros dígitos del radicado. */
export function corporacionSamai(radicado, despacho){
  const r = soloDigitos(radicado);
  if(/consejo de estado/i.test(String(despacho || ''))) return CORPORACION_CONSEJO_ESTADO;
  return r.slice(0, 7);
}

/** Direcciones de SAMAI para un radicado de 23 dígitos, o null si no es de esa jurisdicción / no tiene 23 dígitos. `conCorporacion` fuerza otra corporación (p. ej. el Consejo de Estado). */
export function urlsSamai(radicado, despacho, conCorporacion){
  const r = soloDigitos(radicado);
  if(r.length !== 23 || !esContenciosoAdministrativo(r, despacho)) return null;
  const codigo = conCorporacion || corporacionSamai(r, despacho);
  return {
    codigo,
    esConsejoEstado: codigo === CORPORACION_CONSEJO_ESTADO,
    proceso: `${URL_SAMAI}Vistas/Casos/list_procesos.aspx?guid=${r}${codigo}`,
    expediente: `${URL_SAMAI}PaginasTransversales/DocumentosExpediente.aspx?numproceso=${r}&corporacion=${codigo}`,
  };
}

export function abrirEnSamai(url){ window.open(url, '_blank', 'noopener,noreferrer'); }

/** ¿Es de la jurisdicción ordinaria (civil, laboral, familia, penal, Corte Suprema…), o sea, de lo que se radica y consulta por SIUGJ? Es todo radicado de 23 dígitos que NO es de lo contencioso administrativo (ese va por SAMAI). */
export function esJurisdiccionOrdinaria(radicado, despacho){
  return soloDigitos(radicado).length === 23 && !esContenciosoAdministrativo(radicado, despacho);
}
