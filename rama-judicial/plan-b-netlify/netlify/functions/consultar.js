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
    let json = null;
    try { json = await res.json(); } catch (e) { /* sin cuerpo válido */ }
    return { json, codigo: res.status, falla: json === null ? 'respuesta no válida' : '' };
  } catch (e) {
    return { json: null, codigo: 0, falla: e.name === 'AbortError' ? 'tiempo agotado' : (e.cause && e.cause.code) || e.message };
  } finally {
    clearTimeout(t);
  }
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
  const radicado = String(entrada.radicado || '').replace(/\D+/g, '');
  if (radicado.length !== 23) return responder(400, { ok: false, error: 'El número de radicación debe tener 23 dígitos (el «No. completo» del proceso).' });
  const maxPaginas = Math.max(1, Math.min(6, parseInt(entrada.paginas, 10) || 3));

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
      for (let pg = 1; pg <= maxPaginas; pg++) {
        const r = await pedirRama('/Proceso/Actuaciones/' + id + '?pagina=' + pg);
        if (r.json === null || r.codigo >= 400 || !r.json.actuaciones) { if (pg === 1) item.error = 'No se pudieron leer las actuaciones' + (r.falla ? ' (' + r.falla + ')' : '') + '.'; break; }
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
