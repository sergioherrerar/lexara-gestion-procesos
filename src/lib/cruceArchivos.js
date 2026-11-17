// "Cruce de archivos" (Informes) — pedido explícito del usuario 2026-09-03:
// cruza 2 o más archivos Excel entre sí (típico en conciliaciones de
// cartera con EPS: cada archivo es un corte/reporte distinto del mismo
// radicado; el tope de 3 se quitó el mismo día, a pedido explícito) —
// el usuario elige, POR ARCHIVO, qué hoja analizar y cuál es la columna que
// sirve de llave para cruzar (ej. "Radicado"), porque cada archivo puede
// traer nombres de columna y de hoja distintos. No se intenta adivinar
// cuáles son las columnas de "Valor Presentado/Pagado/Castigado" — esos
// nombres varían de archivo a archivo (confirmado con datos reales: un
// mismo concepto se llama "Valor Presentado" en un archivo y "ULT VAL
// PRESENTADO" en otro) — en cambio, se llevan TODAS las columnas
// originales de cada archivo al Excel de salida, con una columna
// Observación aparte que dice qué encontró el cruce, para que el usuario
// compare los valores a simple vista con su propio criterio.
import { normalize } from './graph';
import { COLOR_ENCABEZADO } from './informeSOS';

function valorCelda(v){
  if(v == null) return "";
  if(v instanceof Date) return v.toISOString().slice(0,10);
  if(typeof v === 'object'){
    if('result' in v) return valorCelda(v.result);
    if('text' in v) return valorCelda(v.text);
    if('richText' in v) return v.richText.map(p => p.text).join('');
  }
  return String(v).trim();
}

