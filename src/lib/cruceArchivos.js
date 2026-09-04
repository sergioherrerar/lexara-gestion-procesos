// "Cruce de archivos" (Informes) — pedido explícito del usuario 2026-09-03:
// cruza 2 o 3 archivos Excel entre sí (típico en conciliaciones de cartera
// con EPS: cada archivo es un corte/reporte distinto del mismo radicado) —
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
export function leerHoja(workbook, nombreHoja){
  const ws = workbook.getWorksheet(nombreHoja);
  if(!ws) throw new Error(`No se encontró la hoja "${nombreHoja}".`);
  const columnas = [];
  ws.getRow(1).eachCell((cell, colNumero) => { columnas[colNumero] = valorCelda(cell.value); });
  const encabezados = columnas.filter(Boolean);
  if(!encabezados.length) throw new Error(`La hoja "${nombreHoja}" no tiene encabezados en la primera fila.`);

  const filas = [];
  for(let r=2; r<=ws.rowCount; r++){
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

// Excel de salida con 4 hojas como máximo — pedido explícito del usuario
// 2026-09-03: "Revisión" (resumen, una fila por llave única) + una hoja
// por archivo subido (todas sus columnas originales + Observación).
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

  porArchivo.forEach(({ nombre, columnas, filas }) => {
    // Nombre de hoja de Excel: máximo 31 caracteres, sin ciertos símbolos.
    const nombreHoja = nombre.replace(/[\\/*?:[\]]/g, '').slice(0, 28) || "Archivo";
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
