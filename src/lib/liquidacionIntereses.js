// "Liquidación Intereses" (Informes > Herramientas) — agregada 2026-09-09,
// pedido explícito del usuario: reemplaza el cálculo manual que hacía en 2
// archivos Excel reales ("INTERESES UNO A UNO.xlsm" / "Liquidador Intereses
// e IPC.xlsx"). Metodología confirmada por el usuario:
//   - Interés moratorio: se recorre la tabla histórica de tasas (lista
//     SharePoint "TasasInteres" — FechaDesde exclusiva/FechaHasta inclusiva/
//     TasaAnual) prorrateando por día (valor × tasa × días / 366) cada tramo
//     que se cruce con el periodo de mora.
//   - Indexación por IPC (opcional, toggle "¿Liquidar con IPC?"): compara el
//     IPC del mes de la Fecha de Vencimiento contra el del mes de la Fecha
//     de Cálculo (lista SharePoint "IPC" — Anio/Mes/Indice).
//   - Total a pagar = Valor deuda + el MAYOR entre interés moratorio e
//     incremento por IPC (nunca los dos sumados) — criterio estándar de "lo
//     que sea más favorable".
// El desglose por año (igual al que ya mostraba el Excel del usuario) parte
// cada tramo de tasa también por año calendario, así los días/valor de cada
// año se pueden sumar sin perder ni duplicar ninguno.
import { parseMonto } from './graph';