// Fórmulas sin resultado guardado (archivos armados por programas que no calculan, p. ej. «VALOR VIGENTE» = C181-D181): ExcelJS no trae el valor y salía «[object Object]».
// Se resuelven las sumas, restas, productos y divisiones sencillas entre celdas (hasta 3 niveles); cualquier otra fórmula queda vacía en vez de mostrar basura.
function numeroDeCelda(ws, ref, nivel){
  const celda = ws.getCell(ref);
  const v = celda.value;
  if(v == null || v === '') return 0;
  if(typeof v === 'object'){
    if('result' in v && v.result != null) return Number(v.result) || 0;
    // celda.formula también traduce las fórmulas COMPARTIDAS (las que solo dicen «igual a la de arriba»).
    if('formula' in v || 'sharedFormula' in v) return evaluarFormulaSimple(ws, celda.formula, nivel + 1) ?? 0;
    return 0;
  }
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function evaluarFormulaSimple(ws, formula, nivel = 0){
  if(nivel > 3) return null;
  const f = String(formula || '').replace(/\s+/g, '').replace(/^=/, '');
  if(!/^[A-Z]{1,3}\d+([+\-*/]([A-Z]{1,3}\d+|\d+(\.\d+)?))*$/.test(f)) return null;
  const expr = f.replace(/[A-Z]{1,3}\d+/g, ref => '(' + numeroDeCelda(ws, ref, nivel) + ')');
  try{ const r = Function('"use strict"; return (' + expr + ')')(); return Number.isFinite(r) ? Math.round(r * 1e6) / 1e6 : null; }catch(e){ return null; }
}
function valorCeldaHoja(ws, cell){
  const v = cell.value;
  if(v && typeof v === 'object' && !(v instanceof Date) && !('result' in v) && !('text' in v) && !('richText' in v)){
    if('formula' in v || 'sharedFormula' in v){ const r = evaluarFormulaSimple(ws, cell.formula); return r == null ? '' : String(r); }
    if('error' in v) return '';
    return '';
  }
  return valorCelda(v);
}

// Carga el archivo subido y devuelve el Workbook completo de ExcelJS (no
// solo una hoja) — hace falta para poder ofrecer el desplegable de "qué
// hoja analizar" antes de decidir cuál leer a fondo.
export async function cargarWorkbook(file){
  const { default: ExcelJS } = await import('exceljs');
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

export function nombresDeHojas(workbook){
  return workbook.worksheets.map(ws => ws.name);
}

// Lee una hoja puntual: fila 1 = encabezados (tal como los escribió quien
// armó el archivo, sin adivinar nada), el resto = filas de datos como
// objetos {encabezado: valor}. Filas totalmente vacías se descartan.

function letrasAColumna(letras){
  let n = 0;
  for(const ch of letras) n = n*26 + (ch.charCodeAt(0) - 64);
  return n;
}
function parsearRef(ref){
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  return m ? { col: letrasAColumna(m[1]), fila: Number(m[2]) } : null;
}

// Bug real 2026-09-03, reportado por el usuario: hojas como estas (comunes
// en reportes de EPS) traen la fila 1 con títulos de AGRUPACIÓN combinados
// ("DATOS FACTURA", "CARTERA ACTUAL", cada uno una celda combinada sobre
// varias columnas) — el encabezado real de cada columna está en la fila
// siguiente. Se detecta mirando las combinaciones (merges) reales de la
// hoja: si una fila tiene una celda combinada que abarca MÁS DE UNA
// columna (y una sola fila — una combinación vertical de una sola columna
// sí puede ser un encabezado real repartido en 2 filas por estética), esa
// fila es de agrupación, no el encabezado — se sigue a la próxima.
function filaEsAgrupadora(ws, numeroFila){
  const merges = ws.model.merges || [];
  return merges.some(rango => {
    const [inicioRef, finRef] = rango.split(':');
    const inicio = parsearRef(inicioRef);
    const fin = finRef ? parsearRef(finRef) : inicio;
    if(!inicio || !fin) return false;
    const colSpan = fin.col - inicio.col + 1;
    const rowSpan = fin.fila - inicio.fila + 1;
    return colSpan > 1 && rowSpan === 1 && inicio.fila <= numeroFila && numeroFila <= fin.fila;
  });
}

export function leerHoja(workbook, nombreHoja){
  const ws = workbook.getWorksheet(nombreHoja);
  if(!ws) throw new Error(`No se encontró la hoja "${nombreHoja}".`);

  let filaEncabezado = 1;
  while(filaEncabezado < 10 && filaEsAgrupadora(ws, filaEncabezado)) filaEncabezado++;
  // Hojas con un TÍTULO suelto en la fila 1 (p. ej. el nombre de la EPS en A1, sin combinar): si esa fila trae menos de 3 celdas con texto, el encabezado real es la primera de las
  // siguientes (hasta la 12) que traiga 3 o más (2026-11-17: «PENDIENTE DE ADMISIÓN reforma 2017-00008», hoja «Cabezote Demanda»).
  const celdasConTexto = n => { let c = 0; ws.getRow(n).eachCell(cell => { if(valorCelda(cell.value).trim()) c++; }); return c; };
  if(celdasConTexto(filaEncabezado) < 3){
    for(let n = filaEncabezado + 1; n <= 12; n++){ if(celdasConTexto(n) >= 3){ filaEncabezado = n; break; } }
  }
  // Si la fila hallada es de agrupación (celdas combinadas), el encabezado real es la que sigue.
  while(filaEncabezado < 12 && filaEsAgrupadora(ws, filaEncabezado)) filaEncabezado++;

  const columnas = [];
  const vistos = new Map();
  ws.getRow(filaEncabezado).eachCell((cell, colNumero) => {
    let nombre = valorCelda(cell.value).replace(/\s+/g, ' ');
    if(nombre){
      // Un encabezado repetido se distingue con un número: antes la segunda columna pisaba a la primera y sus datos se perdían.
      const veces = (vistos.get(nombre) || 0) + 1;
      vistos.set(nombre, veces);
      if(veces > 1) nombre = nombre + ' (' + veces + ')';
    }
    columnas[colNumero] = nombre;
  });
  const encabezados = columnas.filter(Boolean);
  if(!encabezados.length) throw new Error(`La hoja "${nombreHoja}" no tiene encabezados reconocibles en las primeras filas.`);

  const filas = [];
  for(let r=filaEncabezado+1; r<=ws.rowCount; r++){
    const row = ws.getRow(r);
    const fila = {};
    let vacia = true;
    columnas.forEach((nombreCol, colNumero) => {
      if(!nombreCol) return;
      const valor = valorCeldaHoja(ws, row.getCell(colNumero));
      if(valor) vacia = false;
      fila[nombreCol] = valor;
    });
    if(!vacia) filas.push(fila);
  }
  return { columnas: encabezados, filas };
}

export function normalizarLlave(v){
  const t = String(v ?? '').trim();
  if(!t) return '';
  if(/^\d+(\.0+)?$/.test(t)) return t.replace(/\.0+$/, '').replace(/^0+(?=\d)/, '');
  return normalize(t).trim();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Roles y sugerencias (2026-11-09, pedido del usuario: cruce de la base de la demanda con el peritaje y con los desistimientos). Nada se decide a escondidas: todo lo que se
// sugiere se puede cambiar a mano en la pantalla.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export const ROLES_CRUCE = { generico: 'Otro archivo', base: 'Base de la demanda', peritaje: 'Peritaje', desistimientos: 'Desistimientos' };

/** El nombre del archivo dice qué es: «…PERITAJE…» → peritaje; «DESISTIMIENTOS SOS final» → desistimientos. */
export function detectarRol(nombreArchivo, indice = 0){
  const n = normalize(String(nombreArchivo || ''));
  if(/peritaje/.test(n)) return 'peritaje';
  if(/desistimiento/.test(n)) return 'desistimientos';
  if(/base de datos|base demanda|base de la demanda/.test(n)) return 'base';
  return indice === 0 ? 'base' : 'generico';
}

/** La hoja que se propone al subir el archivo (la base de la demanda la elige siempre el usuario: trae varias y cada una sirve para algo distinto). */
export function sugerirHoja(hojas, rol){
  const por = re => hojas.find(h => re.test(normalize(h)));
  if(rol === 'peritaje') return por(/^informe$/) || (hojas.length === 1 ? hojas[0] : '');
  if(rol === 'desistimientos') return por(/^base$/) || por(/desistimiento/) || (hojas.length === 1 ? hojas[0] : '');
  return hojas.length === 1 ? hojas[0] : '';
}

/** La columna llave más probable: «Ultimo Radicado MYT0102», «RADICADO O ENTREGA» o «RADICADO» (en ese orden); '' si ninguna se parece. */
export function sugerirColumnaLlave(columnas){
  const n = columnas.map(c => ({ c, t: normalize(c) }));
  const patrones = [/ultimo rad(icado)?.*myt\s*0?1\s*0?2/, /ultimo radicado.*myt\s*0102/, /ultimo radicado/, /radicado o entrega/, /^radicado( \(\d+\))?$/, /radicado/];
  for(const re of patrones){ const hallada = n.find(x => re.test(x.t)); if(hallada) return hallada.c; }
  return '';
}

/** La columna del peritaje con el cumplimiento de los requisitos esenciales, por su nombre exacto; '' si no está (entonces la elige el usuario). */
export function sugerirColumnaCumplimiento(columnas){
  const exacta = columnas.find(c => normalize(c).replace(/\s+/g, ' ').trim() === 'cumplimiento esenciales del recobro');
  return exacta || '';
}

/** La columna del VALOR ACTUAL de cada recobro, para los subtotales: «Valor de cartera Actual» (peritaje), «VALOR ACTUAL» (base), «VALOR VIGENTE» (desistimientos) o parecida; '' si ninguna se parece. */
export function sugerirColumnaValor(columnas, rol){
  const n = columnas.map(c => ({ c, t: normalize(c).replace(/\s+/g, ' ') }));
  // En los desistimientos lo que se suma es lo que se va a desistir (2026-11-17: el subtotal salía de «Valor vigente» y daba $1,2 millones en vez de $185 millones del proceso).
  if(rol === 'desistimientos'){ const h = n.find(x => /valor a desistir/.test(x.t)); if(h) return h.c; }
  const patrones = [/valor de cartera actual/, /cartera actual/, /^(\d+\.\s*)?valor actual$/, /valor actual/, /valor vigente/, /saldo actual/];
  for(const re of patrones){ const hallada = n.find(x => re.test(x.t)); if(hallada) return hallada.c; }
  return '';
}
const aNumero = v => (typeof v === 'number' ? v : (/^-?\d+(\.\d+)?$/.test(String(v ?? '').trim()) ? Number(String(v).trim()) : null));
const FORMATO_DINERO = '"$" #,##0.00';
const esColumnaDinero = c => /valor/.test(normalize(c));

const numero = v => { const n = Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };

/** El número corto de un proceso («2015-00826», «2015 00826», «2015-826»…) en una forma única para comparar. */
export function claveProceso(v){
  const t = String(v ?? '').trim();
  const m = /(\d{4})\D+0*(\d{1,5})\b/.exec(t);
  return m ? m[1] + '-' + m[2].padStart(5, '0') : normalize(t);
}

/** La columna del archivo de desistimientos que dice a qué proceso pertenece cada recobro («RADICACIÓN PROCESO»). */
export function columnaProceso(columnas){
  return columnas.find(c => /radicacion\s+proceso/.test(normalize(c))) || columnas.find(c => normalize(c).trim() === 'proceso') || '';
}

/** Los procesos que trae el archivo de desistimientos, con cuántas filas tiene cada uno (de más a menos). */
export function procesosDelArchivo(archivo){
  if(!archivo || !archivo.filas) return [];
  const col = columnaProceso(archivo.columnas || []);
  if(!col) return [];
  const cuenta = new Map();
  archivo.filas.forEach(f => { const k = claveProceso(f[col]); if(k) cuenta.set(k, (cuenta.get(k) || 0) + 1); });
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([proceso, filas]) => ({ proceso, filas }));
}

/** El proceso de la demanda que se está cruzando: el número corto del nombre de la base («Base de datos No. 2015-00826»), o del peritaje, o el que más trae la columna PROCESO del peritaje. */
export function sugerirProcesoCorto(archivos){
  const deNombre = a => { const m = /(\d{4})\D{1,3}(\d{5})/.exec(String(a.nombre || '')); return m ? m[1] + '-' + m[2] : ''; };
  const base = archivos.find(a => a.rol === 'base'), peri = archivos.find(a => a.rol === 'peritaje');
  const n = (base && deNombre(base)) || (peri && deNombre(peri));
  if(n) return n;
  if(peri && peri.filas){
    const col = peri.columnas.find(c => normalize(c).trim() === 'proceso');
    if(col){ const cuenta = new Map(); peri.filas.forEach(f => { const k = claveProceso(f[col]); if(k) cuenta.set(k, (cuenta.get(k) || 0) + 1); }); const top = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]; if(top) return top[0]; }
  }
  return '';
}

/**
 * El proceso de los desistimientos que corresponde a esta demanda: el que más radicados de la base de la demanda tiene en la columna «RADICACIÓN PROCESO» del archivo de desistimientos.
 * Sirve cuando el número del nombre del archivo es el de una reforma o de otro proceso (p. ej. «reforma 2017-00008», cuyos desistimientos están bajo el 2010-00398).
 */
export function sugerirProcesoDesdeDesistimientos(base, des){
  if(!base || !des || !base.filas || !des.filas) return '';
  const col = columnaProceso(des.columnas || []);
  if(!col) return '';
  const llaves = new Set();
  base.filas.forEach(f => { const k = normalizarLlave(f[base.columnaLlave]); if(k) llaves.add(k); });
  const cuenta = new Map();
  des.filas.forEach(f => { const k = normalizarLlave(f[des.columnaLlave]); if(!k || !llaves.has(k)) return; const p = claveProceso(f[col]); if(p) cuenta.set(p, (cuenta.get(p) || 0) + 1); });
  const top = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : '';
}

/** Análisis tipo analista de datos de los archivos que se cruzan entre sí (sin los de desistimientos): por archivo, cuántas filas, llaves únicas, repetidas y vacías; y en cuántos archivos está cada llave. */
export function analizarArchivos(archivos){
  const porArchivo = archivos.map(a => {
    const cuenta = new Map();
    let sinLlave = 0;
    a.filas.forEach(f => { const k = normalizarLlave(f[a.columnaLlave]); if(!k){ sinLlave++; return; } cuenta.set(k, (cuenta.get(k) || 0) + 1); });
    const repetidas = [...cuenta.entries()].filter(([, n]) => n > 1);
    const valor = a.columnaValor ? a.filas.reduce((s, f) => s + (aNumero(f[a.columnaValor]) ?? 0), 0) : null;
    return { nombre: a.nombre, rol: a.rol, columnaValor: a.columnaValor || '', valor, filas: a.filas.length, sinLlave, llavesUnicas: cuenta.size, llavesRepetidas: repetidas.length, filasDeLlavesRepetidas: repetidas.reduce((s, [, n]) => s + n, 0),
      ejemplosRepetidas: repetidas.sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, n]) => k + ' (' + n + ' filas)'), llaves: new Set(cuenta.keys()) };
  });
  const todas = new Set(); porArchivo.forEach(p => p.llaves.forEach(k => todas.add(k)));
  const cobertura = new Map();
  todas.forEach(k => {
    const en = porArchivo.map((p, i) => p.llaves.has(k) ? i : -1).filter(i => i >= 0);
    const etiqueta = en.length === porArchivo.length ? 'En todos los archivos' : (en.length === 1 ? 'Solo en ' + porArchivo[en[0]].nombre : 'En ' + en.map(i => porArchivo[i].nombre).join(' y '));
    cobertura.set(etiqueta, (cobertura.get(etiqueta) || 0) + 1);
  });
  return { porArchivo: porArchivo.map(({ llaves, ...resto }) => resto), llavesTotales: todas.size, cobertura: [...cobertura.entries()].sort((a, b) => b[1] - a[1]).map(([etiqueta, llaves]) => ({ etiqueta, llaves })) };
}

