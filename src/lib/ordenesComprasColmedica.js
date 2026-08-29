// "Órdenes Colmédica" (Administración) — pedido explícito del usuario
// 2026-08-29: genera, por cada Cliente que tenga tutelas en el mes elegido,
// un borrador de Orden de compra ya armado (para revisar/completar y darle
// "Guardar cambios" uno por uno — nunca se crea nada en SharePoint solo) +
// un Excel de referencia con el mismo detalle de todos los clientes juntos.
//
// IMPORTANTE — este ciclo de mes es DISTINTO al de "Tutelas por
// Abogado"/"Tutelas por Cliente" (que cortan siempre el día 28): acá el
// usuario pidió explícitamente el mes calendario completo, día 1 al 30/31
// según el mes, por fecha de Vencimiento.
import { parseMonto, fmtMonto } from './graph';

export const MESES_NOMBRES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// Único dato que no existe en ninguna lista de SharePoint — el usuario lo
// dio a mano por chat 2026-08-29 y pidió dejarlo fijo en el código para
// estos 3 clientes específicos (no hay un campo "Contrato" propio en la
// lista Clientes todavía). Si aparece un cliente nuevo sin contrato acá, el
// campo queda vacío para completarlo a mano en el borrador.
export const CONTRATO_POR_CLIENTE = {
  "COLMEDICA MEDICINA PREPAGADA S.A.": "08 Mayo de 2013",
  "ALIANSALUD ENTIDAD PROMOTORA DE SALUD S.A.": "Propuesta 20 Octubre 2021",
  "UNIDAD MÉDICA Y DE DIAGNÓSTICO S.A.": "Julio de 2020",
};

// Mes calendario completo (1 al 30/31, según el mes) — a diferencia del
// corte fijo día 28 que usan los otros 2 informes de Tutelas.
export function rangoMesCalendario(anio, mesIndex0){
  const inicio = new Date(anio, mesIndex0, 1, 0, 0, 0, 0);
  const fin = new Date(anio, mesIndex0 + 1, 0, 23, 59, 59, 999); // día 0 del mes siguiente = último día de este mes
  return { inicio, fin };
}

