// Escrito con LexIA desde el portal (Plan A) — 2026-10-13. Hace lo mismo que el artefacto Plan B (elegir el modelo del despacho y redactar la
// contestación u otro escrito de la tutela) pero con el robot de cPanel (API de Claude) y pensando en gastar los menos créditos posibles:
//   · el modelo se elige con una llamada mínima del modelo barato (solo nombres de archivo) o a mano;
//   · Claude NO reescribe el escrito: recibe los párrafos del modelo y devuelve solo los cambios, que aquí se aplican sobre el .docx original
//     (el Word queda como el modelo: logo, formato, tablas);
//   · el caso y las instrucciones van en caché en el robot, así las correcciones siguientes salen mucho más baratas;
//   · cada respuesta trae los tokens usados, para comparar con el artefacto.
// La lista de modelos es el mismo archivo que usa el artefacto («ÍNDICE DE MODELOS LexIA.json», en la raíz de Tutelas → Documentos).
import { graphFetch, graphLeerTexto, graphDescargarArchivo, prepararCasoParaEscrito, guardarArchivoEnTutela } from './graph';
import { listarParrafosDeDocx, aplicarCambiosADocx } from './escritoDesdeModelo';

const DRIVE_MODELOS = 'b!ivuoBtvWBUW5XBsduyi1FAbmAArhk-NKj1sduiYR1cEzo_DP-TsFTYaX024lyb3L';
const NOMBRE_INDICE = 'ÍNDICE DE MODELOS LexIA.json';
const DIAS_VIGENCIA_INDICE = 7;
const OTRAS = '3. OTRAS ACTUACIONES';
const SEXO_CARPETA = { Mujer: '1. MUJER', Hombre: '2. HOMBRE' };

export const TIPOS_ESCRITO = {
  contestacion: { etiqueta: 'Contestación de la tutela', carpeta: '' },
  aclaracion: { etiqueta: 'Aclaración', carpeta: 'aclaraciones' },
  alcance: { etiqueta: 'Alcance a la contestación', carpeta: 'alcance' },
  impugnacion: { etiqueta: 'Impugnación del fallo', carpeta: 'impugnacion' },
  aplazamiento: { etiqueta: 'Aplazamiento', carpeta: 'aplazamientos' },
  cumplimiento: { etiqueta: 'Informe de cumplimiento', carpeta: 'cumplimientos' },
  nulidad: { etiqueta: 'Nulidad', carpeta: 'nulidad' },
  requerimiento: { etiqueta: 'Respuesta a requerimiento', carpeta: 'requerimientos' },
  modulacion: { etiqueta: 'Modulación', carpeta: 'modulacion' },
  correccion: { etiqueta: 'Corrección', carpeta: 'correccion' },
};
const TIPO_POR_RESPUESTA = { 'TUTELA': 'contestacion', 'ACLARACION': 'aclaracion', 'ALCANCE': 'alcance', 'IMPUGNACION': 'impugnacion', 'APLAZAMIENTO': 'aplazamiento', 'CUMPLIMIENTO FALLO': 'cumplimiento', 'CORRECION': 'correccion', 'CORRECCION': 'correccion', 'MODULACION': 'modulacion', 'NULIDAD': 'nulidad', 'REQUERIMIENTO': 'requerimiento' };
export function tipoEscritoDeRegistro(registro){
  return TIPO_POR_RESPUESTA[String((registro && registro.TipoRespuesta) || 'TUTELA').toUpperCase().trim()] || 'contestacion';
}

const normalizar = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function claveCliente(cliente){
  const c = normalizar(cliente);
  if(c.includes('aliansalud')) return 'aliansalud';
  if(c.includes('colm')) return 'colmedica';
  if(c.includes('unidad') || c.includes('umd')) return 'umd';
  return '';
}
function subcarpetaCoincide(nombre, clave){
  const n = normalizar(nombre);
  const patrones = { aliansalud: ['aliansalud'], colmedica: ['colmedica', 'colm'], umd: ['umd', 'unidad medica', 'unidad'] }[clave] || [];
  return patrones.some(p => n.includes(p));
}

