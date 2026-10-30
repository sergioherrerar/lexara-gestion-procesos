// Excel de soporte de las Novedades de nómina (2026-10-30, pedido del usuario): «lo mismo que se ve en el correo, pero adjunto en Excel». Se arman cuatro archivos del mes:
//   0. Consolidado por persona  ·  1. Tutelas contestadas  ·  2. Horas extras aprobadas  ·  3. Vacaciones
// Mismo estilo institucional de los demás Excel del portal (encabezado verde oscuro con letra blanca, valores y fechas a la derecha).
import { COLOR_ENCABEZADO, fechaISOaExcel } from './informeSOS';
import { crearExcelAbogadosTutelas } from './informeAbogadosTutelas';
import { nombreArchivoSeguro } from './graph';
import { MESES_NOMBRES, dma } from './novedadesNomina';

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FMT_PESOS = '"$"#,##0.00';

function encabezar(ws, titulos, anchos){
  ws.columns = titulos.map((t, i) => ({ width: anchos[i] || 16 }));
  const fila = ws.addRow(titulos);
  fila.height = 26;
  fila.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } };
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}
function filaTotal(ws, valores){
  const f = ws.addRow(valores);
  f.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  f.eachCell({ includeEmpty: true }, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } }; });
  return f;
}
const derecha = (fila, cols) => cols.forEach(i => { fila.getCell(i).alignment = { horizontal: 'right' }; });

async function nuevoLibro(){
  const { default: ExcelJS } = await import('exceljs');
  return new ExcelJS.Workbook();
}

export async function crearExcelConsolidado(novedades, etiqueta){
  const wb = await nuevoLibro();
  const ws = wb.addWorksheet('Consolidado');
  encabezar(ws, ['Persona', 'Tutelas contestadas', 'Valor Abogado', 'Horas extras aprobadas', 'Días de vacaciones en el mes'], [38, 20, 20, 22, 26]);
  novedades.consolidado.filas.forEach(f => {
    const r = ws.addRow([f.persona, f.tutelas || 0, f.valor || 0, f.horas || 0, f.vacaciones || 0]);
    r.getCell(3).numFmt = FMT_PESOS;
    derecha(r, [2, 3, 4, 5]);
  });
  const t = novedades.consolidado.totales;
  const r = filaTotal(ws, ['Total general', t.tutelas, t.valor, t.horas, t.vacaciones]);
  r.getCell(3).numFmt = FMT_PESOS;
  derecha(r, [2, 3, 4, 5]);
  const { rangos } = novedades;
  ws.addRow([]);
  ws.addRow([`Novedades de nómina de ${etiqueta}. Tutelas y horas extras del ${dma(rangos.cortesInicio)} al ${dma(rangos.cortesFin)}; vacaciones del ${dma(rangos.mesInicio)} al ${dma(rangos.mesFin)}.`]).font = { italic: true };
  return wb.xlsx.writeBuffer();
}

