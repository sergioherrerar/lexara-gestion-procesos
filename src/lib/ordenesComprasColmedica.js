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
import { parseMonto, fmtMonto, buscarValorEntidad } from './graph';
import { descargarExcelClientesTutelas } from './informeClientesTutelas';

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
// con su cantidad. También guarda un Tipo Respuesta "de muestra" para la
// línea de Otras (`tipoMuestraOtras`) — esa línea junta VARIOS Tipo
// Respuesta reales distintos (Aclaración, Alcance, etc.), pero el cruce
// real de "Valores Entidad" da el MISMO valor para todos esos tipos por
// cliente (confirmado con datos reales 2026-08-29) — con cualquiera de
// ellos alcanza para buscar el valor correcto de esa línea.
export function agruparPorClienteParaOrden(tutelasDelMes){
  const porCliente = new Map();
  (tutelasDelMes||[]).forEach(t => {
    const cliente = (t.Cliente||"").trim();
    if(!cliente) return;
    if(!porCliente.has(cliente)) porCliente.set(cliente, { cliente, entidad: t.Entidad || "", cantidadTutela: 0, cantidadImpugnacion: 0, cantidadOtras: 0, tipoMuestraOtras: "" });
    const g = porCliente.get(cliente);
    if(!g.entidad && t.Entidad) g.entidad = t.Entidad;
    const tipo = (t.TipoRespuesta||"").trim().toUpperCase();
    if(tipo === "TUTELA") g.cantidadTutela++;
    else if(tipo === "IMPUGNACION") g.cantidadImpugnacion++;
    else { g.cantidadOtras++; if(!g.tipoMuestraOtras) g.tipoMuestraOtras = t.TipoRespuesta; }
  });
  return Array.from(porCliente.values()).sort((a,b) => a.cliente.localeCompare(b.cliente));
}

// Arma el borrador de Orden de compra para un Cliente — mismos campos que
// espera OrdenCompraDrawer.jsx (`emptyForm`/`handleSave`), listo para
// abrirse con `abrirBorradorOrdenCompra` en useLexaraApp.js. Corregido
// 2026-08-29: cada línea (Tutelas/Impugnaciones/Otras) busca su PROPIO
// valor unitario real (Entidad + Cliente + Tipo, ver buscarValorEntidad en
// graph.js) — antes se usaba un solo valor para las 3 líneas, buscado solo
// por Entidad, que daba un total muy por encima del real.
export function construirBorradorOrdenCompra(grupoCliente, mesIndex0, anio, valoresEntidad, clientes){
  const { cliente, entidad, cantidadTutela, cantidadImpugnacion, cantidadOtras, tipoMuestraOtras } = grupoCliente;
  const clienteReal = (clientes||[]).find(c => c.RazonSocial === cliente);
  const contrato = CONTRATO_POR_CLIENTE[cliente] || "";
  const valorTutela = buscarValorEntidad(valoresEntidad, entidad, cliente, "TUTELA");
  const valorImpugnacion = buscarValorEntidad(valoresEntidad, entidad, cliente, "IMPUGNACION");
  const valorOtras = tipoMuestraOtras ? buscarValorEntidad(valoresEntidad, entidad, cliente, tipoMuestraOtras) : null;
  const hoy = new Date();
  // Pedido explícito del usuario 2026-08-29 (viendo el borrador real ya
  // armado): este texto va en la Descripción de la 1ª línea, no en
  // Observación (que queda vacía) — reemplaza el "Tutelas" corto que tenía
  // esa línea.
  const descripcionLinea1 = `Honorarios generados dentro del Contrato ${contrato || "—"} en MD ABOGADOS SAS y ${cliente} por las contestaciones de tutelas hechas en el mes de ${MESES_NOMBRES[mesIndex0]} del ${anio}`;
  return {
    CodigoCliente: clienteReal ? String(clienteReal.id) : "",
    Contrato: contrato,
    Ciudad: clienteReal?.Ciudad || "Bogota D.C",
    Proceso: "Tutelas",
    EtapaContrato: "Tutelas",
    Observacion: "",
    Dia: String(hoy.getDate()),
    Mes: String(hoy.getMonth() + 1).padStart(2, '0'),
    Anio: String(hoy.getFullYear()),
    Descripcion1: descripcionLinea1, Cantidad1: String(cantidadTutela), ValorUnitario1: (cantidadTutela && valorTutela) ? fmtMonto(parseMonto(valorTutela.ValorEntidad)) : "",
    Descripcion2: "Impugnaciones", Cantidad2: String(cantidadImpugnacion), ValorUnitario2: (cantidadImpugnacion && valorImpugnacion) ? fmtMonto(parseMonto(valorImpugnacion.ValorEntidad)) : "",
    Descripcion3: "Otras contestaciones", Cantidad3: String(cantidadOtras), ValorUnitario3: (cantidadOtras && valorOtras) ? fmtMonto(parseMonto(valorOtras.ValorEntidad)) : "",
  };
}