// Mujer u hombre a partir del nombre de pila (el abogado puede cambiarlo): evita una llamada a la IA solo para esto.
const NOMBRES_M_TERMINADOS_EN_A = ['luca', 'elias', 'josua', 'joshua', 'nicolas', 'jonas', 'mathias', 'matias', 'tomas', 'andres', 'jesus'];
const NOMBRES_F_NO_TERMINADOS_EN_A = ['carmen', 'mercedes', 'ruth', 'raquel', 'isabel', 'beatriz', 'luz', 'miriam', 'ingrid', 'esther', 'yaneth', 'edith', 'dolores', 'consuelo', 'rocio', 'pilar', 'ines', 'maribel', 'karen', 'jennifer', 'ivonne', 'yurani', 'yuri', 'nury', 'nancy', 'gladys', 'sol', 'soledad'];
export function sexoPorNombre(nombreCompleto){
  const p = normalizar(nombreCompleto).trim().split(/\s+/)[0] || '';
  if(NOMBRES_F_NO_TERMINADOS_EN_A.includes(p)) return 'Mujer';
  if(NOMBRES_M_TERMINADOS_EN_A.includes(p)) return 'Hombre';
  return p.endsWith('a') ? 'Mujer' : 'Hombre';
}

// ---------------------------------------------------------------- lista (índice) de modelos
function esDocx(h){ return h.file && /\.docx?$/i.test(h.name || '') && !/^~\$/.test(h.name || ''); }
async function hijosGraph(driveId, rutaOId, porId){
  const base = porId ? `/drives/${driveId}/items/${rutaOId}/children` : `/drives/${driveId}/root:/${encodeURIComponent(rutaOId).replace(/%2F/g, '/')}:/children`;
  let url = `${base}?$top=200&$select=id,name,folder,file`;
  const salida = [];
  for(let i = 0; i < 10 && url; i++){
    const res = await graphFetch(url);
    salida.push(...(res.value || []));
    url = res['@odata.nextLink'] || '';
  }
  return salida;
}
async function recorrer(driveId, raiz, id, prefijo, nivel, entradas, pool){
  const hijos = await pool(() => hijosGraph(driveId, id, true));
  const subs = [];
  for(const h of hijos){
    if(esDocx(h)) entradas.push({ c: raiz, s: prefijo, n: h.name, u: `file:///${driveId}/${h.id}` });
    else if(h.folder && nivel < 4) subs.push(recorrer(driveId, raiz, h.id, prefijo ? prefijo + '/' + h.name : h.name, nivel + 1, entradas, pool));
  }
  await Promise.all(subs);
}
function crearPool(max){
  let activos = 0; const cola = [];
  return fn => new Promise((resolve, reject) => {
    const correr = async () => { activos++; try{ resolve(await fn()); }catch(e){ reject(e); } finally{ activos--; const s = cola.shift(); if(s) s(); } };
    if(activos < max) correr(); else cola.push(correr);
  });
}
async function construirIndice(){
  const entradas = [];
  const pool = crearPool(6);
  for(const nombre of ['1. MUJER', '2. HOMBRE', OTRAS]){
    const base = await graphFetch(`/drives/${DRIVE_MODELOS}/root:/${encodeURIComponent(nombre)}`).catch(() => null);
    if(!base?.id) continue;
    await recorrer(DRIVE_MODELOS, nombre, base.id, '', 0, entradas, pool);
  }
  if(!entradas.length) throw new Error('No encontré modelos en las carpetas «1. MUJER», «2. HOMBRE» y «3. OTRAS ACTUACIONES» de Tutelas → Documentos.');
  const indice = { version: 1, generado: new Date().toISOString(), entradas };
  try{
    await graphFetch(`/drives/${DRIVE_MODELOS}/root:/${encodeURIComponent(NOMBRE_INDICE)}:/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(indice) });
  }catch(err){ console.error('No se pudo guardar la lista de modelos:', err); }
  return indice;
}
let indiceMemoria = null;
export async function obtenerIndiceModelos(forzar = false, log = () => {}){
  const vigente = i => i && Array.isArray(i.entradas) && i.entradas.length && (Date.now() - new Date(i.generado).getTime()) < DIAS_VIGENCIA_INDICE * 86400000;
  if(!forzar && vigente(indiceMemoria)) return indiceMemoria;
  if(!forzar){
    try{
      const txt = await graphLeerTexto(`/drives/${DRIVE_MODELOS}/root:/${encodeURIComponent(NOMBRE_INDICE)}:/content`);
      const ind = txt ? JSON.parse(txt) : null;
      if(vigente(ind)){ indiceMemoria = ind; return ind; }
    }catch(err){ /* no existe o no se pudo leer: se arma */ }
  }
  log('Armando la lista de modelos del despacho (una vez; la comparte el artefacto)...');
  indiceMemoria = await construirIndice();
  return indiceMemoria;
}
export function modelosDelIndice(indice, tipo, sexo, cliente){
  const info = TIPOS_ESCRITO[tipo] || TIPOS_ESCRITO.contestacion;
  let sel;
  if(tipo === 'contestacion'){
    sel = indice.entradas.filter(e => e.c === SEXO_CARPETA[sexo] && e.s && subcarpetaCoincide(e.s.split('/')[0], cliente));
  }else{
    sel = indice.entradas.filter(e => e.c === OTRAS && (!e.s || normalizar(e.s.split('/')[0]).includes(info.carpeta)));
  }
  return sel.map(e => ({ nombre: e.n, ruta: (e.s ? e.s + '/' : '') + e.n, uri: e.u, ficha: e.f || '' }));
}

// ---------------------------------------------------------------- robot
async function llamarRobot(url, cuerpo){
  if(!url) throw new Error('Falta la dirección del robot (ROBOT_ESCRITO_URL en config.js).');
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  let data;
  try{ data = await res.json(); }catch{ throw new Error(`El robot de escritos no respondió bien (${res.status}). ¿Ya subiste redactar-escrito.php a cPanel?`); }
  if(!res.ok || data.error) throw new Error(data.error || `El robot de escritos falló (${res.status}).`);
  return data;
}
// Los párrafos muy largos (citas, argumentos) se abrevian: Claude casi siempre solo decide si se quedan, se quitan o cambia un dato puntual.
function parrafosParaRobot(parrafos){
  return parrafos.map(p => p.t.length > 700
    ? { n: p.n, t: p.t.slice(0, 380) + ' […] ' + p.t.slice(-120), largo: true, total: p.t.length }
    : { n: p.n, t: p.t });
}
function fechaLarga(){ return new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }); }
function nombreCortoCliente(cliente){ return { aliansalud: 'ALIANSALUD', colmedica: 'COLMEDICA', umd: 'UMD' }[claveCliente(cliente)] || String(cliente || '').slice(0, 20); }

/**
 * Elige el modelo (o usa el manual) y redacta el escrito sobre el .docx original.
 * @returns {{ bytes, nombre, alertas, usos, avisos, resumen, modelo, caso }}
 */
export async function redactarEscritoConRobot({ robotUrl, urlCarpeta, numero, tipo, indiceRegistro = 0, sexo, nota = '', modeloManual = null, lecciones = '', log = () => {} }){
  log('Leyendo la lectura de la tutela...');
  const caso = await prepararCasoParaEscrito(urlCarpeta, numero);
  if(!caso) throw new Error('Esta tutela todavía no tiene «Lectura LexIA.txt»: primero extráela con LexIA.');
  const registro = caso.registros[indiceRegistro] || caso.registros[0] || {};
  const cliente = claveCliente(registro.Cliente);
  if(!cliente) throw new Error('No reconozco el cliente de la tutela (' + (registro.Cliente || 'sin cliente') + ').');
  const usos = [];

  if(!lecciones){ lecciones = leccionesParaPrompt(await leerLecciones(), tipo, cliente); if(lecciones) log('Aplico las lecciones que el despacho le ha enseñado.'); }
  log('Cargando la lista de modelos...');
  const indice = await obtenerIndiceModelos(false, log);
  const modelos = modelosDelIndice(indice, tipo, sexo, cliente);
  if(!modelos.length) throw new Error('No encontré modelos para ese escrito, cliente y sexo en la lista (prueba «Actualizar la lista de modelos»).');

  let elegido = modeloManual && modelos.find(m => m.ruta === modeloManual);
  if(elegido){
    // Lo elegido a mano se recuerda para este cliente + Tema + escrito: la próxima vez se usa sin preguntarle a Claude.
    guardarPreferenciaModelo({ cliente, tipo, tema: registro.Tema, modelo: elegido }).then(() => log('Anotado: la próxima vez, para este cliente y Tema, usaré este modelo sin preguntarle a LexIA.')).catch(() => {});
  }else{
    const prefs = await leerPreferencias();
    const p = prefs[clavePreferencia(cliente, tipo, registro.Tema)];
    const habitual = p && modelos.find(m => m.ruta === p.ruta);
    if(habitual){ elegido = habitual; log('Uso tu modelo habitual para este cliente y Tema: ' + habitual.ruta + ' (lo elegiste a mano antes; si prefieres otro, escógelo en la lista «Modelo del despacho»).'); }
  }
  if(!elegido){
    log('Eligiendo el mejor modelo entre ' + modelos.length + '...');
    const r = await llamarRobot(robotUrl, {
      modo: 'elegir', modelos: modelos.map(m => m.ficha ? m.ruta + ' — ' + m.ficha : m.ruta),
      caso: { cliente: registro.Cliente, tipoRespuesta: registro.TipoRespuesta, prestacion: registro.Prestacion, tema: registro.Tema, solicita: registro.Solicita, analisis: registro.Analisis || {}, escritoNecesario: TIPOS_ESCRITO[tipo].etiqueta, nota: String(nota).slice(0, 2000), accionante: sexo },
    });
    usos.push({ paso: 'Elegir el modelo', ...r.uso });
    elegido = modelos[r.indice];
    log('Modelo elegido: ' + elegido.ruta + (r.motivo ? ' — ' + r.motivo : ''));
  }

  log('Bajando el modelo de SharePoint...');
  const m = /^file:\/\/\/([^/]+)\/(.+)$/.exec(elegido.uri);
  if(!m) throw new Error('No pude identificar el archivo del modelo.');
  const { bytes } = await graphDescargarArchivo(m[1], m[2]);
  const parrafos = await listarParrafosDeDocx(bytes);

  log('Redactando (LexIA devuelve solo los cambios)...');
  const r = await llamarRobot(robotUrl, {
    modo: 'redactar', tipoEscrito: TIPOS_ESCRITO[tipo].etiqueta, hoy: fechaLarga(), caso: caso.textoCaso, correos: caso.correosResumen,
    nota, lecciones, parrafos: parrafosParaRobot(parrafos),
  });
  usos.push({ paso: 'Redactar', ...r.uso });
  const aplicado = await aplicarCambiosADocx(bytes, r);
  const nombre = `${TIPOS_ESCRITO[tipo].etiqueta} - ${nombreCortoCliente(registro.Cliente)} - borrador LexIA.docx`.replace(/[\\/:*?"<>|]/g, ' ');
  log('Guardando en la carpeta de la tutela...');
  await guardarArchivoEnTutela(urlCarpeta, numero, nombre, aplicado.bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').catch(err => aplicado.avisos.push('No pude guardar el Word en la carpeta de la tutela: ' + (err.message || err)));
  return { bytes: aplicado.bytes, nombre, cliente, lecciones, alertas: r.alertas || '', usos, avisos: aplicado.avisos, resumen: aplicado.resumen, modelo: elegido.ruta, tipo, numero, urlCarpeta, robotUrl, caso: { textoCaso: caso.textoCaso, correos: caso.correosResumen }, modelos };
}

/** Corrige el borrador actual con una instrucción del abogado («Enséñame»). Reusa el caché del robot (el caso es el mismo). */
export async function corregirEscritoConRobot({ estado, instruccion, nota = '', lecciones = '', log = () => {} }){
  log('Aplicando la corrección...');
  const parrafos = await listarParrafosDeDocx(estado.bytes);
  const r = await llamarRobot(estado.robotUrl, {
    modo: 'corregir', tipoEscrito: TIPOS_ESCRITO[estado.tipo].etiqueta, hoy: fechaLarga(), caso: estado.caso.textoCaso, correos: estado.caso.correos,
    nota, lecciones, instruccion, parrafos: parrafosParaRobot(parrafos),
  });
  const aplicado = await aplicarCambiosADocx(estado.bytes, r);
  await guardarArchivoEnTutela(estado.urlCarpeta, estado.numero, estado.nombre, aplicado.bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').catch(() => {});
  return { bytes: aplicado.bytes, alertas: r.alertas || '', leccion: r.leccion || null, uso: { paso: 'Corrección', ...r.uso }, avisos: aplicado.avisos, resumen: aplicado.resumen };
}

// ---------------------------------------------------------------- lecciones («Enséñame»)
// Se guardan en un archivo de Tutelas → Documentos (compartido por todos los que usan el portal).
const NOMBRE_LECCIONES = 'LECCIONES LexIA.json';
export async function leerLecciones(){
  try{
    const txt = await graphLeerTexto(`/drives/${DRIVE_MODELOS}/root:/${encodeURIComponent(NOMBRE_LECCIONES)}:/content`);
    const d = txt ? JSON.parse(txt) : null;
    return d && Array.isArray(d.lecciones) ? d.lecciones : [];
  }catch{ return []; }
}
export async function guardarLeccion({ regla, alcance, tipo, cliente }){
  const lecciones = await leerLecciones();
  lecciones.push({ texto: String(regla).trim().slice(0, 1200), alcance: alcance || 'todos', tipo: alcance === 'tipo' ? tipo : '', cliente: alcance === 'cliente' ? cliente : '', fecha: new Date().toISOString() });
  await graphFetch(`/drives/${DRIVE_MODELOS}/root:/${encodeURIComponent(NOMBRE_LECCIONES)}:/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, lecciones }) });
  return lecciones;
}
export function leccionesParaPrompt(lecciones, tipo, cliente){
  return (lecciones || [])
    .filter(l => (l.alcance || 'todos') === 'todos' || (l.alcance === 'tipo' && l.tipo === tipo) || (l.alcance === 'cliente' && l.cliente === cliente))
    .slice(-40).map((l, i) => `${i + 1}. ${l.texto}`).join('\n').slice(0, 6000);
}