export async function crearExcelHorasExtras(novedades, etiqueta){
  const wb = await nuevoLibro();
  const rs = wb.addWorksheet('Resumen');
  encabezar(rs, ['Colaborador', 'Diurnas', 'Nocturnas', 'Diurnas festivas', 'Nocturnas festivas', 'Total horas'], [38, 14, 14, 18, 20, 16]);
  novedades.horas.filas.forEach(f => derecha(rs.addRow([f.colaborador, f.diurnas, f.nocturnas, f.diurnasFest, f.nocturnasFest, f.total]), [2, 3, 4, 5, 6]));
  const t = novedades.horas.filas.reduce((s, f) => ({ d: s.d + f.diurnas, n: s.n + f.nocturnas, df: s.df + f.diurnasFest, nf: s.nf + f.nocturnasFest }), { d: 0, n: 0, df: 0, nf: 0 });
  derecha(filaTotal(rs, ['Total general', t.d, t.n, t.df, t.nf, novedades.horas.totalGeneral]), [2, 3, 4, 5, 6]);

  const det = wb.addWorksheet('Detalle');
  encabezar(det, ['Colaborador', 'Fecha', 'Hora inicio', 'Hora fin', 'Diurnas', 'Nocturnas', 'Diurnas festivas', 'Nocturnas festivas', 'Total horas', 'Observaciones'], [34, 14, 12, 12, 12, 12, 18, 20, 14, 44]);
  [...(novedades.horasDetalle || [])].sort((a, b) => String(a.Colaborador || '').localeCompare(String(b.Colaborador || '')) || String(a.Fecha || '').localeCompare(String(b.Fecha || ''))).forEach(h => {
    const d = Number(h.HorasDiurnas) || 0, n = Number(h.HorasNocturnas) || 0, df = Number(h.HorasDiurnasFestivas) || 0, nf = Number(h.HorasNocturnasFestivas) || 0;
    const r = det.addRow([h.Colaborador || '', fechaISOaExcel(h.Fecha), h.HoraInicio || '', h.HoraFin || '', d, n, df, nf, Math.round((d + n + df + nf) * 100) / 100, h.Observaciones || '']);
    r.getCell(2).numFmt = 'dd/mm/yyyy';
    derecha(r, [2, 3, 4, 5, 6, 7, 8, 9]);
  });
  det.addRow([]);
  det.addRow([`Solo las horas extras aprobadas de ${etiqueta} (corte del 29 al 28).`]).font = { italic: true };
  return wb.xlsx.writeBuffer();
}

export async function crearExcelVacaciones(novedades, etiqueta){
  const wb = await nuevoLibro();
  const ws = wb.addWorksheet('Vacaciones');
  encabezar(ws, ['Colaborador', 'Inicio', 'Fin', 'Días solicitados', 'Días en el mes', 'Estado', 'Observaciones'], [38, 14, 14, 18, 18, 26, 44]);
  novedades.vacaciones.filas.forEach(f => {
    const r = ws.addRow([f.colaborador, fechaISOaExcel(f.inicio), fechaISOaExcel(f.fin), f.diasSolicitados, f.diasEnMes, f.pendiente ? 'Pendiente de aprobación' : 'Aprobada', f.observaciones || '']);
    r.getCell(2).numFmt = 'dd/mm/yyyy';
    r.getCell(3).numFmt = 'dd/mm/yyyy';
    derecha(r, [2, 3, 4, 5]);
  });
  derecha(filaTotal(ws, ['Total días en el mes', '', '', '', novedades.vacaciones.totalDiasEnMes, '', '']), [5]);
  ws.addRow([]);
  ws.addRow([`Vacaciones del mes completo de ${etiqueta} (1 al ${novedades.rangos.mesFin.slice(8)}). Los períodos que cruzan de mes cuentan solo los días hábiles de este mes.`]).font = { italic: true };
  return wb.xlsx.writeBuffer();
}

function aBase64(bytes){
  let bin = '';
  for(let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Los cuatro Excel del mes, listos para adjuntar: [{ nombre, contentType, base64, tamano }].
export async function crearAdjuntosNovedades({ novedades, tutelas, valoresEntidad, anio, mesIndex0 }){
  const etiqueta = `${MESES_NOMBRES[mesIndex0]} de ${anio}`;
  const sufijo = `${MESES_NOMBRES[mesIndex0]} ${anio}`;
  const archivos = [
    ['0 Consolidado por persona - ' + sufijo, await crearExcelConsolidado(novedades, etiqueta)],
    ['1 Tutelas contestadas - ' + sufijo, await crearExcelAbogadosTutelas(tutelas, valoresEntidad, anio, mesIndex0)],
    ['2 Horas extras aprobadas - ' + sufijo, await crearExcelHorasExtras(novedades, etiqueta)],
    ['3 Vacaciones - ' + sufijo, await crearExcelVacaciones(novedades, etiqueta)],
  ];
  return archivos.map(([nombre, buffer]) => {
    const bytes = new Uint8Array(buffer);
    return { nombre: nombreArchivoSeguro(nombre) + '.xlsx', contentType: TIPO_XLSX, base64: aBase64(bytes), tamano: bytes.length };
  });
}
