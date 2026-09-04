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
  ws.getRow(filaEncabezado).eachCell((cell, colNumero) => { columnas[colNumero] = valorCelda(cell.value); });
  const encabezados = columnas.filter(Boolean);
  if(!encabezados.length) throw new Error(`La hoja "${nombreHoja}" no tiene encabezados reconocibles en las primeras filas.`);

  const filas = [];
  for(let r=filaEncabezado+1; r<=ws.rowCount; r++){
    const row = ws.getRow(r);
    const fila = {};
    let vacia = true;
    columnas.forEach((nombreCol, colNumero) => {
      if(!nombreCol) return;
      const valor = valorCelda(row.getCell(colNumero).value);
      if(valor) vacia = false;
      fila[nombreCol] = valor;
    });
    if(!vacia) filas.push(fila);
  }
  return { columnas: encabezados, filas };
}

function normalizarLlave(v){
  return normalize(String(v||"")).trim();
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
    return { nombre: a.nombre, columnas: a.columnas, filas: filasConObservacion };
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

// Excel de salida con una hoja "Revisión" (resumen, una fila por llave
// única) + una hoja por cada archivo subido (todas sus columnas
// originales + Observación) — pedido explícito del usuario 2026-09-03.
export async function generarExcelCruce(nombreArchivo, archivos, { resumen, porArchivo }){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();

  const wsRevision = wb.addWorksheet("Revisión");
  const columnasRevision = [
    { header:"Llave", key:"llave", width:24 },
    ...archivos.map((a,i) => ({ header:`Registros en ${a.nombre}`, key:`cantidad_${i}`, width:22 })),
    { header:"Observación", key:"observacion", width:50 },
  ];
  encabezarHoja(wsRevision, columnasRevision);
  resumen.forEach(f => wsRevision.addRow(f));

  // Bug real 2026-09-03, reportado por el usuario ("Worksheet name already
  // exists"): 2 archivos con nombres largos y parecidos (ej. "CUADRO ANEXO
  // DEMANDA 2016-00465.xlsx" y "...00466.xlsx") recortaban al mismo texto
  // de 28 caracteres — justo lo que los distinguía quedaba fuera del
  // recorte. Se lleva un registro de los nombres de hoja ya usados y, si
  // el recorte se repite, se le agrega un número al final hasta que sea
  // único (sin pasarse nunca de los 31 caracteres que permite Excel).
  const nombresDeHojaUsados = new Set(["Revisión"]);
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

  porArchivo.forEach(({ nombre, columnas, filas }) => {
    // Nombre de hoja de Excel: máximo 31 caracteres, sin ciertos símbolos.
    const nombreHoja = nombreDeHojaUnico(nombre);
    const ws = wb.addWorksheet(nombreHoja);
    encabezarHoja(ws, [
      ...columnas.map(c => ({ header:c, key:c, width:18 })),
      { header:"Observación", key:"__observacion", width:50 },
    ]);
    filas.forEach(f => ws.addRow(f));
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