/**
 * Las hojas especiales del cruce:
 *  · Peritaje → «Peritaje CUMPLE»: solo las filas cuya columna de cumplimiento de requisitos esenciales dice CUMPLE (todas las columnas del peritaje).
 *  · Desistimientos → «Desistimientos cruzados»: las filas del archivo de desistimientos cuyo radicado está en la base de la demanda o en el peritaje, con todas sus columnas y una más:
 *    si ese radicado sigue VIGENTE en la base de la demanda o NO está en ella.
 * Devuelve { hojas:[{ nombre, columnas, extras, filas }], info }.
 */
export function armarHojasEspeciales(archivos, procesoCorto = ''){
  const base = archivos.find(a => a.rol === 'base') || archivos.find(a => a.rol === 'generico');
  const peri = archivos.find(a => a.rol === 'peritaje');
  const des = archivos.find(a => a.rol === 'desistimientos');
  const llavesDe = a => { const s = new Set(); a.filas.forEach(f => { const k = normalizarLlave(f[a.columnaLlave]); if(k) s.add(k); }); return s; };
  const setBase = base ? llavesDe(base) : null, setPeri = peri ? llavesDe(peri) : null;
  const hojas = [], info = {};
  if(peri){
    if(peri.columnaCumplimiento){
      const cumple = peri.filas.filter(f => normalize(String(f[peri.columnaCumplimiento] || '')).trim() === 'cumple');
      const filas = cumple.map(f => setBase ? { ...f, __enBase: setBase.has(normalizarLlave(f[peri.columnaLlave])) ? 'Sí' : 'No' } : f);
      hojas.push({ nombre: 'Peritaje CUMPLE', columnas: peri.columnas, extras: setBase ? [{ key: '__enBase', header: 'En la base de la demanda' }] : [], filas, columnaLlave: peri.columnaLlave, columnaValor: peri.columnaValor || '' });
      const llavesCumple = new Set(cumple.map(f => normalizarLlave(f[peri.columnaLlave])).filter(Boolean));
      info.peritaje = { archivo: peri.nombre, columna: peri.columnaCumplimiento, filasTotales: peri.filas.length, cumple: cumple.length, noCumple: peri.filas.filter(f => normalize(String(f[peri.columnaCumplimiento] || '')).trim() === 'no cumple').length, llavesCumple: llavesCumple.size, columnaValor: peri.columnaValor || '', valorCumple: peri.columnaValor ? cumple.reduce((s, f) => s + (aNumero(f[peri.columnaValor]) ?? 0), 0) : null };
    }else info.peritajeSinColumna = true;
  }
  if(des){
    // Los demás archivos que no son la base ni el peritaje (p. ej. la «Base depurada»): una columna Sí/No por cada uno, para ver en cuáles sigue estando el radicado.
    const otros = archivos.filter(a => a !== base && a !== peri && a !== des && a.rol !== 'desistimientos').map(a => ({ nombre: a.nombre, llaves: llavesDe(a) }));
    // Con el número corto del proceso (RADICACIÓN PROCESO) se toman TODOS los desistimientos de esa demanda, como si se filtrara el proceso en el Excel y se copiara a una hoja nueva;
    // sin proceso (o sin esa columna) se toman los que cruzan por radicado con la base, el peritaje u otro archivo.
    const colProceso = columnaProceso(des.columnas);
    const porProceso = !!procesoCorto && !!colProceso;
    const claveBuscada = claveProceso(procesoCorto);
    const filas = [];
    des.filas.forEach(f => {
      const k = normalizarLlave(f[des.columnaLlave]);
      if(porProceso ? claveProceso(f[colProceso]) !== claveBuscada : !k) return;
      const enBase = !!setBase && !!k && setBase.has(k), enPeri = !!setPeri && !!k && setPeri.has(k);
      const enOtros = otros.map(o => !!k && o.llaves.has(k));
      if(!porProceso && !enBase && !enPeri && !enOtros.some(Boolean)) return;
      const fila = { ...f, __vigente: setBase ? (enBase ? 'Vigente en la base de la demanda' : 'No está en la base de la demanda') : '', __enPeritaje: setPeri ? (enPeri ? 'Sí' : 'No') : '' };
      otros.forEach((o, i) => { fila['__otro' + i] = enOtros[i] ? 'Sí' : 'No'; });
      filas.push(fila);
    });
    const extras = [];
    if(setBase) extras.push({ key: '__vigente', header: 'Anotación: vigente o no en la base de la demanda' });
    if(setPeri) extras.push({ key: '__enPeritaje', header: 'En el peritaje' });
    otros.forEach((o, i) => extras.push({ key: '__otro' + i, header: 'En ' + o.nombre }));
    const colADesistir = des.columnas.find(c => /valor a desistir/.test(normalize(c)));
    const colVigenteD = des.columnas.find(c => /valor vigente/.test(normalize(c)));
    const colOficioD = des.columnas.find(c => /cantidad de oficio/.test(normalize(c)));
    const colPronD = des.columnas.find(c => /pronunciamiento/.test(normalize(c)));
    hojas.push({ nombre: porProceso ? 'Desistimientos ' + claveBuscada : 'Desistimientos cruzados', columnas: des.columnas, extras, filas, columnaLlave: des.columnaLlave, columnaValor: colADesistir || des.columnaValor || '',
      resumenAnotaciones: setBase ? { keyAnot: '__vigente', colADesistir: colADesistir || '', colVigente: colVigenteD || '', colOficio: colOficioD || '', colPron: colPronD || '' } : null });
    const colDesistir = des.columnas.find(c => /valor a desistir/.test(normalize(c))), colVigente = des.columnas.find(c => /valor vigente/.test(normalize(c)));
    const colOficio = des.columnas.find(c => /cantidad de oficio/.test(normalize(c))), colPron = des.columnas.find(c => /pronunciamiento/.test(normalize(c)));
    const grupos = new Map();
    if(colOficio) filas.forEach(f => {
      const oficio = String(f[colOficio] ?? '').trim() || '(sin oficio)', pron = colPron ? String(f[colPron] ?? '').trim() : '';
      const k = oficio + '|' + pron;
      if(!grupos.has(k)) grupos.set(k, { oficio, pronunciamiento: pron, recobros: 0, valorADesistir: 0 });
      const g = grupos.get(k); g.recobros++; if(colADesistir) g.valorADesistir += numero(f[colADesistir]);
    });
    const porOficio = [...grupos.values()].sort((x, y) => x.oficio.localeCompare(y.oficio, 'es', { numeric: true }));
    // Resultado de las anotaciones (mismo contenido de la tabla de la hoja de desistimientos): por anotación, y por oficio + pronunciamiento + anotación.
    const anotDe = f => String(f.__vigente ?? '').trim() || '(sin anotación)';
    const grAnot = new Map(), grOfAnot = new Map();
    filas.forEach(f => {
      const a = anotDe(f);
      if(!grAnot.has(a)) grAnot.set(a, { anotacion: a, recobros: 0, valorADesistir: 0, valorVigente: 0 });
      const g = grAnot.get(a); g.recobros++; if(colADesistir) g.valorADesistir += numero(f[colADesistir]); if(colVigente) g.valorVigente += numero(f[colVigente]);
      if(colOficio){
        const of = String(f[colOficio] ?? '').trim() || '(sin oficio)', pr = colPron ? String(f[colPron] ?? '').trim() : '', k = of + '|' + pr + '|' + a;
        if(!grOfAnot.has(k)) grOfAnot.set(k, { oficio: of, pronunciamiento: pr, anotacion: a, recobros: 0, valorADesistir: 0 });
        const h = grOfAnot.get(k); h.recobros++; if(colADesistir) h.valorADesistir += numero(f[colADesistir]);
      }
    });
    const esVig = a => (/^vigente/i.test(a) ? 0 : 1);
    const porAnotacion = [...grAnot.values()].sort((x, y) => esVig(x.anotacion) - esVig(y.anotacion) || x.anotacion.localeCompare(y.anotacion, 'es'));
    const porOficioAnotacion = [...grOfAnot.values()].sort((x, y) => x.oficio.localeCompare(y.oficio, 'es', { numeric: true }) || x.pronunciamiento.localeCompare(y.pronunciamiento, 'es') || esVig(x.anotacion) - esVig(y.anotacion));
    info.desistimientos = { archivo: des.nombre, porOficio, porAnotacion, porOficioAnotacion, proceso: porProceso ? claveBuscada : '', sinColumnaProceso: !!procesoCorto && !colProceso, hoja: porProceso ? 'Desistimientos ' + claveBuscada : 'Desistimientos cruzados', filasTotales: des.filas.length, cruzan: filas.length, vigentes: filas.filter(f => String(f.__vigente).startsWith('Vigente')).length,
      noEstanEnBase: filas.filter(f => String(f.__vigente).startsWith('No está')).length, valorADesistir: colDesistir ? filas.reduce((s, f) => s + numero(f[colDesistir]), 0) : null, valorVigente: colVigente ? filas.reduce((s, f) => s + numero(f[colVigente]), 0) : null };
  }
  return { hojas, info };
}

