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
// con su cantidad. Guarda también las tutelas del grupo (`tutelas`): cada
// una se valora con SU PROPIA Entidad + Cliente + Tipo, exactamente igual
// que el Excel (ver valorDeTutela) — el 2026-10-05 el usuario mostró que el
// total de la Orden de compra no coincidía con el del Excel: antes se
// buscaba un solo valor por línea usando la Entidad de la primera tutela y
// el tipo de la primera "otra", y los demás tipos (cada uno con su valor
// distinto en "Valores Entidad") quedaban mal valorados.
export function agruparPorClienteParaOrden(tutelasDelMes){
  const porCliente = new Map();
  (tutelasDelMes||[]).forEach(t => {
    const cliente = (t.Cliente||"").trim();
    if(!cliente) return;
    if(!porCliente.has(cliente)) porCliente.set(cliente, { cliente, entidad: t.Entidad || "", cantidadTutela: 0, cantidadImpugnacion: 0, cantidadOtras: 0, tutelas: [] });
    const g = porCliente.get(cliente);
    if(!g.entidad && t.Entidad) g.entidad = t.Entidad;
    g.tutelas.push(t);
    const clase = claseDeTutela(t);
    if(clase === "TUTELA") g.cantidadTutela++;
    else if(clase === "IMPUGNACION") g.cantidadImpugnacion++;
    else g.cantidadOtras++;
  });
  return Array.from(porCliente.values()).sort((a,b) => a.cliente.localeCompare(b.cliente));
}

function claseDeTutela(t){
  const tipo = (t.TipoRespuesta||"").trim().toUpperCase();
  return tipo === "TUTELA" ? "TUTELA" : tipo === "IMPUGNACION" ? "IMPUGNACION" : "OTRAS";
}

// Valor de UNA tutela — el mismo cruce (y los mismos campos de la propia
// tutela) que usa el Excel en informeClientesTutelas.js, para que ambos
// totales siempre coincidan.
function valorDeTutela(valoresEntidad, t){
  const fila = buscarValorEntidad(valoresEntidad, t.Entidad, t.Cliente, t.TipoRespuesta);
  return fila ? parseMonto(fila.ValorEntidad) : 0;
}

// Líneas de la Orden de compra de un Cliente: una por cada clase (Tutelas,
// Impugnaciones, Otras) y valor unitario distinto — lo normal es una por
// clase; si dentro de una clase hay tutelas con valores distintos (p.ej. dos
// tipos de "Otras" que valen diferente) van en líneas aparte. La Orden solo
// tiene 6 líneas: si se pasan, las de una misma clase con menos tutelas se
// juntan en una con el valor promedio ponderado.
function lineasDeOrden(valoresEntidad, g){
  const lineas = [];
  ["TUTELA", "IMPUGNACION", "OTRAS"].forEach(clase => {
    const porValor = new Map();
    (g.tutelas || []).filter(t => claseDeTutela(t) === clase).forEach(t => {
      const valor = valorDeTutela(valoresEntidad, t);
      if(!porValor.has(valor)) porValor.set(valor, { clase, valor, cantidad: 0, tipos: [] });
      const l = porValor.get(valor);
      l.cantidad++;
      const nombre = (t.TipoRespuesta||"").trim() || "Sin tipo";
      if(!l.tipos.includes(nombre)) l.tipos.push(nombre);
    });
    const deClase = Array.from(porValor.values()).sort((a,b) => b.cantidad - a.cantidad);
    // Siempre queda al menos una línea por clase (con cantidad 0), igual que antes.
    lineas.push(...(deClase.length ? deClase : [{ clase, valor: 0, cantidad: 0, tipos: [] }]));
  });
  while(lineas.length > 6){
    // Primero se descarta una línea vacía (cantidad 0) antes de juntar
    // tutelas de distinto valor — no pierde ningún dato.
    const vacia = lineas.findIndex(l => l.cantidad === 0);
    if(vacia !== -1){ lineas.splice(vacia, 1); continue; }
    let idx = -1;
    for(let i = lineas.length - 1; i > 0; i--){ if(lineas[i].clase === lineas[i-1].clase){ idx = i; break; } }
    if(idx === -1) break;
    const a = lineas[idx-1], b = lineas[idx];
    const cantidad = a.cantidad + b.cantidad;
    lineas.splice(idx-1, 2, { clase: a.clase, cantidad, valor: Math.round((a.cantidad*a.valor + b.cantidad*b.valor) / cantidad * 100) / 100, tipos: [...new Set([...a.tipos, ...b.tipos])] });
  }
  return lineas;
}

