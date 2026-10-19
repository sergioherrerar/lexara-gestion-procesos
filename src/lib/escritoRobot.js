// Escrito con LexIA desde el portal (Plan A) — 2026-10-13. Hace lo mismo que el artefacto Plan B (elegir el modelo del despacho y redactar la
// contestación u otro escrito de la tutela) pero con el robot de cPanel (API de Claude) y pensando en gastar los menos créditos posibles:
//   · el modelo se elige con una llamada mínima del modelo barato (solo nombres de archivo) o a mano;
//   · Claude NO reescribe el escrito: recibe los párrafos del modelo y devuelve solo los cambios, que aquí se aplican sobre el .docx original
//     (el Word queda como el modelo: logo, formato, tablas);
//   · el caso y las instrucciones van en caché en el robot, así las correcciones siguientes salen mucho más baratas;
//   · cada respuesta trae los tokens usados, para comparar con el artefacto.
// La lista de modelos es el mismo archivo que usa el artefacto («ÍNDICE DE MODELOS LexIA.json», en la raíz de Tutelas → Documentos).
import { graphFetch, graphLeerTexto, graphDescargarArchivo, prepararCasoParaEscrito, guardarArchivoEnTutela, numeroCortoDeRadicadoLargo } from './graph';
import { motivoDiaNoHabil } from './vencimientoTutela';
import { listarParrafosDeDocx, aplicarCambiosADocx, perfilFormatoDeDocx } from './escritoDesdeModelo';
import { revisarParrafos, resumenDeCorrecciones } from './revisorEscrito';
import { textoDePdf } from './adjuntosLexIA';

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
  return sel.map(e => ({ nombre: e.n, ruta: (e.s ? e.s + '/' : '') + e.n, raiz: e.c || '', uri: e.u, ficha: e.f || '' }));
}

// Modelo de aplazamiento del cliente: el archivo ALIANSALUD.docx / COLMEDICA.docx / UMD.docx de «3. OTRAS ACTUACIONES / APLAZAMIENTOS» (se lee la
// carpeta en vivo, porque estos archivos se renuevan y la lista guardada puede estar vencida).
const cacheAplazamiento = new Map();   // cliente -> { t, v }
async function modeloFijoAplazamiento(cliente){
  const hit = cacheAplazamiento.get(cliente);
  if(hit && Date.now() - hit.t < 300000) return hit.v;
  const v = await buscarModeloFijoAplazamiento(cliente);
  if(v) cacheAplazamiento.set(cliente, { t: Date.now(), v });
  return v;
}
// Ruta completa del modelo, tal como está en SharePoint (Tutelas → Documentos): «1. MUJER / COLMEDICA / ELR.docx».
export function rutaCompleta(m){ return [m && m.raiz].concat(String((m && m.ruta) || '').split('/')).map(x => String(x || '').trim()).filter(Boolean).join(' / '); }
async function buscarModeloFijoAplazamiento(cliente){
  const base = await graphFetch(`/drives/${DRIVE_MODELOS}/root:/${encodeURIComponent(OTRAS)}`).catch(() => null);
  if(!base?.id) return null;
  const hijos = await hijosGraph(DRIVE_MODELOS, base.id, true);
  const carpeta = hijos.find(h => h.folder && normalizar(h.name).includes('aplazamiento'));
  if(!carpeta) return null;
  const archivos = (await hijosGraph(DRIVE_MODELOS, carpeta.id, true)).filter(esDocx);
  const clave = { aliansalud: 'aliansalud', colmedica: 'colmedica', umd: 'umd' }[cliente];
  const sinExt = a => normalizar(a.name).replace(/\.docx?$/, '').trim();
  const f = archivos.find(a => sinExt(a) === clave) || archivos.find(a => sinExt(a).includes(clave));
  return f ? { nombre: f.name, ruta: carpeta.name + '/' + f.name, uri: `file:///${DRIVE_MODELOS}/${f.id}`, raiz: OTRAS, ficha: '' } : null;
}

