// Informe "Tutelas por Cliente" (Informes) — pedido explícito del usuario
// 2026-08-29: "parecido al de por abogado... cambia que ya no está la
// columna valor abogado ahora va estar valor entidad de resto igual con la
// tabla dinámica". Mismo filtro de mes por Vencimiento (corte fijo el 28,
// ver rangoVencimientoDelMes en informeAbogadosTutelas.js) y misma tabla
// agrupada tipo "dinámica" en la 2ª hoja, pero agrupado por **Cliente** en
// vez de Abogado Tutela, sumando **Valor Entidad** (NO Valor Abogado) de
// cada tutela — buscado igual en la lista "Valores Entidad" por la Entidad
// de esa tutela. Ver [[project_tutelas_por_abogado]].
import { construirHojaTutelasXlsx, COLOR_ENCABEZADO_XLSX } from './informeTutelas';
import { parseMonto, buscarValorEntidad } from './graph';
import { MESES_NOMBRES, rangoVencimientoDelMes, filtrarTutelasPorMes, colorDeTipoRespuesta, ordenTipoRespuesta } from './informeAbogadosTutelas';

// Re-exportados tal cual — mismo criterio de mes/corte/colores que "Tutelas
// por Abogado", no se duplica nada de esa lógica acá.
export { MESES_NOMBRES, rangoVencimientoDelMes, filtrarTutelasPorMes, colorDeTipoRespuesta };

// Agrupa Cliente -> Tipo Respuesta, sumando Valor Entidad. Misma forma de
// resultado que agruparPorAbogado (informeAbogadosTutelas.js), cambiando
// "abogado"/"totalAbogado" por "cliente"/"totalCliente" — así
// StackedBarChart.jsx (con labelKey="cliente" totalKey="totalCliente") lo
// puede reusar sin cambios.
export function agruparPorCliente(tutelasFiltradas, valoresEntidad){
  const porCliente = new Map();
  (tutelasFiltradas||[]).forEach(t => {
    const cliente = (t.Cliente||"").trim() || "Sin cliente";
    const tipo = (t.TipoRespuesta||"").trim() || "Sin tipo";
    const valorEnt = buscarValorEntidad(valoresEntidad, t.Entidad, t.Cliente, t.TipoRespuesta);
    const valor = valorEnt ? parseMonto(valorEnt.ValorEntidad) : 0;
    if(!porCliente.has(cliente)) porCliente.set(cliente, new Map());
    const porTipo = porCliente.get(cliente);
    porTipo.set(tipo, (porTipo.get(tipo)||0) + valor);
  });
  const clientes = Array.from(porCliente.keys()).sort((a,b)=>a.localeCompare(b));
  let totalGeneral = 0;
  const grupos = clientes.map(cliente => {
    const porTipo = porCliente.get(cliente);
    const filas = Array.from(porTipo.keys()).sort(ordenTipoRespuesta).map(tipo => ({ tipoRespuesta: tipo, total: porTipo.get(tipo) }));
    const totalCliente = filas.reduce((s,f) => s+f.total, 0);
    totalGeneral += totalCliente;
    return { cliente, filas, totalCliente };
  });
  return { grupos, totalGeneral };
}

// 2ª hoja del Excel — mismo criterio de outline/agrupado que "Por Abogado"
// (ver informeAbogadosTutelas.js), con "Cliente" en vez de "Abogado Tutela".
// Exportada (2026-08-29) para que "Órdenes Colmédica" (Administración,
// ordenesComprasColmedica.js) arme el MISMO Excel de 2 hojas, solo que
// filtrando las tutelas por mes calendario completo en vez del corte-28 —
// pidió explícitamente el usuario "el Excel esta mal debe ser el mismo de
// tutelas por abogado" (viendo el de acá armado distinto, más simple).
export function construirHojaPorCliente(wb, grupos, totalGeneral){
  const ws = wb.addWorksheet("Por Cliente");
  ws.columns = [{width:32},{width:26},{width:16}];
  ws.properties.outlineProperties = { summaryBelow: true, summaryRight: false };

  const headerRow = ws.addRow(["Cliente","Tipo Respuesta","Total"]);
  headerRow.height = 26;
  headerRow.eachCell(cell => {
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb: COLOR_ENCABEZADO_XLSX} };
    cell.font = { name:'Aptos Narrow', size:11, bold:true, color:{argb:'FFFFFFFF'} };
    cell.alignment = { horizontal:'center', vertical:'middle' };
  });
  ws.autoFilter = 'A1:C1';

  grupos.forEach(g => {
    const filaCliente = ws.addRow([g.cliente, "", ""]);
    filaCliente.font = { name:'Aptos Narrow', size:11, bold:true, color:{argb:'FF004941'} };

    g.filas.forEach(f => {
      const fila = ws.addRow(["", f.tipoRespuesta, f.total]);
      fila.outlineLevel = 1;
      fila.getCell(3).alignment = { horizontal:'right' };
      fila.getCell(3).numFmt = '"$"#,##0.00';
    });

    const filaTotal = ws.addRow(["", `Total ${g.cliente}`, g.totalCliente]);
    filaTotal.font = { bold:true };
    filaTotal.getCell(3).alignment = { horizontal:'right' };
    filaTotal.getCell(3).numFmt = '"$"#,##0.00';
  });

  const filaGeneral = ws.addRow(["", "Total general", totalGeneral]);
  filaGeneral.font = { bold:true, color:{argb:'FFFFFFFF'} };
  filaGeneral.eachCell(cell => { cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF52BBB5'} }; });
  filaGeneral.getCell(3).alignment = { horizontal:'right' };
  filaGeneral.getCell(3).numFmt = '"$"#,##0.00';

  ws.views = [{ state:'frozen', ySplit:1 }];
  return ws;
}

// Arma el workbook completo (hoja 1 = tutelas ya filtradas, sin "Valor
// Abogado" — solo "Valor Entidad"; hoja 2 = resumen agrupado por Cliente) y
// lo descarga con el nombre dado. Extraído 2026-08-29 (recibe las tutelas
// YA FILTRADAS, sin opinar de qué mes/corte usar) para que "Órdenes
// Colmédica" (mes calendario completo) y este informe (corte-28) armen
// exactamente el mismo Excel, cada uno con su propio filtro de mes.
export async function descargarExcelClientesTutelas(tutelasFiltradas, valoresEntidad, nombreArchivo){
  const { default: ExcelJS } = await import('exceljs');
  const { grupos, totalGeneral } = agruparPorCliente(tutelasFiltradas, valoresEntidad);

  const wb = new ExcelJS.Workbook();
  construirHojaTutelasXlsx(wb, tutelasFiltradas, valoresEntidad, "Tutelas", { soloValorEntidad: true });
  construirHojaPorCliente(wb, grupos, totalGeneral);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Excel completo: hoja 1 = las tutelas del mes (mismo formato de siempre, ya
// filtradas, sin "Valor Abogado" — solo "Valor Entidad"), hoja 2 = el
// resumen agrupado por Cliente.
export async function generarInformeClientesTutelasExcel(tutelas, valoresEntidad, anio, mesIndex0){
  const filtradas = filtrarTutelasPorMes(tutelas, anio, mesIndex0);
  await descargarExcelClientesTutelas(filtradas, valoresEntidad, `Tutelas por Cliente - ${MESES_NOMBRES[mesIndex0]} ${anio}.xlsx`);
}