// Arma el borrador de Orden de compra para un Cliente — mismos campos que
// espera OrdenCompraDrawer.jsx (`emptyForm`/`handleSave`), listo para
// abrirse con `abrirBorradorOrdenCompra` en useLexaraApp.js. Corregido
// 2026-08-29: cada línea (Tutelas/Impugnaciones/Otras) busca su PROPIO
// valor unitario real (Entidad + Cliente + Tipo, ver buscarValorEntidad en
// graph.js) — antes se usaba un solo valor para las 3 líneas, buscado solo
// por Entidad, que daba un total muy por encima del real.
export function construirBorradorOrdenCompra(grupoCliente, mesIndex0, anio, valoresEntidad, clientes){
  const { cliente } = grupoCliente;
  const clienteReal = (clientes||[]).find(c => c.RazonSocial === cliente);
  const contrato = CONTRATO_POR_CLIENTE[cliente] || "";
  const lineas = lineasDeOrden(valoresEntidad, grupoCliente);
  const hoy = new Date();
  // Pedido explícito del usuario 2026-08-29 (viendo el borrador real ya
  // armado): este texto va en la Descripción de la 1ª línea, no en
  // Observación (que queda vacía) — reemplaza el "Tutelas" corto que tenía
  // esa línea.
  const descripcionLinea1 = `Honorarios generados dentro del Contrato ${contrato || "—"} en MD ABOGADOS SAS y ${cliente} por las contestaciones de tutelas hechas en el mes de ${MESES_NOMBRES[mesIndex0]} del ${anio}`;
  const borrador = {
    CodigoCliente: clienteReal ? String(clienteReal.id) : "",
    Contrato: contrato,
    Ciudad: clienteReal?.Ciudad || "Bogota D.C",
    Proceso: "Tutelas",
    EtapaContrato: "Tutelas",
    Observacion: "",
    Dia: String(hoy.getDate()),
    Mes: String(hoy.getMonth() + 1).padStart(2, '0'),
    Anio: String(hoy.getFullYear()),
  };
  const hayVariasOtras = lineas.filter(l => l.clase === "OTRAS").length > 1;
  lineas.forEach((l, i) => {
    const n = i + 1;
    borrador[`Descripcion${n}`] = i === 0 ? descripcionLinea1
      : l.clase === "TUTELA" ? "Tutelas"
      : l.clase === "IMPUGNACION" ? "Impugnaciones"
      : (hayVariasOtras && l.tipos.length ? `Otras contestaciones (${l.tipos.join(", ")})` : "Otras contestaciones");
    borrador[`Cantidad${n}`] = String(l.cantidad);
    borrador[`ValorUnitario${n}`] = (l.cantidad && l.valor) ? fmtMonto(l.valor) : "";
  });
  return borrador;
}

// Detalle en pesos por cliente (Tutelas/Impugnaciones/Otras) — pedido
// explícito del usuario 2026-08-29: "démosle una visual de estos
// resultados así como en Tutelas por Abogado". Misma forma de resultado
// que agruparPorAbogado/agruparPorCliente (`{cliente, filas, totalCliente}`)
// para reusar StackedBarChart y las tarjetas de detalle sin cambios.
export function calcularDetalleValoresPorCliente(grupos, valoresEntidad){
  let totalGeneral = 0;
  const detalle = (grupos||[]).map(g => {
    // Suma tutela por tutela (igual que el Excel) — así los totales coinciden.
    const total = { TUTELA: 0, IMPUGNACION: 0, OTRAS: 0 };
    (g.tutelas || []).forEach(t => { total[claseDeTutela(t)] += valorDeTutela(valoresEntidad, t); });
    const filas = [];
    if(g.cantidadTutela) filas.push({ tipoRespuesta: "TUTELA", total: total.TUTELA, cantidad: g.cantidadTutela });
    if(g.cantidadImpugnacion) filas.push({ tipoRespuesta: "IMPUGNACION", total: total.IMPUGNACION, cantidad: g.cantidadImpugnacion });
    if(g.cantidadOtras) filas.push({ tipoRespuesta: "Otras contestaciones", total: total.OTRAS, cantidad: g.cantidadOtras });
    const totalCliente = total.TUTELA + total.IMPUGNACION + total.OTRAS;
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