// ---------------------------------------------------------------- modelo habitual (cliente + Tema + escrito)
const NOMBRE_PREFERENCIAS = 'PREFERENCIAS DE MODELO LexIA.json';
export function clavePreferencia(cliente, tipo, tema){
  return (String(cliente || '') + '_' + String(tipo || '') + '_' + normalizar(tema || '').replace(/[^a-z0-9]+/g, '_')).slice(0, 140);
}
export async function leerPreferencias(){
  try{
    const txt = await graphLeerTexto(`/drives/${DRIVE_MODELOS}/root:/${encodeURIComponent(NOMBRE_PREFERENCIAS)}:/content`);
    const d = txt ? JSON.parse(txt) : null;
    return d && d.preferencias && typeof d.preferencias === 'object' ? d.preferencias : {};
  }catch{ return {}; }
}
export async function guardarPreferenciaModelo({ cliente, tipo, tema, modelo }){
  const prefs = await leerPreferencias();
  prefs[clavePreferencia(cliente, tipo, tema)] = { ruta: modelo.ruta, nombre: modelo.nombre, uri: modelo.uri, cliente, tipo, tema: String(tema || ''), fecha: new Date().toISOString() };
  await graphFetch(`/drives/${DRIVE_MODELOS}/root:/${encodeURIComponent(NOMBRE_PREFERENCIAS)}:/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, preferencias: prefs }) });
}

// ---------------------------------------------------------------- fichas de los modelos (una vez por modelo)
// Para elegir mejor que solo por el nombre del archivo: un modelo barato lee el comienzo y los títulos de cada modelo y escribe una ficha de
// 2 líneas, que se guarda en la lista de modelos compartida (campo «f»). Cuesta una sola vez por modelo.
function resumenParaFicha(parrafos){
  const titulos = parrafos.filter(p => p.t.length < 130 && !/^(REF|RAD|ACCIONANTE|ACCIONADA)\s*:/i.test(p.t) && (/^\d+(\.\d+)*\.?\s+\S/.test(p.t) || (p.t === p.t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{4,}/.test(p.t)))).map(p => p.t);
  // Después de «2. SOBRE LAS PRETENSIONES» empieza la defensa (antes hay una introducción igual en todos los modelos): de ahí se toman los primeros argumentos.
  const iDefensa = parrafos.findIndex(p => /^2\.?\s*sobre las pretensiones/i.test(p.t));
  const desde = iDefensa >= 0 ? iDefensa + 1 : Math.max(0, parrafos.findIndex(p => /^respetado/i.test(p.t)) + 1);
  const cuerpo = parrafos.slice(desde).filter(p => p.t.length > 150).slice(0, 3).map(p => p.t.slice(0, 380));
  return ('TÍTULOS: ' + titulos.slice(0, 24).join(' | ') + '\nARGUMENTOS: ' + cuerpo.join('\n')).slice(0, 1900);
}
async function guardarIndice(ind){
  await graphFetch(`/drives/${DRIVE_MODELOS}/root:/${encodeURIComponent(NOMBRE_INDICE)}:/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ind) });
}
/**
 * Crea la ficha de los modelos que todavía no la tienen (de la lista dada). Guarda el avance cada lote, así se puede interrumpir y seguir.
 * @returns {{ nuevas:number, pendientes:number, uso:{entrada,salida} }}
 */