function fechaDeTutela(iso){
  if(!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if(!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}

export function filtrarTutelasPorMesCalendario(tutelas, anio, mesIndex0){
  const { inicio, fin } = rangoMesCalendario(anio, mesIndex0);
  return (tutelas||[]).filter(t => {
    const d = fechaDeTutela(t.FechaVencimiento);
    return d && d >= inicio && d <= fin;
  });
}

// Agrupa por Cliente las 3 líneas pedidas: Tutelas / Impugnaciones / Otras
// contestaciones (todo lo que no sea ni Tutela ni Impugnación) — cada una
// con su cantidad, y el Entidad de esas tutelas (para buscar el Valor
// Entidad, debería ser el mismo "GRUPO COLMEDICA" para todas).
export function agruparPorClienteParaOrden(tutelasDelMes){
  const porCliente = new Map();
  (tutelasDelMes||[]).forEach(t => {
    const cliente = (t.Cliente||"").trim();
    if(!cliente) return;
    if(!porCliente.has(cliente)) porCliente.set(cliente, { cliente, entidad: t.Entidad || "", cantidadTutela: 0, cantidadImpugnacion: 0, cantidadOtras: 0 });
    const g = porCliente.get(cliente);
    if(!g.entidad && t.Entidad) g.entidad = t.Entidad;
    const tipo = (t.TipoRespuesta||"").trim().toUpperCase();
    if(tipo === "TUTELA") g.cantidadTutela++;
    else if(tipo === "IMPUGNACION") g.cantidadImpugnacion++;
    else g.cantidadOtras++;
  });
  return Array.from(porCliente.values()).sort((a,b) => a.cliente.localeCompare(b.cliente));
}

// Valor unitario de cada línea — buscado en Valores Entidad por la Entidad
// de las tutelas de ese cliente ("Valor Entidad", es lo que se le cobra AL
// cliente — la misma columna que ya usa "Tutelas por Cliente" — no "Valor
// Abogado", que es lo que se le paga al abogado).
function valorUnitarioPara(entidad, valoresEntidad){
  const valorEnt = (valoresEntidad||[]).find(v => v.Entidad === entidad);
  return valorEnt ? parseMonto(valorEnt.ValorEntidad) : 0;
}

// Arma el borrador de Orden de compra para un Cliente — mismos campos que
// espera OrdenCompraDrawer.jsx (`emptyForm`/`handleSave`), listo para
// abrirse con `abrirBorradorOrdenCompra` en useLexaraApp.js.
export function construirBorradorOrdenCompra(grupoCliente, mesIndex0, anio, valoresEntidad, clientes){
  const { cliente, entidad, cantidadTutela, cantidadImpugnacion, cantidadOtras } = grupoCliente;
  const clienteReal = (clientes||[]).find(c => c.RazonSocial === cliente);
  const contrato = CONTRATO_POR_CLIENTE[cliente] || "";
  const valorUnitario = valorUnitarioPara(entidad, valoresEntidad);
  const hoy = new Date();
  const observacion = `Honorarios generados dentro del Contrato ${contrato || "—"} en MD ABOGADOS SAS y ${cliente} por las contestaciones de tutelas hechas en el mes de ${MESES_NOMBRES[mesIndex0]} del ${anio}`;
  return {
    CodigoCliente: clienteReal ? String(clienteReal.id) : "",
    Contrato: contrato,
    Ciudad: clienteReal?.Ciudad || "Bogota D.C",
    Proceso: "Tutelas",
    EtapaContrato: "Tutelas",
    Observacion: observacion,
    Dia: String(hoy.getDate()),
    Mes: String(hoy.getMonth() + 1).padStart(2, '0'),
    Anio: String(hoy.getFullYear()),
    Descripcion1: "Tutelas", Cantidad1: String(cantidadTutela), ValorUnitario1: cantidadTutela ? fmtMonto(valorUnitario) : "",
    Descripcion2: "Impugnaciones", Cantidad2: String(cantidadImpugnacion), ValorUnitario2: cantidadImpugnacion ? fmtMonto(valorUnitario) : "",
    Descripcion3: "Otras contestaciones", Cantidad3: String(cantidadOtras), ValorUnitario3: cantidadOtras ? fmtMonto(valorUnitario) : "",
  };
}

// Excel de referencia con el detalle de TODOS los clientes de ese mes junto
// — mismo estilo institucional del resto de Informes.
export async function generarExcelOrdenesColmedica(gruposPorCliente, mesIndex0, anio, valoresEntidad){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Órdenes Colmédica");
  ws.columns = [{width:34},{width:20},{width:14},{width:14},{width:16},{width:16}];
  const header = ws.addRow(["Cliente","Contrato","Tutelas","Impugnaciones","Otras contestaciones","Valor unitario"]);
  header.height = 26;
  header.eachCell(cell => {
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF004941'} };
    cell.font = { name:'Aptos Narrow', size:11, bold:true, color:{argb:'FFFFFFFF'} };
    cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
  });
  gruposPorCliente.forEach(g => {
    const valorUnitario = valorUnitarioPara(g.entidad, valoresEntidad);
    const row = ws.addRow([g.cliente, CONTRATO_POR_CLIENTE[g.cliente] || "", g.cantidadTutela, g.cantidadImpugnacion, g.cantidadOtras, valorUnitario]);
    row.getCell(6).numFmt = '"$"#,##0.00';
    row.eachCell(cell => { cell.alignment = { horizontal:'center', vertical:'middle' }; });
  });
  ws.views = [{ state:'frozen', ySplit:1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Órdenes Colmédica - ${MESES_NOMBRES[mesIndex0]} ${anio}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
