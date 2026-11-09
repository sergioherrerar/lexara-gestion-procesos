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
  const patrones = [/ultimo radicado.*myt\s*0102/, /ultimo radicado/, /radicado o entrega/, /^radicado( \(\d+\))?$/, /radicado/];
  for(const re of patrones){ const hallada = n.find(x => re.test(x.t)); if(hallada) return hallada.c; }
  return '';
}

/** La columna del peritaje con el cumplimiento de los requisitos esenciales, por su nombre exacto; '' si no está (entonces la elige el usuario). */
export function sugerirColumnaCumplimiento(columnas){
  const exacta = columnas.find(c => normalize(c).replace(/\s+/g, ' ').trim() === 'cumplimiento esenciales del recobro');
  return exacta || '';
}

/** La columna del VALOR ACTUAL de cada recobro, para los subtotales: «Valor de cartera Actual» (peritaje), «VALOR ACTUAL» (base), «VALOR VIGENTE» (desistimientos) o parecida; '' si ninguna se parece. */
export function sugerirColumnaValor(columnas){
  const n = columnas.map(c => ({ c, t: normalize(c).replace(/\s+/g, ' ') }));
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
    hojas.push({ nombre: porProceso ? 'Desistimientos ' + claveBuscada : 'Desistimientos cruzados', columnas: des.columnas, extras, filas, columnaLlave: des.columnaLlave, columnaValor: des.columnaValor || '' });
    const colDesistir = des.columnas.find(c => /valor a desistir/.test(normalize(c))), colVigente = des.columnas.find(c => /valor vigente/.test(normalize(c)));
    info.desistimientos = { archivo: des.nombre, proceso: porProceso ? claveBuscada : '', sinColumnaProceso: !!procesoCorto && !colProceso, hoja: porProceso ? 'Desistimientos ' + claveBuscada : 'Desistimientos cruzados', filasTotales: des.filas.length, cruzan: filas.length, vigentes: filas.filter(f => String(f.__vigente).startsWith('Vigente')).length,
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
  const { analisis, hojasEspeciales, infoEspecial } = extra;

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
    }
  }

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
