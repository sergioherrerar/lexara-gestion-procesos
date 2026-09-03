// "Revisión de Procesos" (Administración) — pedido explícito del usuario
// 2026-09-03. La empresa que hace vigilancia judicial física manda cada mes
// un Excel con los procesos que ella tiene bajo control; esta pantalla lo
// sube, lo cruza contra Procesos judiciales (la lista real de SharePoint) y
// arma un Excel con las 3 diferencias que de verdad importan:
//   1. Procesos del archivo que NO están en el Portal Lexara.
//   2. Procesos del archivo que SÍ están, pero acá ya figuran Terminados
//      (la vigilancia los sigue reportando como si siguieran activos).
//   3. Procesos VIGENTES en el Portal Lexara que el archivo no reporta.
//
// El cruce por número es en dos pasos (confirmado por el usuario):
//   - Primero por "Consecutivo" (archivo) == "Radicado" ("Numero_Corto" en
//     Procesos, ej. "2021-01428").
//   - Si no cruza así, por "Radicado" (archivo, el número completo del
//     juzgado) contra "No. completo" o el "Histórico números completos" de
//     Procesos — el usuario confirmó que en ambos lados puede haber VARIOS
//     números completos separados por espacios (un proceso cambia de
//     radicado con el tiempo, o el archivo trae más de un expediente
//     relacionado en la misma celda).
// Demandante/Demandado del archivo se llevan tal cual al Excel de salida
// para que el usuario los compare a simple vista contra el proceso que
// cruzó — el usuario aclaró que NO hace falta que la app decida si se
// parecen o no (ej. "Juan Pablo Niño" vs "Juan Niño"), es solo apoyo visual.
import { normalize } from './graph';
import { COLOR_ENCABEZADO } from './informeSOS';

// Un valor de celda de ExcelJS puede venir como texto/número plano, como
// fecha, o como el resultado de una fórmula ({formula, result} — el archivo
// real de la vigilancia trae "Consecutivo" calculado con CONCATENATE a
// partir de "Radicado"). Achata cualquiera de esas formas a texto simple.
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

// El "Radicado" (número completo) puede traer más de un expediente en la
// misma celda, separados por espacios — igual el "Histórico números
// completos" de Procesos judiciales (confirmado por el usuario).
export function splitNumeros(str){
  return String(str||"").split(/\s+/).map(s => s.trim()).filter(Boolean);
}

// Lee la primera hoja del archivo que sube el usuario — no se asume un
// nombre de hoja fijo (el archivo real se llama "Reporte Procesos", pero
// podría variar mes a mes). Los encabezados se buscan por nombre
// (normalizado, sin tildes/mayúsculas) en la fila 1, así que el orden real
// de las columnas del archivo no importa.
export async function leerArchivoVigilancia(file){
  const { default: ExcelJS } = await import('exceljs');
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if(!ws) throw new Error("El archivo no tiene ninguna hoja.");

  const columnas = {};
  ws.getRow(1).eachCell((cell, colNumero) => {
    columnas[normalize(valorCelda(cell.value))] = colNumero;
  });
  const colRadicado = columnas['radicado'];
  const colConsecutivo = columnas['consecutivo'];
  const colDemandante = columnas['demandante'];
  const colDemandado = columnas['demandado'];
  const colApoderado = columnas['apoderado'];
  if(!colRadicado || !colConsecutivo){
    throw new Error('No se encontraron las columnas "Radicado" y/o "Consecutivo" en la primera fila del archivo.');
  }

  const filas = [];
  for(let r=2; r<=ws.rowCount; r++){
    const row = ws.getRow(r);
    const radicado = valorCelda(row.getCell(colRadicado).value);
    const consecutivo = valorCelda(row.getCell(colConsecutivo).value);
    if(!radicado && !consecutivo) continue; // fila vacía (huecos reales al final de estos informes)
    filas.push({
      radicado,
      consecutivo,
      demandante: colDemandante ? valorCelda(row.getCell(colDemandante).value) : "",
      demandado: colDemandado ? valorCelda(row.getCell(colDemandado).value) : "",
      apoderado: colApoderado ? valorCelda(row.getCell(colApoderado).value) : "",
    });
  }
  return filas;
}

function coincideNumeroCompleto(radicadoArchivo, proceso){
  const numerosArchivo = splitNumeros(radicadoArchivo);
  if(!numerosArchivo.length) return false;
  const numerosLexara = [
    ...splitNumeros(proceso.NoCompleto),
    ...splitNumeros(proceso.HistoricoNumerosCompletos),
  ];
  return numerosArchivo.some(n => numerosLexara.includes(n));
}

