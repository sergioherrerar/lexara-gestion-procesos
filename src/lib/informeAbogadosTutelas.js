// Informe "Tutelas por Abogado" — pedido explícito del usuario 2026-08-27,
// mostrando una captura real de una tabla dinámica de Excel (Abogado Tutela
// agrupado, con Tipo Respuesta debajo y un Total en pesos, subtotal por
// abogado y total general). Confirmado por chat (no widget, ver
// [[feedback_avoid_askuserquestion]]):
//   1) El Total es la suma de "Valor Abogado" (NO "Valor Entidad") de cada
//      tutela — buscado en la lista "Valores Entidad" por la Entidad de esa
//      tutela (mismo cruce que ya hace el Excel de Tutelas), pero la
//      Entidad NUNCA se muestra como columna/agrupación propia acá — "no
//      tomamos en cuenta nada de entidades" en el resultado, solo se usa
//      por dentro para encontrar el valor.
//   2) No hace falta una tabla dinámica NATIVA de Excel (ExcelJS no puede
//      generar una — no expone el motor de PivotCache/PivotTable de Excel,
//      solo puede escribir celdas). Alcanza con una tabla que SE VEA igual:
//      agrupada con los controles +/- de "outline" de Excel (soportado por
//      ExcelJS vía `row.outlineLevel`), subtotal por abogado y total
//      general — con datos reales, no necesariamente reorganizable.
//
// El corte de cada mes: el usuario fue explícito en que "no puede quedar ni
// un solo día por fuera y que el corte siempre es 28, puede variar desde
// cuando inicia" — el rango de cada mes es SIEMPRE del día 29 del mes
// anterior al día 28 de este mes (por Vencimiento). Para febrero, en vez de
// distinguir a mano si el año es bisiesto, se aprovecha que `new Date(año,
// mesIndex0-1, 29)` ya hace la normalización sola: en un año no bisiesto,
// new Date(año, 1, 29) (29 de febrero, que no existe ese año) rueda solo al
// 1 de marzo — así el 29 de febrero de un año bisiesto queda cubierto por
// el rango de MARZO (empieza el 29-feb en vez del 1-mar), sin que ningún
// día quede afuera y sin ningún caso especial escrito a mano.
import { construirHojaTutelasXlsx, COLOR_ENCABEZADO_XLSX } from './informeTutelas';
import { parseMonto, buscarValorEntidad } from './graph';

export const MESES_NOMBRES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// Mismo orden que ya usa el select fijo de "Tipo Respuesta" en
// TutelaDrawer.jsx — para que las filas de cada abogado salgan siempre en
// el mismo orden, no alfabético a secas. Ampliado 2026-08-28 con "CORRECION"
// y "MODULACION" (pedido explícito del usuario).
const ORDEN_TIPO_RESPUESTA = ["ACLARACION","ALCANCE","APLAZAMIENTO","CUMPLIMIENTO FALLO","CORRECION","IMPUGNACION","MODULACION","NULIDAD","REQUERIMIENTO","TUTELA"];

// Un color institucional fijo por Tipo Respuesta (por posición en
// ORDEN_TIPO_RESPUESTA, no por orden de aparición) — así el mismo Tipo
// Respuesta siempre sale del mismo color en el gráfico y en las tarjetas de
// detalle, sin importar qué abogados/categorías traiga cada mes. Empieza de
// los mismos 8 colores institucionales que ya usa PieChart.jsx, más 2
// adicionales (mismo criterio de paleta) agregados el 2026-08-28 al ampliar
// a 10 Tipo Respuesta.
const PALETA_TIPO_RESPUESTA = ['#004941', '#ef7d00', '#52bbb5', '#a3281c', '#1d5fa3', '#8a6410', '#6b5115', '#5c6b68', '#7a4fa3', '#c2703d'];
export function colorDeTipoRespuesta(tipo){
  const i = ORDEN_TIPO_RESPUESTA.indexOf(tipo);
  return PALETA_TIPO_RESPUESTA[i === -1 ? PALETA_TIPO_RESPUESTA.length - 1 : i % PALETA_TIPO_RESPUESTA.length];
}

export function rangoVencimientoDelMes(anio, mesIndex0){
  const fin = new Date(anio, mesIndex0, 28, 23, 59, 59, 999);
  const inicio = new Date(anio, mesIndex0 - 1, 29, 0, 0, 0, 0);
  return { inicio, fin };
}

