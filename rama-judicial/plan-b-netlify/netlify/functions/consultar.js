// Plan B de la consulta a la Rama Judicial (2026-11-13): hace lo mismo que rama-judicial/consultar.php, pero corre en Netlify (gratis) para cuando el
// hosting del sitio no deja salir por el puerto 448, que es el único por el que la Rama entrega los datos. La app solo cambia RAMA_JUDICIAL_URL.
// Entrada (POST, JSON): { "radicado": "25000232600020090110201", "paginas": 3 }  ·  Salida: la misma que consultar.php.
// Fuente: Consulta Nacional Unificada de la Rama Judicial (pública, sin usuario ni contraseña). No guarda nada.

const RAMA_BASE = 'https://consultaprocesos.ramajudicial.gov.co:448/api/v2';
const ORIGENES = ['https://sergioherrerar.github.io', 'https://www.lexaraabogados.com', 'http://localhost:5678', 'http://localhost:5173'];

function cabeceras(origen) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  if (ORIGENES.includes(origen)) h['Access-Control-Allow-Origin'] = origen;
  return h;
}

async function pedirRama(ruta) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(RAMA_BASE + ruta, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; LexaraConsulta/1.0)' }, signal: ctl.signal });
    const texto = await res.text();
    let json = null;
    try { json = JSON.parse(texto); } catch (e) { /* sin cuerpo válido */ }
    // Si la Rama no devuelve datos (bloqueo, error de página…) se informa el código y el comienzo de lo que contestó, para poder diagnosticarlo.
    const resumen = String(texto).replace(/<[^>]*>/g, ' ').replace(/s+/g, ' ').trim().slice(0, 160);
    return { json, codigo: res.status, falla: json === null ? 'respuesta no válida, código ' + res.status + (resumen ? ': «' + resumen + '»' : '') : '' };
  } catch (e) {
    return { json: null, codigo: 0, falla: e.name === 'AbortError' ? 'tiempo agotado' : (e.cause && e.cause.code) || e.message };
  } finally {
    clearTimeout(t);
  }
}

// La Rama a veces falla en una de varias consultas seguidas: para el detalle se reintenta (hasta 3 veces) cada una, de a una.
async function pedirConReintento(ruta, intentos = 3) {
  let r = null;
  for (let i = 0; i < intentos; i++) {
    r = await pedirRama(ruta);
    if (r.json !== null && r.codigo < 500) return r;
    await new Promise(res => setTimeout(res, 350 * (i + 1)));
  }
  return r;
}