// Compara las filas ya leídas del archivo contra Procesos judiciales.
// Devuelve las 3 listas de diferencias (nunca los que sí cruzan bien, esos
// no hacen falta reportarlos). "faltantesEnArchivo" solo mira procesos
// VIGENTES en el Portal (uno Terminado o En revisión no se espera que la
// vigilancia externa lo siga reportando) — si ese criterio no es el
// correcto, es fácil de ajustar acá.
export function compararConProcesos(filasArchivo, procesos){
  const noEncontrados = [];
  const terminados = [];
  const idsEncontrados = new Set();

  (filasArchivo||[]).forEach(fila => {
    let match = null;
    if(fila.consecutivo){
      match = (procesos||[]).find(p => (p.Radicado||"").trim() === fila.consecutivo.trim());
    }
    if(!match && fila.radicado){
      match = (procesos||[]).find(p => coincideNumeroCompleto(fila.radicado, p));
    }
    if(match){
      idsEncontrados.add(match.id);
      const estado = (match.EstadoVT||"").trim().toUpperCase();
      if(estado === 'TERMINADO'){
        terminados.push({
          radicado: fila.radicado || "—",
          observacion: "En Portal Lexara aparece como Terminado",
          consecutivo: fila.consecutivo || "—",
          lexara: match.Radicado || "—",
          demandante: fila.demandante || "—",
          demandado: fila.demandado || "—",
          apoderado: fila.apoderado || "—",
        });
      }
      // Vigente/En revisión y sí se encontró: todo bien, no se reporta.
    } else {
      noEncontrados.push({
        radicado: fila.radicado || "—",
        observacion: "No está en Portal Lexara",
        consecutivo: fila.consecutivo || "—",
        lexara: "#N/D",
        demandante: fila.demandante || "—",
        demandado: fila.demandado || "—",
        apoderado: fila.apoderado || "—",
      });
    }
  });

  const faltantesEnArchivo = (procesos||[])
    .filter(p => (p.EstadoVT||"").trim().toUpperCase() === 'VIGENTE')
    .filter(p => !idsEncontrados.has(p.id))
    .map(p => ({
      radicado: p.NoCompleto || "—",
      observacion: "No está en el archivo de vigilancia judicial",
      consecutivo: p.Radicado || "—",
      lexara: "—",
      demandante: p.Demandante || "—",
      demandado: p.Demandado || "—",
      apoderado: p.Apoderado || "—",
    }));

  return { noEncontrados, terminados, faltantesEnArchivo };
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

// 3 hojas — pedido explícito del usuario 2026-09-03 ("agregar dos hojas
// una con el archivo que se subió y otra con los datos de procesos
// judiciales"), además de la hoja "Revisión" que ya existía (las 3
// diferencias juntas, columna Observación dice a cuál pertenece cada
// fila). Las 2 hojas nuevas son el respaldo crudo de ambos lados del
// cruce, por si hace falta revisar algo puntual sin volver a subir el
// archivo. Mismo estilo institucional (encabezado verde oscuro) que el
// resto de los Excel de la app.
export async function generarExcelRevisionProcesos(nombreArchivo, { noEncontrados, terminados, faltantesEnArchivo }, filasArchivo, procesos){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();

  const wsRevision = wb.addWorksheet("Revisión");
  encabezarHoja(wsRevision, [
    { header:"Radicado", key:"radicado", width:28 },
    { header:"Observación", key:"observacion", width:36 },
    { header:"Consecutivo", key:"consecutivo", width:16 },
    { header:"Lexara", key:"lexara", width:16 },
    { header:"Demandante", key:"demandante", width:32 },
    { header:"Demandado", key:"demandado", width:32 },
    { header:"Apoderado", key:"apoderado", width:32 },
  ]);
  [...noEncontrados, ...terminados, ...faltantesEnArchivo].forEach(f => wsRevision.addRow(f));

  const wsArchivo = wb.addWorksheet("Archivo subido");
  encabezarHoja(wsArchivo, [
    { header:"Radicado", key:"radicado", width:28 },
    { header:"Consecutivo", key:"consecutivo", width:16 },
    { header:"Demandante", key:"demandante", width:32 },
    { header:"Demandado", key:"demandado", width:32 },
    { header:"Apoderado", key:"apoderado", width:32 },
  ]);
  (filasArchivo||[]).forEach(f => wsArchivo.addRow(f));

  const wsProcesos = wb.addWorksheet("Procesos judiciales");
  encabezarHoja(wsProcesos, [
    { header:"Radicado (No. Corto)", key:"radicado", width:18 },
    { header:"No. Completo", key:"nocompleto", width:28 },
    { header:"Histórico números completos", key:"historico", width:36 },
    { header:"Estado V/T", key:"estadovt", width:14 },
    { header:"Demandante", key:"demandante", width:32 },
    { header:"Demandado", key:"demandado", width:32 },
  ]);
  (procesos||[]).forEach(p => wsProcesos.addRow({
    radicado: p.Radicado || "—",
    nocompleto: p.NoCompleto || "—",
    historico: p.HistoricoNumerosCompletos || "—",
    estadovt: p.EstadoVT || "—",
    demandante: p.Demandante || "—",
    demandado: p.Demandado || "—",
  }));

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