// Cruza de 2 a 3 archivos ya leídos: `archivos` = [{ nombre, columnaLlave,
// columnas, filas }, ...]. Devuelve:
//   - resumen: una fila por cada llave única (unión de las de todos los
//     archivos), con cuántos registros tiene esa llave en cada archivo y
//     una Observación (ausente en algún archivo, o cantidad de registros
//     distinta entre archivos — pedido explícito del usuario: "cantidad de
//     ítems" es justo esto, cuántos registros únicos hay por llave).
//   - porArchivo: para cada archivo, sus filas ORIGINALES (todas sus
//     columnas intactas) más una Observación por fila con lo que encontró
//     el cruce para la llave de esa fila.
export function compararArchivos(archivos){
  const gruposPorArchivo = archivos.map(a => {
    const grupos = new Map();
    a.filas.forEach(fila => {
      const llave = normalizarLlave(fila[a.columnaLlave]);
      if(!llave) return;
      if(!grupos.has(llave)) grupos.set(llave, []);
      grupos.get(llave).push(fila);
    });
    return grupos;
  });

  const todasLasLlaves = new Set();
  gruposPorArchivo.forEach(grupos => grupos.forEach((_, llave) => todasLasLlaves.add(llave)));

  const resumen = Array.from(todasLasLlaves).sort().map(llave => {
    const cantidades = gruposPorArchivo.map(grupos => grupos.get(llave)?.length || 0);
    const presentes = cantidades.filter(c => c > 0).length;
    const observaciones = [];
    if(presentes < archivos.length){
      const faltantes = archivos.filter((a,i) => cantidades[i] === 0).map(a => a.nombre);
      observaciones.push(`No está en: ${faltantes.join(', ')}`);
    }
    const cantidadesConDatos = cantidades.filter(c => c > 0);
    if(cantidadesConDatos.length > 1 && new Set(cantidadesConDatos).size > 1){
      observaciones.push(`Cantidad de registros distinta entre archivos (${archivos.map((a,i) => `${a.nombre}: ${cantidades[i]}`).join(', ')})`);
    }
    const fila = { llave };
    archivos.forEach((a,i) => { fila[`cantidad_${i}`] = cantidades[i]; });
    fila.observacion = observaciones.join(' — ') || "OK";
    return fila;
  });

  const porArchivo = archivos.map((a, i) => {
    const otros = archivos.map((_, j) => j).filter(j => j !== i);
    const filasConObservacion = a.filas.map(fila => {
      const llave = normalizarLlave(fila[a.columnaLlave]);
      const observaciones = [];
      if(llave){
        const cantidadPropia = gruposPorArchivo[i].get(llave)?.length || 0;
        otros.forEach(j => {
          const cantidadOtro = gruposPorArchivo[j].get(llave)?.length || 0;
          if(cantidadOtro === 0) observaciones.push(`No está en ${archivos[j].nombre}`);
          else if(cantidadOtro !== cantidadPropia) observaciones.push(`${archivos[j].nombre} tiene ${cantidadOtro} registro(s) para esta llave (acá hay ${cantidadPropia})`);
        });
      } else {
        observaciones.push("Sin valor en la columna de cruce");
      }
      return { ...fila, __observacion: observaciones.join(' — ') || "OK" };
    });
    return { nombre: a.nombre, nombreHoja: a.nombreHoja || '', columnas: a.columnas, filas: filasConObservacion };
  });

  return { resumen, porArchivo };
}

