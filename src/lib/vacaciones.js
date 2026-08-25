// Parseo del Excel real "Vacaciones.xlsx" (ver leerVacacionesExcel/
// escribirRangoVacacionesExcel en graph.js y [[project_administracion_modulo]]).
// La hoja tiene 2 filas de encabezado y luego una fila por colaborador, con
// 8 columnas fijas de resumen (algunas calculadas por fórmula en el Excel:
// fecha actual, días laborados, días generados, días pendientes, días
// tomados) seguidas de N pares de columnas repetidos "Días"/"Nota" — uno por
// cada período de vacaciones que esa persona ya tomó. La fórmula real de
// "Días Tomados" (columna H) sí SUMA todas esas columnas "Días" — por eso
// agregar un período nuevo en la primera columna vacía basta para que los
// totales se recalculen solos, sin tocar ninguna fórmula.
//
// Columnas fijas (0-based, coinciden con A=0,B=1,...):
//   0 Nombre | 1 Fecha de Ingreso | 2 fecha actual | 3 Días Laborados |
//   4 Días generados por vacaciones | 5 periodos | 6 Días Pendientes |
//   7 Días Tomados
// A partir de la columna 8 (Excel "I"): pares [Días, Nota] repetidos.
const COL_RESUMEN = 8; // primera columna de datos de la persona = índice 0 del array de fila

// Índice de columna (0-based) -> letra de columna de Excel ("A","B",...,"AA",...).
export function colIndexToLetter(idx){
  let n = idx + 1, letra = '';
  while(n > 0){
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

function celda(fila, idx){
  const v = fila[idx];
  return v === undefined || v === null ? '' : v;
}
function vacio(v){
  return v === '' || v === undefined || v === null;
}

// Convierte lo que Graph devuelva para una fecha (puede venir como texto
// "dd/mm/aaaa", como serial de Excel, o ya en ISO) a "dd/mm/aaaa" para
// mostrar — nunca revienta si el formato no es el esperado, muestra el
// valor crudo tal cual en ese caso (mejor eso que ocultar el dato).
export function formatearFechaExcel(v){
  if(vacio(v)) return "—";
  if(typeof v === 'number'){
    // Serial de Excel: día 0 = 30/12/1899.
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if(!isNaN(d.getTime())) return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
  }
  const s = String(v).trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if(isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  return s || "—";
}

// `values` = lo que devuelve leerVacacionesExcel() — array de arrays crudo,
// incluyendo las 2 filas de encabezado. Devuelve un array de filas
// estructuradas, una por colaborador, en el mismo orden del Excel.
export function parseVacaciones(values){
  const filas = (values || []).slice(2); // salta las 2 filas de encabezado
  return filas
    .map((fila, i) => {
      if(!fila || vacio(fila[0])) return null; // fila vacía (final de la hoja)
      const historial = [];
      for(let idx = COL_RESUMEN; idx < fila.length; idx += 2){
        const dias = celda(fila, idx);
        const nota = celda(fila, idx+1);
        if(!vacio(dias) || !vacio(nota)) historial.push({ dias, nota, colIndex: idx });
      }
      return {
        excelRow: i + 3, // fila 1 y 2 son encabezado, los datos arrancan en la fila 3 real de Excel
        nombre: celda(fila, 0),
        fechaIngreso: formatearFechaExcel(fila[1]),
        diasLaborados: celda(fila, 3),
        diasGenerados: celda(fila, 4),
        diasPendientes: celda(fila, 6),
        diasTomados: celda(fila, 7),
        historial,
        anchoFila: fila.length, // para saber hasta dónde buscar la próxima columna vacía
      };
    })
    .filter(Boolean);
}

// Vuelve a ubicar la fila cruda (array) de una persona por Nombre dentro de
// `values` — se usa justo antes de escribir (no se reutiliza la fila ya
// parseada) para tomar el estado más fresco posible y no pisar un período
// que alguien más haya agregado en el minuto anterior. Devuelve
// {excelRow, fila} o null si el nombre ya no aparece tal cual.
export function ubicarFilaCruda(values, nombre){
  const filas = (values || []).slice(2);
  const idx = filas.findIndex(f => f && String(f[0]||"").trim() === String(nombre||"").trim());
  if(idx === -1) return null;
  return { excelRow: idx + 3, fila: filas[idx] };
}

// Primera columna (0-based) del par [Días, Nota] que esté realmente vacía en
// esa fila — nunca sobrescribe un período que ya existe. `anchoTotal` es el
// ancho real de la hoja (para no salirse del rango con fórmulas, ver
// COL_RESUMEN/formula H en el Excel) — null si ya no queda ningún par libre
// dentro de lo que la hoja reserva hoy (habría que agregar columnas nuevas a
// mano en Excel, algo que no debería pasar en la práctica: la hoja reserva
// ~36 períodos por persona).
export function primeraColumnaVaciaDePeriodo(filaValoresCruda, anchoTotal){
  for(let idx = COL_RESUMEN; idx + 1 < anchoTotal; idx += 2){
    const dias = filaValoresCruda[idx];
    const nota = filaValoresCruda[idx+1];
    if(vacio(dias) && vacio(nota)) return idx;
  }
  return null;
}

// "I3:J3" — el rango exacto a escribir para un nuevo período.
export function rangoNuevoPeriodo(excelRow, colIndexDias){
  const colDias = colIndexToLetter(colIndexDias);
  const colNota = colIndexToLetter(colIndexDias + 1);
  return `${colDias}${excelRow}:${colNota}${excelRow}`;
}