function parseFechaISO(iso){
  if(!iso) return null;
  if(iso instanceof Date) return iso;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if(!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}
function fechaAISO(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function tramosOrdenados(tasasInteres){
  return (tasasInteres || [])
    .map(t => ({ desde: parseFechaISO(t.FechaDesde), hasta: parseFechaISO(t.FechaHasta), tasa: Number(t.TasaAnual) }))
    .filter(t => t.desde && t.hasta && !isNaN(t.tasa))
    .sort((a, b) => a.desde - b.desde);
}

// Reparte [fechaVencimiento, fechaCalculo) en sub-tramos que nunca cruzan ni
// un cambio de tasa ni un 1° de enero, para poder sumar por año (desglose)
// y por tramo (total) sin perder ni duplicar un solo día.
export function segmentosInteres(fechaVencimiento, fechaCalculo, tasasInteres){
  const tramos = tramosOrdenados(tasasInteres);
  const inicioMs = fechaVencimiento.getTime(), finMs = fechaCalculo.getTime();
  const cortes = new Set([inicioMs, finMs]);
  tramos.forEach(t => {
    if(t.desde.getTime() > inicioMs && t.desde.getTime() < finMs) cortes.add(t.desde.getTime());
    if(t.hasta.getTime() > inicioMs && t.hasta.getTime() < finMs) cortes.add(t.hasta.getTime());
  });
  for(let y = fechaVencimiento.getFullYear() + 1; y <= fechaCalculo.getFullYear(); y++){
    const corte = new Date(y, 0, 1).getTime();
    if(corte > inicioMs && corte < finMs) cortes.add(corte);
  }
  const puntos = Array.from(cortes).sort((a, b) => a - b);
  const segmentos = [];
  for(let i = 0; i < puntos.length - 1; i++){
    const ini = puntos[i], fin = puntos[i + 1];
    const dias = Math.round((fin - ini) / 86400000);
    if(dias <= 0) continue;
    const medioMs = ini + (fin - ini) / 2;
    // FechaDesde exclusiva / FechaHasta inclusiva — igual que el Excel original.
    const tramo = tramos.find(t => medioMs > t.desde.getTime() && medioMs <= t.hasta.getTime());
    // Año del segmento: mediodía del día de inicio, para no caer justo en el
    // límite de medianoche de un corte de año.
    const anio = new Date(ini + 43200000).getFullYear();
    segmentos.push({ dias, tasa: tramo ? tramo.tasa : null, anio });
  }
  return segmentos;
}

export function calcularInteresMoratorio(valorDeuda, fechaVencimiento, fechaCalculo, tasasInteres){
  const segmentos = segmentosInteres(fechaVencimiento, fechaCalculo, tasasInteres);
  let total = 0, diasSinTasa = 0;
  const porAnio = new Map();
  segmentos.forEach(seg => {
    const valorSeg = seg.tasa != null ? (valorDeuda * seg.tasa * seg.dias / 366) : 0;
    if(seg.tasa == null) diasSinTasa += seg.dias;
    total += valorSeg;
    const acc = porAnio.get(seg.anio) || { dias: 0, valor: 0 };
    acc.dias += seg.dias; acc.valor += valorSeg;
    porAnio.set(seg.anio, acc);
  });
  const desglosePorAnio = Array.from(porAnio.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([anio, v]) => ({ anio, dias: v.dias, valor: v.valor }));
  return { total, desglosePorAnio, diasSinTasa };
}

function ipcDeMes(ipcMensual, anio, mes){
  const item = (ipcMensual || []).find(i => Number(i.Anio) === anio && Number(i.Mes) === mes);
  return item ? Number(item.Indice) : null;
}

export function calcularIndexacionIPC(valorDeuda, fechaVencimiento, fechaCalculo, ipcMensual){
  const ipcInicial = ipcDeMes(ipcMensual, fechaVencimiento.getFullYear(), fechaVencimiento.getMonth() + 1);
  const ipcFinal = ipcDeMes(ipcMensual, fechaCalculo.getFullYear(), fechaCalculo.getMonth() + 1);
  if(ipcInicial == null || ipcFinal == null){
    return { disponible: false, ipcInicial, ipcFinal, valorActualizado: null, incremento: null };
  }
  const valorActualizado = valorDeuda * (ipcFinal / ipcInicial);
  return { disponible: true, ipcInicial, ipcFinal, valorActualizado, incremento: valorActualizado - valorDeuda };
}

// Núcleo único de la liquidación — lo usan el Modo 1 (una línea, con salida
// PDF) y el Modo 2 (Excel masivo), para que el cálculo sea EXACTAMENTE el
// mismo en los 2: el Excel masivo solo repite esto una vez por fila.
export function liquidar({ valorDeuda, fechaVencimiento, fechaCalculo, incluirIPC, tasasInteres, ipcMensual }){
  const desde = parseFechaISO(fechaVencimiento);
  const hasta = parseFechaISO(fechaCalculo);
  if(!desde || !hasta) throw new Error("Fecha de vencimiento o fecha de cálculo inválida.");
  if(hasta <= desde) throw new Error("La fecha de cálculo debe ser posterior a la fecha de vencimiento.");
  const valor = parseMonto(valorDeuda);
  const diasMora = Math.round((hasta - desde) / 86400000);
  const { total: interesMoratorio, desglosePorAnio, diasSinTasa } = calcularInteresMoratorio(valor, desde, hasta, tasasInteres);
  const ipc = incluirIPC ? calcularIndexacionIPC(valor, desde, hasta, ipcMensual) : null;
  const incrementoIPC = ipc && ipc.disponible ? ipc.incremento : null;
  const aplicaIPC = incrementoIPC != null && incrementoIPC > interesMoratorio;
  const mayorValor = aplicaIPC ? incrementoIPC : interesMoratorio;
  return {
    valorDeuda: valor, fechaVencimiento: fechaAISO(desde), fechaCalculo: fechaAISO(hasta),
    diasMora, interesMoratorio, desglosePorAnio, diasSinTasa,
    incluirIPC: !!incluirIPC, ipc, incrementoIPC, aplicaIPC,
    totalAPagar: valor + mayorValor,
  };
}

const MESES_NOMBRES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// Para el seguimiento visual de "hasta cuándo están actualizadas las
// tablas" (pedido explícito del usuario 2026-09-09) — no calcula nada, solo
// mira cuál es el dato más reciente ya cargado en cada lista.
export function ultimaActualizacionTasas(tasasInteres){
  const fechas = (tasasInteres || []).map(t => parseFechaISO(t.FechaHasta)).filter(Boolean);
  if(!fechas.length) return null;
  const maxima = new Date(Math.max(...fechas.map(d => d.getTime())));
  return { fecha: fechaAISO(maxima), fechaObj: maxima };
}

export function ultimaActualizacionIPC(ipcMensual){
  const items = (ipcMensual || []).filter(i => i.Anio != null && i.Mes != null);
  if(!items.length) return null;
  const ultimo = items.reduce((mejor, i) => {
    const clave = Number(i.Anio) * 12 + Number(i.Mes);
    const claveMejor = Number(mejor.Anio) * 12 + Number(mejor.Mes);
    return clave > claveMejor ? i : mejor;
  });
  return { anio: Number(ultimo.Anio), mes: Number(ultimo.Mes), etiqueta: `${MESES_NOMBRES[Number(ultimo.Mes) - 1] || ultimo.Mes} ${ultimo.Anio}` };
}

// =========================================================================
// Modo 2 — plantilla Excel (descargar / subir / devolver liquidado)
// =========================================================================
const COLUMNAS_PLANTILLA = ["No.", "Referencia (opcional)", "Valor Deuda", "Fecha Vencimiento (AAAA-MM-DD)", "Fecha Cálculo (AAAA-MM-DD)", "¿Liquidar IPC? (Sí/No)"];

function encabezarHojaLocal(ws, columnas){
  ws.columns = columnas;
  ws.getRow(1).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004941' } };
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

export async function generarPlantillaLiquidacion(){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Plantilla");
  encabezarHojaLocal(ws, [
    { header: "No.", key: "no", width: 8 },
    { header: "Referencia (opcional)", key: "referencia", width: 24 },
    { header: "Valor Deuda", key: "valorDeuda", width: 16 },
    { header: "Fecha Vencimiento (AAAA-MM-DD)", key: "fechaVencimiento", width: 26 },
    { header: "Fecha Cálculo (AAAA-MM-DD)", key: "fechaCalculo", width: 24 },
    { header: "¿Liquidar IPC? (Sí/No)", key: "liquidarIpc", width: 20 },
  ]);
  // Fila de ejemplo, en un color distinto, para que quede claro el formato
  // esperado — se descarta sola al procesar (no es una fila de datos real).
  const ejemplo = ws.addRow({ no: "Ej.", referencia: "Cliente ejemplo S.A.S.", valorDeuda: 14000000, fechaVencimiento: "2021-01-01", fechaCalculo: "2026-09-09", liquidarIpc: "Sí" });
  ejemplo.eachCell(cell => { cell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF7A7A7A' } }; });
  for(let i = 1; i <= 40; i++) ws.addRow({ no: i });
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = "Plantilla Liquidación Intereses.xlsx";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function valorCelda(v){
  if(v == null) return "";
  if(v instanceof Date) return v.toISOString().slice(0, 10);
  if(typeof v === 'object' && 'result' in v) return valorCelda(v.result);
  return v;
}

// Lee el archivo subido (misma plantilla descargada) y devuelve las filas
// con datos reales — descarta la fila de ejemplo y cualquier fila vacía.
export async function leerPlantillaLiquidacion(file){
  const { default: ExcelJS } = await import('exceljs');
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if(!ws) throw new Error("El archivo no tiene ninguna hoja.");
  const filas = [];
  for(let r = 2; r <= ws.rowCount; r++){
    const row = ws.getRow(r);
    const no = valorCelda(row.getCell(1).value);
    if(String(no).trim() === "Ej.") continue; // fila de ejemplo de la plantilla
    const referencia = valorCelda(row.getCell(2).value);
    const valorDeuda = valorCelda(row.getCell(3).value);
    const fechaVencimiento = valorCelda(row.getCell(4).value);
    const fechaCalculo = valorCelda(row.getCell(5).value);
    const liquidarIpc = valorCelda(row.getCell(6).value);
    if(!valorDeuda && !fechaVencimiento && !fechaCalculo) continue; // fila vacía
    filas.push({
      fila: r, no, referencia,
      valorDeuda, fechaVencimiento: String(fechaVencimiento).slice(0, 10), fechaCalculo: String(fechaCalculo).slice(0, 10),
      incluirIPC: /^s/i.test(String(liquidarIpc).trim()),
    });
  }
  return filas;
}

// Liquida cada fila leída de la plantilla (mismo núcleo `liquidar()` que el
// Modo 1) — las filas con error (fecha inválida, falta tasa/IPC) quedan con
// su propio mensaje en vez de tumbar el lote completo.
export function liquidarFilas(filas, tasasInteres, ipcMensual){
  return filas.map(f => {
    try{
      const r = liquidar({ valorDeuda: f.valorDeuda, fechaVencimiento: f.fechaVencimiento, fechaCalculo: f.fechaCalculo, incluirIPC: f.incluirIPC, tasasInteres, ipcMensual });
      return { ...f, resultado: r, error: null };
    }catch(err){
      return { ...f, resultado: null, error: err.message || String(err) };
    }
  });
}

export async function generarExcelLiquidado(filasLiquidadas){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Liquidación");
  encabezarHojaLocal(ws, [
    { header: "No.", key: "no", width: 8 },
    { header: "Referencia", key: "referencia", width: 24 },
    { header: "Valor Deuda", key: "valorDeuda", width: 16 },
    { header: "Fecha Vencimiento", key: "fechaVencimiento", width: 16 },
    { header: "Fecha Cálculo", key: "fechaCalculo", width: 16 },
    { header: "Días en Mora", key: "diasMora", width: 12 },
    { header: "¿Liquidó IPC?", key: "incluyeIpc", width: 12 },
    { header: "Interés Moratorio", key: "interesMoratorio", width: 18 },
    { header: "Incremento IPC", key: "incrementoIpc", width: 16 },
    { header: "Aplicó", key: "aplico", width: 14 },
    { header: "Total a Pagar", key: "totalAPagar", width: 18 },
    { header: "Observación", key: "observacion", width: 40 },
  ]);
  filasLiquidadas.forEach(f => {
    if(f.error){
      ws.addRow({ no: f.no, referencia: f.referencia, valorDeuda: parseMonto(f.valorDeuda), fechaVencimiento: f.fechaVencimiento, fechaCalculo: f.fechaCalculo, observacion: "ERROR: " + f.error });
      return;
    }
    const r = f.resultado;
    ws.addRow({
      no: f.no, referencia: f.referencia, valorDeuda: r.valorDeuda,
      fechaVencimiento: r.fechaVencimiento, fechaCalculo: r.fechaCalculo, diasMora: r.diasMora,
      incluyeIpc: r.incluirIPC ? "Sí" : "No",
      interesMoratorio: r.interesMoratorio,
      incrementoIpc: r.incrementoIPC != null ? r.incrementoIPC : "",
      aplico: r.incluirIPC ? (r.aplicaIPC ? "IPC" : "Interés moratorio") : "Interés moratorio",
      totalAPagar: r.totalAPagar,
      observacion: r.diasSinTasa > 0 ? `Sin tasa cargada para ${r.diasSinTasa} día(s) del periodo — revisar tabla TasasInteres.` : (r.incluirIPC && !r.ipc.disponible ? "No hay IPC cargado para el mes de vencimiento o de cálculo." : ""),
    });
  });
  ["valorDeuda", "interesMoratorio", "incrementoIpc", "totalAPagar"].forEach(key => {
    ws.getColumn(key).numFmt = '#,##0.00';
  });
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const hoyISO = new Date().toISOString().slice(0, 10);
  a.href = url; a.download = `Liquidación Intereses ${hoyISO}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