// Tabla tipo «tabla dinámica» con el RESULTADO DE LAS ANOTACIONES (2026-11-17, pedido del usuario: «agrega en la misma hoja una tabla dinámica con el resultado de anotaciones»): va en la misma hoja
// de desistimientos, a la derecha de los datos (una columna en blanco de por medio), arriba, para verla sin bajar. Son fórmulas de Excel (CONTAR.SI / SUMAR.SI), así que se recalculan si se
// corrige alguna fila. Primero el resultado por anotación (recobros, valor a desistir y valor vigente) y debajo el detalle por oficio y anotación, como la tabla dinámica del usuario.
function escribirTablaAnotaciones(ws, cols, filas, meta){
  const colDe = k => cols.findIndex(c => c.key === k) + 1;
  const colHeader = h => (h ? cols.findIndex(c => c.header === h) + 1 : 0);
  const cAnot = colDe(meta.keyAnot);
  if(!cAnot || !filas.length) return;
  const cDes = colHeader(meta.colADesistir), cVig = colHeader(meta.colVigente), cOf = colHeader(meta.colOficio), cPr = colHeader(meta.colPron);
  const ult = filas.length + 1;
  const L = n => ws.getColumn(n).letter;
  const rng = n => '$' + L(n) + '$2:$' + L(n) + '$' + ult;
  const ini = cols.length + 2;
  const val = (f, h) => (h ? numero(f[h]) : 0);
  const sinFiltro = f => String(f[meta.keyAnot] ?? '').trim() || '(sin anotación)';
  const estiloTitulo = c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } }; c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { horizontal: 'left', vertical: 'middle' }; };
  const estiloEnc = c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE9F7' } }; c.font = { name: 'Calibri', size: 11, bold: true }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; };
  const estiloDato = c => { c.border = { top: { style: 'thin', color: { argb: 'FFB8CCE4' } }, bottom: { style: 'thin', color: { argb: 'FFB8CCE4' } }, left: { style: 'thin', color: { argb: 'FFB8CCE4' } }, right: { style: 'thin', color: { argb: 'FFB8CCE4' } } }; };
  const celda = (r, n) => ws.getRow(r).getCell(n);
  [ini, ini + 1, ini + 2, ini + 3, ini + 4].forEach((n, i) => { ws.getColumn(n).width = i === 0 ? 36 : (i === 1 ? 26 : 22); });

  // ---- Bloque 1: resultado por anotación
  let r = 1;
  celda(r, ini).value = 'Resultado de las anotaciones'; for(let k = 0; k < 4; k++) estiloTitulo(celda(r, ini + k));
  r++;
  ['Anotación', 'Recobros', 'Valor a desistir', 'Valor vigente'].forEach((t, k) => { const c = celda(r, ini + k); c.value = t; estiloEnc(c); });
  const anots = [...new Set(filas.map(sinFiltro))].sort((a, b) => (/^vigente/i.test(a) ? 0 : 1) - (/^vigente/i.test(b) ? 0 : 1) || a.localeCompare(b, 'es'));
  const primera = r + 1;
  anots.forEach(a => {
    r++;
    const dels = filas.filter(f => sinFiltro(f) === a);
    const cA = celda(r, ini); cA.value = a; estiloDato(cA);
    const cN = celda(r, ini + 1); cN.value = { formula: 'COUNTIF(' + rng(cAnot) + ',' + L(ini) + r + ')', result: dels.length }; estiloDato(cN);
    const cD = celda(r, ini + 2); cD.value = cDes ? { formula: 'SUMIF(' + rng(cAnot) + ',' + L(ini) + r + ',' + rng(cDes) + ')', result: dels.reduce((t, f) => t + val(f, meta.colADesistir), 0) } : 0; cD.numFmt = FORMATO_DINERO; estiloDato(cD);
    const cV = celda(r, ini + 3); cV.value = cVig ? { formula: 'SUMIF(' + rng(cAnot) + ',' + L(ini) + r + ',' + rng(cVig) + ')', result: dels.reduce((t, f) => t + val(f, meta.colVigente), 0) } : 0; cV.numFmt = FORMATO_DINERO; estiloDato(cV);
  });
  r++;
  const ultimaA = r - 1;
  const tot = [['Total general', null], ['', 'B'], ['', 'C'], ['', 'D']];
  celda(r, ini).value = 'Total general';
  [1, 2, 3].forEach(k => {
    const c = celda(r, ini + k);
    const suma = anots.reduce((t, a) => { const dels = filas.filter(f => sinFiltro(f) === a); return t + (k === 1 ? dels.length : dels.reduce((x, f) => x + val(f, k === 2 ? meta.colADesistir : meta.colVigente), 0)); }, 0);
    c.value = { formula: 'SUM(' + L(ini + k) + primera + ':' + L(ini + k) + ultimaA + ')', result: suma };
    if(k > 1) c.numFmt = FORMATO_DINERO;
  });
  for(let k = 0; k < 4; k++){ const c = celda(r, ini + k); c.font = { name: 'Calibri', size: 11, bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EFEE' } }; estiloDato(c); }

  // ---- Bloque 2: por oficio y anotación (como la tabla dinámica del usuario)
  if(cOf){
    r += 2;
    celda(r, ini).value = 'Por oficio y anotación'; for(let k = 0; k < 5; k++) estiloTitulo(celda(r, ini + k));
    r++;
    ['Oficio', 'Pronunciamiento del juez', 'Anotación', 'Recobros', 'Valor a desistir'].forEach((t, k) => { const c = celda(r, ini + k); c.value = t; estiloEnc(c); });
    const grupos = new Map();
    filas.forEach(f => {
      const of = String(f[meta.colOficio] ?? '').trim() || '(sin oficio)', pr = cPr ? String(f[meta.colPron] ?? '').trim() : '', an = sinFiltro(f);
      const k = of + '|' + pr + '|' + an;
      if(!grupos.has(k)) grupos.set(k, { of, pr, an, n: 0, v: 0 });
      const g = grupos.get(k); g.n++; g.v += val(f, meta.colADesistir);
    });
    const lista = [...grupos.values()].sort((a, b) => a.of.localeCompare(b.of, 'es', { numeric: true }) || a.pr.localeCompare(b.pr, 'es') || (/^vigente/i.test(b.an) ? 1 : 0) - (/^vigente/i.test(a.an) ? 1 : 0));
    const ini2 = r + 1;
    lista.forEach(g => {
      r++;
      [g.of, g.pr, g.an].forEach((t, k) => { const c = celda(r, ini + k); c.value = t; estiloDato(c); });
      const a1 = L(ini) + r, a2 = L(ini + 1) + r, a3 = L(ini + 2) + r;
      const crit = rng(cOf) + ',' + a1 + (cPr ? ',' + rng(cPr) + ',' + a2 : '') + ',' + rng(cAnot) + ',' + a3;
      const cN = celda(r, ini + 3); cN.value = { formula: 'COUNTIFS(' + crit + ')', result: g.n }; estiloDato(cN);
      const cV = celda(r, ini + 4); cV.value = cDes ? { formula: 'SUMIFS(' + rng(cDes) + ',' + crit + ')', result: g.v } : 0; cV.numFmt = FORMATO_DINERO; estiloDato(cV);
    });
    r++;
    celda(r, ini).value = 'Total general';
    const c4 = celda(r, ini + 3); c4.value = { formula: 'SUM(' + L(ini + 3) + ini2 + ':' + L(ini + 3) + (r - 1) + ')', result: lista.reduce((t, g) => t + g.n, 0) };
    const c5 = celda(r, ini + 4); c5.value = { formula: 'SUM(' + L(ini + 4) + ini2 + ':' + L(ini + 4) + (r - 1) + ')', result: lista.reduce((t, g) => t + g.v, 0) }; c5.numFmt = FORMATO_DINERO;
    for(let k = 0; k < 5; k++){ const c = celda(r, ini + k); c.font = { name: 'Calibri', size: 11, bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EFEE' } }; estiloDato(c); }
  }
}

function encabezarHoja(ws, columnas){
  ws.columns = columnas;
  ws.getRow(1).eachCell(cell => {
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb: COLOR_ENCABEZADO} };
    cell.font = { name:'Calibri', size:11, bold:true, color:{argb:'FFFFFFFF'} };
    cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
  });
  ws.views = [{ state:'frozen', ySplit:1 }];
}

// Pie de cada hoja de datos (2026-11-09, pedido del usuario: «en todas las hojas subtotales de la columna Valor de cartera Actual — siempre valor actual o similar — y un conteo de
// recobros únicos por la misma columna que se cruza»): las columnas de dinero se escriben como NÚMEROS (con formato de pesos y a la derecha) y debajo de los datos van, tras una fila en
// blanco, el SUBTOTAL de cada columna de valor (fórmula de Excel: se ajusta a lo que dejes visible al filtrar), las filas visibles y los recobros ÚNICOS por la columna llave.
function escribirDatosConPie(ws, cols, filas, { columnaLlave, columnaValor }){
  const idx = key => cols.findIndex(c => c.key === key) + 1;
  const dinero = cols.filter(c => esColumnaDinero(c.header) || c.key === columnaValor).map(c => c.key);
  const sumas = new Map(dinero.map(k => [k, 0]));
  filas.forEach(f => {
    const fila = { ...f };
    dinero.forEach(k => { const n = aNumero(fila[k]); if(n !== null){ fila[k] = n; sumas.set(k, sumas.get(k) + n); } });
    const row = ws.addRow(fila);
    dinero.forEach(k => { const c = row.getCell(idx(k)); if(typeof c.value === 'number'){ c.numFmt = FORMATO_DINERO; c.alignment = { horizontal: 'right' }; } });
  });
  if(!filas.length) return;
  const ultima = filas.length + 1;
  const letra = n => ws.getColumn(n).letter;
  const llaves = new Set(filas.map(f => normalizarLlave(f[columnaLlave])).filter(Boolean));
  // Cuadro del pie, como lo pidió el usuario (2026-11-09): debajo de la columna de valor, «VALOR» con el subtotal y al lado «RECOBROS» con la cantidad de recobros únicos. Ambos son fórmulas de
  // Excel que siguen lo que se deje visible al filtrar (con el resultado ya calculado); sin columna de valor solo va «RECOBROS», debajo de la columna llave.
  const colLlave = idx(columnaLlave) || 1;
  const colValor = columnaValor ? idx(columnaValor) : 0;
  const colRec = colValor ? colValor + 1 : colLlave;
  const colIni = colValor || colLlave;
  const rl = letra(colLlave), rango = rl + '2:' + rl + ultima;
  const fUnicos = 'SUMPRODUCT(SUBTOTAL(103,OFFSET(' + rl + '2,ROW(' + rango + ')-ROW(' + rl + '2),0))/COUNTIF(' + rango + ',' + rango + '&))';
  const borde = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  ws.addRow([]); ws.addRow([]);
  const rEnc = ws.addRow([]), rVal = ws.addRow([]);
  if(colValor){
    const cEnc = rEnc.getCell(colValor); cEnc.value = 'VALOR';
    const cVal = rVal.getCell(colValor); cVal.value = { formula: 'SUBTOTAL(109,' + letra(colValor) + '2:' + letra(colValor) + ultima + ')', result: sumas.get(columnaValor) || 0 }; cVal.numFmt = FORMATO_DINERO;
    ws.getColumn(colValor).width = Math.max(ws.getColumn(colValor).width || 0, 24);
  }
  rEnc.getCell(colRec).value = 'RECOBROS';
  rVal.getCell(colRec).value = { formula: fUnicos, result: llaves.size };
  ws.getColumn(colRec).width = Math.max(ws.getColumn(colRec).width || 0, 16);
  for(let n = colIni; n <= colRec; n++){
    [rEnc.getCell(n), rVal.getCell(n)].forEach(c => { c.border = borde; c.alignment = { horizontal: 'center', vertical: 'middle' }; });
    rEnc.getCell(n).font = { name: 'Calibri', size: 12, bold: true };
    rVal.getCell(n).font = { name: 'Calibri', size: 14, bold: true };
  }
}

// Excel de salida con una hoja "Revisión" (resumen, una fila por llave
// única) + una hoja por cada archivo subido (todas sus columnas
// originales + Observación) — pedido explícito del usuario 2026-09-03.
export async function generarExcelCruce(nombreArchivo, archivos, { resumen, porArchivo }, extra = {}){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const { analisis, hojasEspeciales, infoEspecial, copias } = extra;

  // Hoja «Resumen» (lo primero que se ve): lo que encontró el análisis, en renglones simples.
  if(analisis || infoEspecial){
    const ws = wb.addWorksheet('Resumen');
    ws.columns = [{ width: 46 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 34 }, { width: 22 }, { width: 50 }];
    const titulo = texto => { const r = ws.addRow([texto]); r.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } }; r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } }; }); ws.mergeCells(r.number, 1, r.number, 8); };
    const encab = (...cols) => { const r = ws.addRow(cols); r.font = { bold: true }; r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EFEE' } }; }); };
    const nf = n => (n == null ? '' : Number(n));
    if(analisis){
      titulo('Los archivos cruzados');
      encab('Archivo', 'Filas', 'Recobros únicos', 'Filas sin llave', 'Llaves repetidas', 'Columna de valor', 'Subtotal del valor', 'Ejemplos de llaves repetidas');
      analisis.porArchivo.forEach(p => { const r = ws.addRow([p.nombre, p.filas, p.llavesUnicas, p.sinLlave, p.llavesRepetidas, p.columnaValor, p.valor == null ? '' : p.valor, p.ejemplosRepetidas.join(', ')]); r.getCell(7).numFmt = FORMATO_DINERO; });
      ws.addRow([]);
      titulo('En cuántos archivos está cada llave (' + analisis.llavesTotales + ' llaves en total)');
      encab('Dónde está', 'Llaves');
      analisis.cobertura.forEach(c => ws.addRow([c.etiqueta, c.llaves]));
      ws.addRow([]);
    }
    if(infoEspecial?.peritaje){
      const p = infoEspecial.peritaje;
      titulo('Peritaje — ' + p.columna);
      ws.addRow(['Filas del peritaje', nf(p.filasTotales)]); ws.addRow(['Filas que CUMPLEN (hoja «Peritaje CUMPLE»)', nf(p.cumple)]); ws.addRow(['Filas que NO CUMPLEN', nf(p.noCumple)]); ws.addRow(['Radicados distintos que cumplen', nf(p.llavesCumple)]);
      if(p.valorCumple != null){ const r = ws.addRow(['Subtotal de «' + p.columnaValor + '» de las filas que CUMPLEN', nf(p.valorCumple)]); r.getCell(2).numFmt = FORMATO_DINERO; }
      ws.addRow([]);
    }
    if(infoEspecial?.peritajeSinColumna){ titulo('Peritaje'); ws.addRow(['No se eligió la columna de cumplimiento de requisitos esenciales: no se armó la hoja «Peritaje CUMPLE».']); ws.addRow([]); }
    if(infoEspecial?.desistimientos){
      const d = infoEspecial.desistimientos;
      titulo('Desistimientos — ' + d.archivo);
      ws.addRow(['Filas del archivo de desistimientos', nf(d.filasTotales)]);
      ws.addRow([d.proceso ? 'Desistimientos del proceso ' + d.proceso + ' (hoja «' + d.hoja + '»)' : 'Filas que cruzan con la base o el peritaje (hoja «' + d.hoja + '»)', nf(d.cruzan)]);
      ws.addRow(['De ellas, vigentes en la base de la demanda', nf(d.vigentes)]); ws.addRow(['De ellas, que NO están en la base de la demanda', nf(d.noEstanEnBase)]);
      if(d.sinColumnaProceso) ws.addRow(['Ojo: el archivo no trae una columna «RADICACIÓN PROCESO»; se cruzó por radicado.']);
      if(d.valorADesistir != null){ const r = ws.addRow(['Suma de «Valor a desistir» de esas filas', nf(d.valorADesistir)]); r.getCell(2).numFmt = '"$" #,##0.00'; }
      if(d.valorVigente != null){ const r = ws.addRow(['Suma de «Valor vigente» de esas filas', nf(d.valorVigente)]); r.getCell(2).numFmt = '"$" #,##0.00'; }
      if(d.porOficio && d.porOficio.length){
        ws.addRow([]);
        encab('Por oficio', 'Pronunciamiento del juez', 'Recobros', 'Suma de Valor a desistir');
        d.porOficio.forEach(g => { const r = ws.addRow([g.oficio, g.pronunciamiento, g.recobros, g.valorADesistir]); r.getCell(4).numFmt = '"$" #,##0.00'; });
        const tot = ws.addRow(['Total general', '', d.porOficio.reduce((s, g) => s + g.recobros, 0), d.porOficio.reduce((s, g) => s + g.valorADesistir, 0)]);
        tot.font = { bold: true }; tot.getCell(4).numFmt = '"$" #,##0.00';
      }
      if(d.porAnotacion && d.porAnotacion.length){
        ws.addRow([]);
        encab('Resultado de las anotaciones', 'Recobros', 'Valor a desistir', 'Valor vigente');
        d.porAnotacion.forEach(g => { const r = ws.addRow([g.anotacion, g.recobros, g.valorADesistir, g.valorVigente]); r.getCell(3).numFmt = '"$" #,##0.00'; r.getCell(4).numFmt = '"$" #,##0.00'; });
        const t2 = ws.addRow(['Total general', d.porAnotacion.reduce((s, g) => s + g.recobros, 0), d.porAnotacion.reduce((s, g) => s + g.valorADesistir, 0), d.porAnotacion.reduce((s, g) => s + g.valorVigente, 0)]);
        t2.font = { bold: true }; t2.getCell(3).numFmt = '"$" #,##0.00'; t2.getCell(4).numFmt = '"$" #,##0.00';
      }
      if(d.porOficioAnotacion && d.porOficioAnotacion.length){
        ws.addRow([]);
        encab('Por oficio y anotación', 'Pronunciamiento del juez', 'Anotación', 'Recobros', 'Valor a desistir');
        d.porOficioAnotacion.forEach(g => { const r = ws.addRow([g.oficio, g.pronunciamiento, g.anotacion, g.recobros, g.valorADesistir]); r.getCell(5).numFmt = '"$" #,##0.00'; });
        const t3 = ws.addRow(['Total general', '', '', d.porOficioAnotacion.reduce((s, g) => s + g.recobros, 0), d.porOficioAnotacion.reduce((s, g) => s + g.valorADesistir, 0)]);
        t3.font = { bold: true }; t3.getCell(5).numFmt = '"$" #,##0.00';
      }
    }
  }

  // La hoja «Revisión» solo se arma si hay llaves que revisar (con un solo archivo cruzado, como en «Cruce Desistimientos», no hay nada que revisar).
  if(resumen.length){
  const wsRevision = wb.addWorksheet("Revisión");
  const columnasRevision = [
    { header:"Llave", key:"llave", width:24 },
    ...archivos.map((a,i) => ({ header:`Registros en ${a.nombre}`, key:`cantidad_${i}`, width:22 })),
    { header:"Observación", key:"observacion", width:50 },
  ];
  encabezarHoja(wsRevision, columnasRevision);
  resumen.forEach(f => wsRevision.addRow(f));
  if(resumen.length){
    wsRevision.addRow([]);
    const ult = resumen.length + 1, pie = wsRevision.addRow([]);
    pie.getCell(1).value = 'TOTAL (' + resumen.length + ' llaves)';
    archivos.forEach((a, i) => { const n = i + 2, c = pie.getCell(n); c.value = { formula: 'SUBTOTAL(109,' + wsRevision.getColumn(n).letter + '2:' + wsRevision.getColumn(n).letter + ult + ')', result: resumen.reduce((s, f) => s + (f['cantidad_' + i] || 0), 0) }; });
    pie.eachCell({ includeEmpty: true }, (c, n) => { if(n <= archivos.length + 2){ c.font = { name: 'Calibri', bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EFEE' } }; } });
  }
  }

  // Bug real 2026-09-03, reportado por el usuario ("Worksheet name already
  // exists"): 2 archivos con nombres largos y parecidos (ej. "CUADRO ANEXO
  // DEMANDA 2016-00465.xlsx" y "...00466.xlsx") recortaban al mismo texto
  // de 28 caracteres — justo lo que los distinguía quedaba fuera del
  // recorte. Se lleva un registro de los nombres de hoja ya usados y, si
  // el recorte se repite, se le agrega un número al final hasta que sea
  // único (sin pasarse nunca de los 31 caracteres que permite Excel).
  const nombresDeHojaUsados = new Set(["Resumen", "Revisión"]);
  function nombreDeHojaUnico(nombre){
    const base = nombre.replace(/[\\/*?:[\]]/g, '').slice(0, 28) || "Archivo";
    if(!nombresDeHojaUsados.has(base)){ nombresDeHojaUsados.add(base); return base; }
    let intento = 2;
    let candidato;
    do{
      const sufijo = ` ${intento}`;
      candidato = base.slice(0, 31 - sufijo.length) + sufijo;
      intento++;
    } while(nombresDeHojaUsados.has(candidato));
    nombresDeHojaUsados.add(candidato);
    return candidato;
  }

  porArchivo.forEach(({ nombre, nombreHoja: etiquetaHoja, columnas, filas }) => {
    // Nombre de hoja de Excel: máximo 31 caracteres, sin ciertos símbolos.
    const nombreHoja = nombreDeHojaUnico(etiquetaHoja || nombre);
    const ws = wb.addWorksheet(nombreHoja);
    const colsHoja = [
      ...columnas.map(c => ({ header:c, key:c, width:18 })),
      { header:"Observación", key:"__observacion", width:50 },
    ];
    encabezarHoja(ws, colsHoja);
    const origen = archivos.find(a => a.nombre === nombre) || {};
    escribirDatosConPie(ws, colsHoja, filas, { columnaLlave: origen.columnaLlave, columnaValor: origen.columnaValor });
  });

  // Hojas especiales (Peritaje CUMPLE, Desistimientos cruzados): todas las columnas del archivo, más las que agrega el cruce.
  (hojasEspeciales || []).forEach(h => {
    const ws = wb.addWorksheet(nombreDeHojaUnico(h.nombre));
    const colsEsp = [...h.columnas.map(c => ({ header: c, key: c, width: 18 })), ...h.extras.map(x => ({ header: x.header, key: x.key, width: 34 }))];
    encabezarHoja(ws, colsEsp);
    escribirDatosConPie(ws, colsEsp, h.filas, { columnaLlave: h.columnaLlave, columnaValor: h.columnaValor });
    if(h.resumenAnotaciones) escribirTablaAnotaciones(ws, colsEsp, h.filas, h.resumenAnotaciones);
  });

  // Copias originales (2026-11-17, «debe haber una hoja con el archivo que se cruza, en este caso la base de la demanda, copia original»): la hoja analizada del archivo tal cual, con sus
  // columnas y filas, sin la columna de observación ni pie (los valores en pesos con formato de pesos).
  (copias || []).forEach(h => {
    const ws = wb.addWorksheet(nombreDeHojaUnico(h.nombre));
    const colsCopia = h.columnas.map(c => ({ header: c, key: c, width: 18 }));
    encabezarHoja(ws, colsCopia);
    const dineroCopia = h.columnas.filter(esColumnaDinero);
    h.filas.forEach(f => {
      const fila = { ...f };
      dineroCopia.forEach(k => { const n = aNumero(fila[k]); if(n !== null) fila[k] = n; });
      const row = ws.addRow(fila);
      dineroCopia.forEach(k => { const c = row.getCell(h.columnas.indexOf(k) + 1); if(typeof c.value === 'number'){ c.numFmt = FORMATO_DINERO; c.alignment = { horizontal: 'right' }; } });
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: h.columnas.length } };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreArchivo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