exports.handler = async (event) => {
  const origen = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const H = cabeceras(origen);
  const responder = (codigo, datos) => ({ statusCode: codigo, headers: H, body: JSON.stringify(datos) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return responder(405, { ok: false, error: 'Método no permitido.' });

  let entrada = null;
  try { entrada = JSON.parse(event.body || ''); } catch (e) { /* inválida */ }
  if (!entrada || typeof entrada !== 'object') return responder(400, { ok: false, error: 'Solicitud inválida.' });
  // Detalle completo (2026-11-14): { "idProceso": N } → datos del proceso (ponente, tipo y clase, ubicación del expediente…), sujetos procesales y documentos.
  if (entrada.idProceso) {
    const id = parseInt(entrada.idProceso, 10);
    if (!id) return responder(400, { ok: false, error: 'idProceso inválido.' });
    const det = await pedirConReintento('/Proceso/Detalle/' + id);
    const suj = await pedirConReintento('/Proceso/Sujetos/' + id + '?pagina=1');
    const doc = await pedirConReintento('/Proceso/Documentos/' + id);
    let sujetos = suj.json && Array.isArray(suj.json.sujetos) ? suj.json.sujetos : [];
    const paginas = suj.json && suj.json.paginacion ? parseInt(suj.json.paginacion.cantidadPaginas, 10) || 1 : 1;
    for (let pg = 2; pg <= Math.min(paginas, 6); pg++) {
      const m = await pedirConReintento('/Proceso/Sujetos/' + id + '?pagina=' + pg);
      if (m.json && Array.isArray(m.json.sujetos)) sujetos = sujetos.concat(m.json.sujetos);
    }
    if (det.json === null && suj.json === null && doc.json === null) return responder(502, { ok: false, error: 'La Rama Judicial no respondió el detalle del proceso (' + (det.falla || 'sin respuesta') + '). Intente de nuevo en unos minutos.' });
    const d = det.json || {};
    return responder(200, {
      ok: true,
      errores: { detalle: det.json === null, sujetos: suj.json === null, documentos: doc.json === null },
      detalle: det.json ? { despacho: d.despacho || '', ponente: d.ponente || '', tipoProceso: d.tipoProceso || '', claseProceso: d.claseProceso || '', subclaseProceso: d.subclaseProceso || '', recurso: d.recurso || '', ubicacion: d.ubicacion || '', contenidoRadicacion: d.contenidoRadicacion || '', fechaProceso: d.fechaProceso || null, ultimaActualizacion: d.ultimaActualizacion || null } : null,
      sujetos: sujetos.map(s => ({ tipo: s.tipoSujeto || '', nombre: s.nombreRazonSocial || '', identificacion: s.identificacion || '', emplazado: !!s.esEmplazado })),
      documentos: Array.isArray(doc.json) ? doc.json.map(x => ({ nombre: x.nombre || '', descripcion: x.descripcion || '', tipo: x.tipo || '', fechaCarga: x.fechaCarga || null, consecutivo: x.consActuacion ?? null })) : [],
    });
  }
  // Modo lote (2026-11-13, novedades de la campana): { "radicados": [...hasta 20] } → solo la fecha de la última actuación de cada uno (una consulta por radicado).
  if (Array.isArray(entrada.radicados)) {
    const lista = [...new Set(entrada.radicados.map(r => String(r || '').replace(/\D+/g, '')).filter(r => r.length === 23))].slice(0, 20);
    const resultados = {};
    let i = 0;
    const trabajador = async () => {
      while (i < lista.length) {
        const rad = lista[i++];
        const r = await pedirRama('/Procesos/Consulta/NumeroRadicacion?numero=' + rad + '&SoloActivos=false&pagina=1');
        if (r.json === null || r.codigo >= 400 || !r.json.procesos) { resultados[rad] = { ok: false, error: r.falla || 'código ' + r.codigo }; continue; }
        const p = r.json.procesos[0];
        resultados[rad] = p
          ? { ok: true, idProceso: p.idProceso || null, despacho: String(p.despacho || '').trim(), fechaUltimaActuacion: p.fechaUltimaActuacion || null, esPrivado: !!p.esPrivado }
          : { ok: true, sinProceso: true };
      }
    };
    await Promise.all([trabajador(), trabajador(), trabajador(), trabajador()]);
    return responder(200, { ok: true, resultados });
  }
  const radicado = String(entrada.radicado || '').replace(/\D+/g, '');
  if (radicado.length !== 23) return responder(400, { ok: false, error: 'El número de radicación debe tener 23 dígitos (el «No. completo» del proceso).' });
  const maxPaginas = Math.max(1, Math.min(10, parseInt(entrada.paginas, 10) || 3));
  const desde = Math.max(1, parseInt(entrada.desde, 10) || 1);   // página inicial: así la app va pidiendo el resto de las actuaciones por tandas

  const lista = await pedirRama('/Procesos/Consulta/NumeroRadicacion?numero=' + radicado + '&SoloActivos=false&pagina=1');
  if (lista.json === null || lista.codigo >= 400 || !lista.json.procesos) {
    return responder(502, { ok: false, error: 'La Rama Judicial no respondió la consulta (' + (lista.falla || 'código ' + lista.codigo) + '). Intente de nuevo en unos minutos.' });
  }

  const salida = [];
  for (const p of lista.json.procesos.slice(0, 3)) {
    const id = p.idProceso || null;
    const item = {
      idProceso: id, llaveProceso: p.llaveProceso || radicado, despacho: String(p.despacho || '').trim(), departamento: p.departamento || '',
      sujetos: p.sujetosProcesales || '', fechaProceso: p.fechaProceso || null, fechaUltimaActuacion: p.fechaUltimaActuacion || null,
      esPrivado: !!p.esPrivado, totalActuaciones: 0, actuaciones: [],
    };
    if (id && !p.esPrivado) {
      for (let pg = desde; pg < desde + maxPaginas; pg++) {
        const r = await pedirRama('/Proceso/Actuaciones/' + id + '?pagina=' + pg);
        if (r.json === null || r.codigo >= 400 || !r.json.actuaciones) { if (pg === desde) item.error = 'No se pudieron leer las actuaciones' + (r.falla ? ' (' + r.falla + ')' : '') + '.'; break; }
        for (const a of r.json.actuaciones) {
          item.actuaciones.push({
            consecutivo: a.consActuacion ?? null, fecha: a.fechaActuacion ?? null, registro: a.fechaRegistro ?? null,
            actuacion: String(a.actuacion || '').trim(), anotacion: String(a.anotacion || '').trim(),
            fechaInicial: a.fechaInicial ?? null, fechaFinal: a.fechaFinal ?? null, conDocumentos: !!a.conDocumentos,
          });
          if (a.cant) item.totalActuaciones = parseInt(a.cant, 10);
        }
        if (r.json.actuaciones.length === 0) break;
        if (item.totalActuaciones && item.actuaciones.length >= item.totalActuaciones) break;
      }
      if (!item.totalActuaciones) item.totalActuaciones = item.actuaciones.length;
    }
    salida.push(item);
  }
  return responder(200, { ok: true, radicado, consultadoEn: new Date().toISOString(), procesos: salida });
};