function fechaDeTutela(iso){
  if(!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if(!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}

export function filtrarTutelasPorMes(tutelas, anio, mesIndex0){
  const { inicio, fin } = rangoVencimientoDelMes(anio, mesIndex0);
  return (tutelas||[]).filter(t => {
    const d = fechaDeTutela(t.FechaVencimiento);
    return d && d >= inicio && d <= fin;
  });
}

// Exportado (2026-08-29) para que "Tutelas por Cliente" (informeClientesTutelas.js)
// ordene sus filas de Tipo Respuesta igual que acá, sin duplicar el arreglo fijo.
export function ordenTipoRespuesta(a, b){
  const ia = ORDEN_TIPO_RESPUESTA.indexOf(a), ib = ORDEN_TIPO_RESPUESTA.indexOf(b);
  if(ia===-1 && ib===-1) return a.localeCompare(b);
  if(ia===-1) return 1;
  if(ib===-1) return -1;
  return ia - ib;
}

// Agrupa Abogado Tutela -> Tipo Respuesta, sumando Valor Abogado. Devuelve
// {grupos:[{abogado, filas:[{tipoRespuesta,total}], totalAbogado}], totalGeneral}
// — mismo dato que usan tanto el Excel (2ª hoja) como el gráfico en la app.
export function agruparPorAbogado(tutelasFiltradas, valoresEntidad){
  const porAbogado = new Map();
  (tutelasFiltradas||[]).forEach(t => {
    const abogado = (t.AbogadoRespuesta||"").trim() || "Sin abogado";
    const tipo = (t.TipoRespuesta||"").trim() || "Sin tipo";
    const valorEnt = buscarValorEntidad(valoresEntidad, t.Entidad, t.Cliente, t.TipoRespuesta);
    const valor = valorEnt ? parseMonto(valorEnt.ValorAbogado) : 0;
    if(!porAbogado.has(abogado)) porAbogado.set(abogado, new Map());
    const porTipo = porAbogado.get(abogado);
    porTipo.set(tipo, (porTipo.get(tipo)||0) + valor);
  });
  const abogados = Array.from(porAbogado.keys()).sort((a,b)=>a.localeCompare(b));
  let totalGeneral = 0;
  const grupos = abogados.map(abogado => {
    const porTipo = porAbogado.get(abogado);
    const filas = Array.from(porTipo.keys()).sort(ordenTipoRespuesta).map(tipo => ({ tipoRespuesta: tipo, total: porTipo.get(tipo) }));
    const totalAbogado = filas.reduce((s,f) => s+f.total, 0);
    totalGeneral += totalAbogado;
    return { abogado, filas, totalAbogado };
  });
  return { grupos, totalGeneral };
}

// 2ª hoja del Excel — agrupada con los controles +/- de outline de Excel
// (fila del abogado y la de su Total siempre visibles; las filas de Tipo
// Respuesta con outlineLevel=1, colapsables). No es una tabla dinámica real
// (ver nota arriba) pero se ve y se comporta como una al abrirla.
function construirHojaPorAbogado(wb, grupos, totalGeneral){
  const ws = wb.addWorksheet("Por Abogado");
  ws.columns = [{width:32},{width:26},{width:16}];
  ws.properties.outlineProperties = { summaryBelow: true, summaryRight: false };

  const headerRow = ws.addRow(["Abogado Tutela","Tipo Respuesta","Total"]);
  headerRow.height = 26;
  headerRow.eachCell(cell => {
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb: COLOR_ENCABEZADO_XLSX} };
    cell.font = { name:'Aptos Narrow', size:11, bold:true, color:{argb:'FFFFFFFF'} };
    cell.alignment = { horizontal:'center', vertical:'middle' };
  });
  ws.autoFilter = 'A1:C1';

  grupos.forEach(g => {
    const filaAbogado = ws.addRow([g.abogado, "", ""]);
    filaAbogado.font = { name:'Aptos Narrow', size:11, bold:true, color:{argb:'FF004941'} };

    g.filas.forEach(f => {
      const fila = ws.addRow(["", f.tipoRespuesta, f.total]);
      fila.outlineLevel = 1;
      fila.getCell(3).alignment = { horizontal:'right' };
      fila.getCell(3).numFmt = '"$"#,##0.00';
    });

    const filaTotal = ws.addRow(["", `Total ${g.abogado}`, g.totalAbogado]);
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

// Excel completo: hoja 1 = las tutelas del mes (mismo formato de siempre,
// ya filtradas), hoja 2 = el resumen agrupado por Abogado.
export async function generarInformeAbogadosTutelasExcel(tutelas, valoresEntidad, anio, mesIndex0){
  const { default: ExcelJS } = await import('exceljs');
  const filtradas = filtrarTutelasPorMes(tutelas, anio, mesIndex0);
  const { grupos, totalGeneral } = agruparPorAbogado(filtradas, valoresEntidad);

  const wb = new ExcelJS.Workbook();
  // Pedido explícito del usuario 2026-08-27: quitar "Valor Entidad" de esta
  // hoja específicamente (el Excel de "Total Tutelas" de siempre sí la
  // conserva) — acá solo interesa lo que se le paga al abogado.
  construirHojaTutelasXlsx(wb, filtradas, valoresEntidad, "Tutelas", { incluirValorEntidad: false });
  construirHojaPorAbogado(wb, grupos, totalGeneral);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Tutelas por Abogado - ${MESES_NOMBRES[mesIndex0]} ${anio}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