// Detalle en pesos por cliente (Tutelas/Impugnaciones/Otras) — pedido
// explícito del usuario 2026-08-29: "démosle una visual de estos
// resultados así como en Tutelas por Abogado". Misma forma de resultado
// que agruparPorAbogado/agruparPorCliente (`{cliente, filas, totalCliente}`)
// para reusar StackedBarChart y las tarjetas de detalle sin cambios.
export function calcularDetalleValoresPorCliente(grupos, valoresEntidad){
  let totalGeneral = 0;
  const detalle = (grupos||[]).map(g => {
    const valorTutela = buscarValorEntidad(valoresEntidad, g.entidad, g.cliente, "TUTELA");
    const valorImpugnacion = buscarValorEntidad(valoresEntidad, g.entidad, g.cliente, "IMPUGNACION");
    const valorOtras = g.tipoMuestraOtras ? buscarValorEntidad(valoresEntidad, g.entidad, g.cliente, g.tipoMuestraOtras) : null;
    const totalTutela = g.cantidadTutela * (valorTutela ? parseMonto(valorTutela.ValorEntidad) : 0);
    const totalImpugnacion = g.cantidadImpugnacion * (valorImpugnacion ? parseMonto(valorImpugnacion.ValorEntidad) : 0);
    const totalOtras = g.cantidadOtras * (valorOtras ? parseMonto(valorOtras.ValorEntidad) : 0);
    const filas = [];
    if(g.cantidadTutela) filas.push({ tipoRespuesta: "TUTELA", total: totalTutela });
    if(g.cantidadImpugnacion) filas.push({ tipoRespuesta: "IMPUGNACION", total: totalImpugnacion });
    if(g.cantidadOtras) filas.push({ tipoRespuesta: "Otras contestaciones", total: totalOtras });
    const totalCliente = totalTutela + totalImpugnacion + totalOtras;
    totalGeneral += totalCliente;
    return { cliente: g.cliente, filas, totalCliente };
  });
  return { detalle, totalGeneral };
}

// Excel — pedido explícito del usuario 2026-08-29 viendo el primero armado
// ("El Excel esta mal debe ser el mismo de tutelas por abogado solo
// cambiamos la columna Valor Abogado dejamos valor entidad"): el MISMO
// Excel de 2 hojas que ya arma "Tutelas por Cliente" (Informes) — hoja 1
// con las tutelas ya filtradas (columna "Valor Entidad", sin "Valor
// Abogado"), hoja 2 agrupada por Cliente con outline tipo dinámica — solo
// que acá filtrado por el mes CALENDARIO completo de esta pestaña (no el
// corte-28 que usa el informe de Informes). Reusa `descargarExcelClientesTutelas`
// (informeClientesTutelas.js) para no duplicar el armado del workbook.
// `cliente` opcional (2026-08-29) — para el Excel de un solo cliente
// (botón por fila), se agrega su nombre al archivo para no confundirlo con
// el general de todos juntos.
export async function generarExcelOrdenesColmedica(tutelasDelMes, valoresEntidad, mesIndex0, anio, cliente){
  const sufijo = cliente ? ` - ${cliente}` : "";
  await descargarExcelClientesTutelas(tutelasDelMes, valoresEntidad, `Tutelas por Cliente - Colmédica${sufijo} - ${MESES_NOMBRES[mesIndex0]} ${anio}.xlsx`);
}