// ---------------------------------------------------------------- robot
async function llamarRobot(url, cuerpo){
  if(!url) throw new Error('Falta la dirección del robot (ROBOT_ESCRITO_URL en config.js).');
  let res;
  try{ res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }); }
  catch(err){ throw new Error('No hubo respuesta del robot (la conexión se cortó o no llegó). Si redactar-escrito.php no está actualizado en cPanel, súbelo de nuevo; si tarda demasiado, vuelve a intentar. Detalle: ' + (err.message || err)); }
  let data;
  try{ data = await res.json(); }catch{ throw new Error(`El robot de escritos no respondió bien (${res.status}). ¿Ya subiste redactar-escrito.php a cPanel?`); }
  if(!res.ok || data.error) throw new Error(data.error || `El robot de escritos falló (${res.status}).`);
  return data;
}
// Los párrafos muy largos (citas, argumentos) se abrevian: Claude casi siempre solo decide si se quedan, se quitan o cambia un dato puntual.
function parrafosParaRobot(parrafos){
  return parrafos.map(p => p.t.length > 700
    ? { n: p.n, t: p.t.slice(0, 380) + ' […] ' + p.t.slice(-120), largo: true, total: p.t.length, ...(p.cita ? { cita: true } : {}) }
    : { n: p.n, t: p.t, ...(p.cita ? { cita: true } : {}) });
}
const MESES_DESPACHO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_DESPACHO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
// Formato del despacho (PROMPT MAESTRO): «octubre 2 de 2026», día sin cero a la izquierda.
function fechaLarga(d = new Date()){ return MESES_DESPACHO[d.getMonth()] + ' ' + d.getDate() + ' de ' + d.getFullYear(); }
function isoLocal(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
// Día hábil siguiente (sin sábados, domingos ni festivos de Colombia): el aplazamiento siempre pide UN día, hasta el día hábil siguiente al escrito.
function siguienteDiaHabil(desde){
  const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  do{ d.setDate(d.getDate() + 1); }while(motivoDiaNoHabil(isoLocal(d)));
  return d;
}
// Datos que el portal calcula con reglas fijas del PROMPT MAESTRO (el robot los usa tal cual, sin recalcularlos).
export function datosCalculados({ registro, tipo }){
  const hoy = new Date();
  const L = ['FECHA DE HOY (formato del despacho, para la línea de ciudad y fecha: «<ciudad del juzgado>, ' + fechaLarga(hoy) + '»): ' + fechaLarga(hoy)];
  const rad = numeroCortoDeRadicadoLargo(registro && registro.Proceso);
  if(rad) L.push('RAD (corto, formato AAAA-NNNNN; nunca el radicado largo): ' + rad);
  if(registro && registro.NoTutela) L.push('CONSECUTIVO DE LA TUTELA: T-' + registro.NoTutela);
  if(tipo === 'aplazamiento'){
    const d = siguienteDiaHabil(hoy);
    L.push('FECHA DEL APLAZAMIENTO: el aplazamiento es SIEMPRE de 1 (un) día; la fecha que se solicita en el numeral final es el día hábil siguiente al escrito: ' + DIAS_DESPACHO[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES_DESPACHO[d.getMonth()] + ' de ' + d.getFullYear() + '.');
  }
  return L.join('\n');
}
// Nombre del archivo como lo nombra la abogada (PROMPT MAESTRO, sección 3): «T 28272 Respuesta Colmedica Medicina Prepagada - GARAVITO LONDOÑO.docx».
export function nombreArchivoAbogada({ tipo, registro, cliente }){
  const entidad = { aliansalud: 'Aliansalud EPS', colmedica: 'Colmedica Medicina Prepagada', umd: 'UMD' }[cliente] || String(registro.Cliente || '').slice(0, 30);
  const n = String(registro.NoTutela || '').trim();
  const palabras = String(registro.Usuario || '').trim().split(/\s+/).filter(Boolean);
  const apellidos = palabras.length >= 3 ? palabras.slice(-2).join(' ') : (palabras.length === 2 ? palabras[1] : palabras.join(' '));
  const sufijo = apellidos ? ' - ' + apellidos : '';
  let nombre;
  if(tipo === 'aplazamiento') nombre = cliente === 'umd' ? 'T ' + n + ' Solicitud de aplazamiento UMD' : 'Solicitud de aplazamiento ' + entidad + ' T ' + n;
  else{
    const palabraTipo = { contestacion: 'Respuesta', alcance: 'Alcance', cumplimiento: 'Cumplimiento', aclaracion: 'Solicitud de aclaración', impugnacion: 'Impugnación' }[tipo] || 'Memorial';
    nombre = 'T ' + n + ' ' + palabraTipo + ' ' + entidad + sufijo;
  }
  return nombre.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() + '.docx';
}
function nombreCortoCliente(cliente){ return { aliansalud: 'ALIANSALUD', colmedica: 'COLMEDICA', umd: 'UMD' }[claveCliente(cliente)] || String(cliente || '').slice(0, 20); }

// Revisor automático (reglas mecánicas del PROMPT MAESTRO de la abogada): corrige en el Word lo que no cambia el sentido (reemplazos exactos, sin tocar las citas)
// y devuelve en las alertas lo que exige criterio. Nunca bloquea la entrega: si falla, se entrega el escrito tal cual.
async function pasarRevisor(bytes, { registro } = {}){
  try{
    const rev = revisarParrafos(await listarParrafosDeDocx(bytes), { registro });
    let salida = bytes, corregido = '';
    if(rev.reemplazos.length){
      const ap = await aplicarCambiosADocx(bytes, { reemplazos: rev.reemplazos.map(({ p, buscar, reemplazar }) => ({ p, buscar, reemplazar })) });
      salida = ap.bytes;
      corregido = resumenDeCorrecciones(rev.reemplazos);
    }
    const lineas = [];
    if(corregido) lineas.push('- Corregí automáticamente: ' + corregido + '.');
    rev.alertas.forEach(a => lineas.push('- ' + a));
    return { bytes: salida, texto: lineas.length ? 'REVISOR AUTOMÁTICO (reglas de la abogada):\n' + lineas.join('\n') : '' };
  }catch(err){
    console.error('El revisor automático no pudo revisar el escrito:', err);
    return { bytes, texto: '' };
  }
}
const juntarAlertas = (...t) => t.filter(x => String(x || '').trim()).join('\n\n');

/**
 * Elige el modelo (o usa el manual) y redacta el escrito sobre el .docx original.
 * @returns {{ bytes, nombre, alertas, usos, avisos, resumen, modelo, caso }}
 */
export async function redactarEscritoConRobot({ robotUrl, urlCarpeta, numero, tipo, indiceRegistro = 0, sexo, nota = '', modeloManual = null, lecciones = '', estricto = false, log = () => {} }){
  log('Leyendo la lectura de la tutela...');
  const caso = await prepararCasoParaEscrito(urlCarpeta, numero, { ligero: estricto, indiceRegistro });
  if(!caso) throw new Error('Esta tutela todavía no tiene «Lectura LexIA.txt»: primero extráela con LexIA.');
  const registro = caso.registros[indiceRegistro] || caso.registros[0] || {};
  const cliente = claveCliente(registro.Cliente);
  if(!cliente) throw new Error('No reconozco el cliente de la tutela (' + (registro.Cliente || 'sin cliente') + ').');
  const usos = [];

  // Velocidad (2026-10-20): todo lo que no depende de lo anterior se pide A LA VEZ (lecciones, modelo fijo o lista de modelos, preferencias y, en Colmédica, las cláusulas del plan).
  const esAplazFijo = tipo === 'aplazamiento' && !modeloManual;
  const leccionesPasadas = !!lecciones;
  const promLecciones = lecciones ? Promise.resolve(lecciones) : leerLecciones().then(ls => leccionesParaPrompt(ls, tipo, cliente));
  promLecciones.catch(() => null);
  const promFijo = esAplazFijo ? modeloFijoAplazamiento(cliente).catch(() => null) : Promise.resolve(null);
  const promIndice = esAplazFijo ? null : obtenerIndiceModelos(false, log);
  promIndice?.catch(() => null);
  const promPrefs = (esAplazFijo || modeloManual) ? null : leerPreferencias().catch(() => ({}));
  const usosClausulas = [];
  const promClausulas = (cliente === 'colmedica' && !estricto && tipo !== 'aplazamiento')
    ? clausulasDelPlanDeColmedica({ robotUrl, caso, registro, log, usos: usosClausulas })
    : Promise.resolve('');
  promClausulas.catch(() => null);
  lecciones = await promLecciones;
  if(lecciones && !leccionesPasadas) log('Aplico las lecciones que el despacho le ha enseñado.');
  // Aplazamiento: hay UN modelo por cliente en la carpeta APLAZAMIENTOS (ALIANSALUD / COLMEDICA / UMD): se usa ese, sin elegir.
  let fijo = null;
  if(esAplazFijo){
    fijo = await promFijo;
    if(fijo) log('Modelo de aplazamiento del cliente: ' + rutaCompleta(fijo));
  }
  let modelos = [];
  if(!fijo){
    log('Cargando la lista de modelos...');
    const indice = await (promIndice || obtenerIndiceModelos(false, log));
    modelos = modelosDelIndice(indice, tipo, sexo, cliente);
    if(!modelos.length) throw new Error('No encontré modelos para ese escrito, cliente y sexo en la lista (prueba «Actualizar la lista de modelos»).');
  }

  let elegido = fijo || (modeloManual && modelos.find(m => m.ruta === modeloManual));
  if(fijo){
    /* modelo único del cliente: no se elige ni se recuerda */
  }else if(elegido){
    // Lo elegido a mano se recuerda para este cliente + Tema + escrito: la próxima vez se usa sin preguntarle a Claude.
    guardarPreferenciaModelo({ cliente, tipo, tema: registro.Tema, modelo: elegido }).then(() => log('Anotado: la próxima vez, para este cliente y Tema, usaré este modelo sin preguntarle a LexIA.')).catch(() => {});
  }else{
    const prefs = await (promPrefs || leerPreferencias());
    const p = prefs[clavePreferencia(cliente, tipo, registro.Tema)];
    const habitual = p && modelos.find(m => m.ruta === p.ruta);
    if(habitual){ elegido = habitual; log('Uso tu modelo habitual para este cliente y Tema: ' + rutaCompleta(habitual) + ' (lo elegiste a mano antes; si prefieres otro, escógelo en la lista «Modelo del despacho»).'); }
  }
  if(!elegido){
    log('Eligiendo el mejor modelo entre ' + modelos.length + '...');
    const r = await llamarRobot(robotUrl, {
      modo: 'elegir', modelos: modelos.map(m => m.ficha ? m.ruta + ' — ' + m.ficha : m.ruta),
      caso: { cliente: registro.Cliente, tipoRespuesta: registro.TipoRespuesta, prestacion: registro.Prestacion, tema: registro.Tema, solicita: registro.Solicita, analisis: registro.Analisis || {}, escritoNecesario: TIPOS_ESCRITO[tipo].etiqueta, nota: String(nota).slice(0, 2000), accionante: sexo },
    });
    usos.push({ paso: 'Elegir el modelo', ...r.uso });
    elegido = modelos[r.indice];
    log('Modelo elegido: ' + rutaCompleta(elegido) + (r.motivo ? ' — ' + r.motivo : ''));
  }

  log('Bajando el modelo de SharePoint...');
  const m = /^file:\/\/\/([^/]+)\/(.+)$/.exec(elegido.uri);
  if(!m) throw new Error('No pude identificar el archivo del modelo.');
  const { bytes } = await graphDescargarArchivo(m[1], m[2]);
  guardarPerfilDeModelo(elegido.uri, bytes, { soloSiFalta: true }).catch(err => console.error('No se pudo dejar el perfil de formato del modelo:', err));
  const parrafos = await listarParrafosDeDocx(bytes);

  // Colmédica: se fundamenta con las cláusulas de SU plan de medicina prepagada (no en el aplazamiento ni en modo estricto, que solo cambian datos).
  // (se pidieron al principio, a la vez que la elección del modelo: aquí solo se espera el resultado)
  const clausulas = await promClausulas;
  usos.push(...usosClausulas);

  log('Redactando (LexIA devuelve solo los cambios)...');
  const r = await llamarRobot(robotUrl, {
    modo: 'redactar', tipoEscrito: TIPOS_ESCRITO[tipo].etiqueta, hoy: fechaLarga(), caso: caso.textoCaso, correos: caso.correosResumen,
    nota, lecciones, clausulas, estricto, parrafos: parrafosParaRobot(parrafos), datos: datosCalculados({ registro, tipo }),
  });
  usos.push({ paso: 'Redactar', ...r.uso });
  // Modo estricto: el modelo no se toca salvo reemplazar datos (sin eliminar ni agregar párrafos), aunque el robot devolviera algo más.
  // Respeto al modelo: nunca se elimina nada (aunque el robot lo devolviera); en modo estricto tampoco se agrega nada.
  const aplicado = await aplicarCambiosADocx(bytes, estricto ? { ...r, eliminar: [], agregar: [] } : r);
  log('Revisando con las reglas de la abogada...');
  const rev = await pasarRevisor(aplicado.bytes, { registro });
  aplicado.bytes = rev.bytes;
  const nombre = nombreArchivoAbogada({ tipo, registro, cliente });
  log('Guardando en la carpeta de la tutela...');
  // Se guarda en la carpeta de la tutela SIN hacer esperar (el resultado ya está listo en memoria).
  guardarArchivoEnTutela(urlCarpeta, numero, nombre, aplicado.bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').catch(err => console.error('No pude guardar el Word en la carpeta de la tutela:', err));
  return { bytes: aplicado.bytes, nombre, cliente, lecciones, estricto, registro, alertas: juntarAlertas(r.alertas, rev.texto), usos, avisos: aplicado.avisos, resumen: aplicado.resumen, modelo: elegido.ruta, modeloRuta: rutaCompleta(elegido), tipo, numero, urlCarpeta, robotUrl, caso: { textoCaso: caso.textoCaso, correos: caso.correosResumen }, modelos };
}

/** Corrige el borrador actual con una instrucción del abogado («Enséñame»). Reusa el caché del robot (el caso es el mismo). */
export async function corregirEscritoConRobot({ estado, instruccion, nota = '', lecciones = '', log = () => {} }){
  log('Aplicando la corrección...');
  const parrafos = await listarParrafosDeDocx(estado.bytes);
  const r = await llamarRobot(estado.robotUrl, {
    modo: 'corregir', tipoEscrito: TIPOS_ESCRITO[estado.tipo].etiqueta, hoy: fechaLarga(), caso: estado.caso.textoCaso, correos: estado.caso.correos,
    nota, lecciones, instruccion, estricto: !!estado.estricto, parrafos: parrafosParaRobot(parrafos),
  });
  const aplicado = await aplicarCambiosADocx(estado.bytes, estado.estricto ? { ...r, eliminar: [], agregar: [] } : { ...r, eliminar: [] });
  const rev = await pasarRevisor(aplicado.bytes, { registro: estado.registro });
  aplicado.bytes = rev.bytes;
  await guardarArchivoEnTutela(estado.urlCarpeta, estado.numero, estado.nombre, aplicado.bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').catch(() => {});
  return { bytes: aplicado.bytes, alertas: juntarAlertas(r.alertas, rev.texto), leccion: r.leccion || null, uso: { paso: 'Corrección', ...r.uso }, avisos: aplicado.avisos, resumen: aplicado.resumen };
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

// ---------------------------------------------------------------- cláusulas del plan de Colmédica (Plan A)
const CARPETA_PLANES = '4. PLANES MEDICINA PREPAGADA';
const NOMBRE_CLAUSULAS = 'CLAUSULAS DE PLANES LexIA.json';
const PLANES_COLMEDICA = ['Esmeralda Guía Premium', 'Esmeralda', 'Zafiro Elite', 'Zafiro', 'Rubí Integral', 'Rubí', 'Diamante', 'Azul', 'Océano', 'Humana Plus', 'Piedras', 'Colina'];
// Plan de medicina prepagada que menciona la lectura (sin IA): el nombre más largo que aparezca como palabra completa, o '' si no se nombra ninguno.
export function planDelCaso(textoCaso){
  const t = ' ' + normalizar(textoCaso).replace(/[^a-z0-9ñ]+/g, ' ') + ' ';
  const hallados = PLANES_COLMEDICA.filter(p => t.includes(' ' + normalizar(p).replace(/[^a-z0-9ñ]+/g, ' ') + ' '));
  hallados.sort((a, b) => b.length - a.length);
  return hallados[0] || '';
}
async function pdfsDePlanes(driveId, id, prefijo, nivel, salida){
  const hijos = await hijosGraph(driveId, id, true);
  const subs = [];
  for(const h of hijos){
    if(h.file && /\.pdf$/i.test(h.name || '')) salida.push({ nombre: h.name, ruta: prefijo ? prefijo + '/' + h.name : h.name, id: h.id });
    else if(h.folder && nivel < 3) subs.push(pdfsDePlanes(driveId, h.id, prefijo ? prefijo + '/' + h.name : h.name, nivel + 1, salida));
  }
  await Promise.all(subs);
}
// El PDF del clausulado cuyo nombre (o carpeta) trae más palabras del plan.
async function clausuladoDelPlan(plan){
  const base = await graphFetch('/drives/' + DRIVE_MODELOS + '/root:/' + encodeURIComponent(CARPETA_PLANES)).catch(() => null);
  if(!base?.id) throw new Error('No encontré la carpeta «' + CARPETA_PLANES + '» en Tutelas → Documentos.');
  const pdfs = [];
  await pdfsDePlanes(DRIVE_MODELOS, base.id, '', 0, pdfs);
  if(!pdfs.length) throw new Error('No hay clausulados (.pdf) en «' + CARPETA_PLANES + '».');
  const palabras = normalizar(plan).split(/[^a-z0-9ñ]+/).filter(w => w.length > 2 && w !== 'plan');
  const puntaje = p => { const r = normalizar(p.ruta); return palabras.filter(w => r.includes(w)).length; };
  const mejor = pdfs.map(p => ({ ...p, pts: puntaje(p) })).filter(p => p.pts > 0).sort((a, b) => b.pts - a.pts || b.ruta.localeCompare(a.ruta))[0];
  return mejor || null;
}
async function leerClausulasGuardadas(){
  try{
    const txt = await graphLeerTexto('/drives/' + DRIVE_MODELOS + '/root:/' + encodeURIComponent(NOMBRE_CLAUSULAS) + ':/content');
    const o = txt ? JSON.parse(txt) : null;
    return (o && o.items) || {};
  }catch(err){ return {}; }
}
async function guardarClausulas(items){
  await graphFetch('/drives/' + DRIVE_MODELOS + '/root:/' + encodeURIComponent(NOMBRE_CLAUSULAS) + ':/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, items }) });
}
/**
 * Cláusulas del plan útiles para este caso (texto con su numeración) o '' si no aplica / no se pudo. Nunca lanza: lo que falle se avisa en el log y se sigue sin cláusulas.
 * Se guardan por plan + Tema («CLAUSULAS DE PLANES LexIA.json»): la segunda tutela del mismo plan y Tema no paga la lectura ni la IA.
 */
export async function clausulasDelPlanDeColmedica({ robotUrl, caso, registro, log = () => {}, usos = [] }){
  try{
    const plan = planDelCaso(caso.textoCaso);
    if(!plan){ log('Colmédica: la lectura no nombra el plan de medicina prepagada; sigo sin cláusulas del plan.'); return ''; }
    log('Plan del usuario: ' + plan + '.');
    const clave = normalizar(plan) + '|' + normalizar(registro.Tema || '');
    const guardadas = await leerClausulasGuardadas();
    if(guardadas[clave] && guardadas[clave].clausulas){ log('Cláusulas del plan ' + plan + ' (guardadas el ' + new Date(guardadas[clave].fecha).toLocaleDateString('es-CO') + '; no se gastó IA).'); return guardadas[clave].clausulas; }
    const pdf = await clausuladoDelPlan(plan);
    if(!pdf){ log('No encontré el clausulado del plan ' + plan + ' en «' + CARPETA_PLANES + '»; sigo sin cláusulas del plan.'); return ''; }
    log('Clausulado: ' + CARPETA_PLANES + ' / ' + pdf.ruta);
    const { bytes } = await graphDescargarArchivo(DRIVE_MODELOS, pdf.id);
    const texto = await textoDePdf(bytes, { maxCaracteres: 150000 });
    if(texto.replace(/\s/g, '').length < 800){ log('El clausulado se leyó casi vacío (¿escaneado?); sigo sin cláusulas del plan.'); return ''; }
    log('Extrayendo las cláusulas que sirven para este caso (' + texto.length.toLocaleString('es-CO') + ' caracteres)...');
    const r = await llamarRobot(robotUrl, { modo: 'clausulas', plan, texto, caso: { tema: registro.Tema, solicita: registro.Solicita, analisis: registro.Analisis || {} } });
    usos.push({ paso: 'Cláusulas del plan', ...r.uso });
    const clausulas = String(r.clausulas || '').trim();
    if(!clausulas){ log('El clausulado no tiene cláusulas aplicables a este caso.'); return ''; }
    guardadas[clave] = { plan, tema: String(registro.Tema || ''), clausulas, pdf: pdf.ruta, fecha: new Date().toISOString() };
    guardarClausulas(guardadas).catch(err => console.error('No se pudo guardar las cláusulas del plan:', err));
    log('Cláusulas del plan extraídas.');
    return clausulas;
  }catch(err){
    console.error(err);
    log('No pude revisar el plan de medicina prepagada (' + String(err.message || err).slice(0, 160) + '); sigo sin cláusulas del plan.');
    return '';
  }
}

// ---------------------------------------------------------------- perfiles de formato de los modelos
// El conector del artefacto solo entrega el TEXTO de un Word; para que el Word del artefacto salga con la misma letra, el portal deja el formato de cada
// modelo en «PERFILES DE FORMATO LexIA/<id del modelo>.json» (ver perfilFormatoDeDocx). Se actualiza cada vez que el portal baja el modelo.
const CARPETA_PERFILES = 'PERFILES DE FORMATO LexIA';
// Nombres de los perfiles que ya existen en la carpeta de perfiles («<id del modelo>.json»).
let cachePerfiles = null;   // { t, ya } — la lista de perfiles se lee una vez cada 10 minutos, no en cada redacción
async function perfilesExistentes(fresco = false){
  if(!fresco && cachePerfiles && Date.now() - cachePerfiles.t < 600000) return cachePerfiles.ya;
  const ya = new Set();
  try{
    let url = `/drives/${DRIVE_MODELOS}/root:/${encodeURIComponent(CARPETA_PERFILES)}:/children?$select=name&$top=999`;
    for(let pagina = 0; pagina < 10 && url; pagina++){
      const r = await graphFetch(url);
      (r.value || []).forEach(x => ya.add(x.name));
      url = r['@odata.nextLink'] ? r['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : '';
    }
  }catch(err){ /* la carpeta todavía no existe: no hay perfiles */ }
  cachePerfiles = { t: Date.now(), ya };
  return ya;
}
export async function guardarPerfilDeModelo(uri, bytes, { soloSiFalta = false } = {}){
  const m = /^file:\/\/\/([^/]+)\/([^/]+)$/.exec(uri || '');
  if(!m) return false;
  if(soloSiFalta && (await perfilesExistentes()).has(m[2] + '.json')) return false;
  const perfil = await perfilFormatoDeDocx(bytes);
  await graphFetch(`/drives/${DRIVE_MODELOS}/root:/${encodeURIComponent(CARPETA_PERFILES)}/${m[2]}.json:/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(perfil) });
  if(cachePerfiles) cachePerfiles.ya.add(m[2] + '.json');
  return true;
}
/** Crea el perfil de formato de cada modelo de la lista (3 a la vez). Devuelve { listos, fallidos }. */
export async function generarPerfilesDeModelos({ modelos, log = () => {}, renovar = false }){
  let listos = 0, fallidos = 0, hechos = 0;
  // Se crea UNA sola vez por modelo: los que ya tienen perfil no se tocan (salvo que se pida «renovar»).
  const existentes = renovar ? new Set() : await perfilesExistentes(true);
  const idDe = m => (/^file:\/\/\/([^/]+)\/([^/]+)$/.exec(m.uri || '') || [])[2];
  const cola = modelos.filter(m => renovar || !existentes.has(idDe(m) + '.json'));
  const yaTenian = modelos.length - cola.length;
  const total = cola.length;
  const trabajador = async () => {
    while(cola.length){
      const m = cola.shift();
      try{
        const x = /^file:\/\/\/([^/]+)\/(.+)$/.exec(m.uri);
        const { bytes } = await graphDescargarArchivo(x[1], x[2]);
        await guardarPerfilDeModelo(m.uri, bytes);
        listos++;
      }catch(err){ fallidos++; console.error('No se pudo crear el perfil de formato de ' + m.ruta + ':', err); }
      hechos++;
      if(hechos % 10 === 0 || hechos === total) log('Perfiles de formato: ' + hechos + ' de ' + total + '...');
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, total) }, trabajador));
  return { listos, fallidos, yaTenian };
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
    let r;
    try{ r = await llamarRobot(robotUrl, { modo: 'fichas', modelos: validos }); }
    catch(err){ log('Este grupo no se pudo describir (' + String(err.message || err).slice(0, 160) + '); sigo con los siguientes.'); continue; }
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