export async function generarFichasDeModelos({ robotUrl, modelos, log = () => {} }){
  const ind = await obtenerIndiceModelos(false, log);
  const porUri = new Map(ind.entradas.map(e => [e.u, e]));
  const pendientes = modelos.filter(m => { const e = porUri.get(m.uri); return e && !e.f; });
  const uso = { entrada: 0, salida: 0 };
  let nuevas = 0;
  const TAM_LOTE = 6;
  for(let i = 0; i < pendientes.length; i += TAM_LOTE){
    const lote = pendientes.slice(i, i + TAM_LOTE);
    log('Leyendo y describiendo los modelos ' + (i + 1) + ' a ' + (i + lote.length) + ' de ' + pendientes.length + '...');
    const textos = await Promise.all(lote.map(async (m, k) => {
      try{
        const x = /^file:\/\/\/([^/]+)\/(.+)$/.exec(m.uri);
        const { bytes } = await graphDescargarArchivo(x[1], x[2]);
        return { i: k, ruta: m.ruta, texto: resumenParaFicha(await listarParrafosDeDocx(bytes)) };
      }catch(err){ return null; }
    }));
    const validos = textos.filter(Boolean);
    if(!validos.length) continue;
    const r = await llamarRobot(robotUrl, { modo: 'fichas', modelos: validos });
    uso.entrada += r.uso?.entrada || 0; uso.salida += r.uso?.salida || 0;
    for(const f of r.fichas || []){
      const m = lote[f.i];
      const e = m && porUri.get(m.uri);
      if(e){ e.f = String(f.ficha).slice(0, 400); nuevas++; }
    }
    await guardarIndice(ind);
  }
  indiceMemoria = ind;
  return { nuevas, pendientes: pendientes.length - nuevas, uso };
}
