// Cruce de Órdenes de compra con sus Facturas (2026-10-27, pedido del usuario: «verifica las facturas que crucen
// con su orden de compra para incluir el dato», con un botón aparte para esa búsqueda).
//
// El cruce que ya existía (facturaForOrdenCompra, en graph.js) exige que Contrato, Proceso y Etapa del contrato
// sean IGUALES letra por letra (sin tildes ni mayúsculas). Cuando una orden y su factura escriben distinto
// el proceso («2025-00264» / «202500264»), la etapa («Entrega Poder» / «Entrega de poder») o falta un dato,
// la orden queda «—» en el Excel aunque la factura exista. Esta búsqueda es más flexible, pero dice SIEMPRE
// con qué criterio encontró cada factura para que se pueda revisar:
//   Exacto      — Contrato + Proceso + Etapa iguales (el cruce de siempre).
//   Aproximado  — Contrato + Proceso (solo dígitos) + Etapa (sin artículos ni plurales) iguales.
//   Por valor   — mismo Contrato y mismo valor (subtotal o total), con el mismo Proceso o sin Proceso en alguno.
//   Por etapa   — mismo Contrato y misma Etapa, sin comparar el Proceso, solo si hay UNA sola candidata.
// En «Por valor» y «Por etapa» una factura no se le asigna a dos órdenes distintas.
import { normalize, facturaNumero, facturaForOrdenCompra, computeFacturaTotals, computeOrdenCompraTotals, fechaFromPartes } from './graph';

// Fecha de una factura u orden: igual que en las listas del portal, sale de Día / Mes / Año y, si no están, de la columna Fecha (que en SharePoint suele venir vacía).
export function fechaDeRegistro(r){
  return (r && (fechaFromPartes(r.Dia, r.Mes, r.Anio) || r.Fecha)) || "";
}

const ARTICULOS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'a', 'por']);

function soloDigitos(v){ return String(v == null ? '' : v).replace(/[^0-9]/g, ''); }

// «Entrega de Poder» y «Entrega poder» → «entrega poder»; «Asesorias» y «Asesoria» → «asesori».
export function claveEtapa(v){
  return normalize(v).split(/[^a-z0-9%]+/).filter(t => t && !ARTICULOS.has(t))
    .map(t => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t)).join(' ');
}
function claveContrato(v){ return normalize(v).replace(/[^a-z0-9]/g, ''); }

function mismoValor(a, b){ return a > 0 && b > 0 && Math.abs(a - b) < 1; }

// Devuelve un Map: id de la orden → { factura, metodo } o { factura: null, metodo: '' } si no se encontró ninguna.
export function buscarFacturasParaOrdenes(ordenes, facturas){
  const resultado = new Map();
  const lista = facturas || [];
  const info = lista.map(f => {
    const t = computeFacturaTotals(f);
    return { f, contrato: claveContrato(f.Contrato), proceso: soloDigitos(f.Proceso), etapa: claveEtapa(f.EtapaContrato), subtotal: t.subtotal, total: t.total, usada: false };
  });
  const porContrato = new Map();
  info.forEach(i => { if(i.contrato){ if(!porContrato.has(i.contrato)) porContrato.set(i.contrato, []); porContrato.get(i.contrato).push(i); } });
  const numeroDe = i => Number(facturaNumero(i.f)) || 0;
  const masReciente = candidatas => candidatas.slice().sort((a, b) => numeroDe(b) - numeroDe(a))[0];

  const pendientes = [];
  (ordenes || []).forEach(oc => {
    const exacta = facturaForOrdenCompra(lista, oc);
    if(exacta){ resultado.set(oc.id, { factura: exacta, metodo: 'Exacto' }); return; }
    const contrato = claveContrato(oc.Contrato);
    const candidatas = contrato ? (porContrato.get(contrato) || []) : [];
    const proceso = soloDigitos(oc.Proceso), etapa = claveEtapa(oc.EtapaContrato);
    const aprox = candidatas.filter(i => i.proceso && i.proceso === proceso && i.etapa && i.etapa === etapa);
    if(aprox.length){ resultado.set(oc.id, { factura: masReciente(aprox).f, metodo: 'Aproximado' }); return; }
    pendientes.push({ oc, candidatas, proceso, etapa });
  });

  // Segunda vuelta: criterios más débiles, sin repetir una factura en dos órdenes.
  pendientes.forEach(({ oc, candidatas, proceso, etapa }) => {
    const t = computeOrdenCompraTotals(oc);
    const libres = candidatas.filter(i => !i.usada);
    const porValor = libres.filter(i => (mismoValor(i.subtotal, t.subtotal) || mismoValor(i.total, t.total)) && (!proceso || !i.proceso || i.proceso === proceso));
    if(porValor.length){ const g = masReciente(porValor); g.usada = true; resultado.set(oc.id, { factura: g.f, metodo: 'Por valor' }); return; }
    const porEtapa = libres.filter(i => etapa && i.etapa === etapa);
    if(porEtapa.length === 1){ porEtapa[0].usada = true; resultado.set(oc.id, { factura: porEtapa[0].f, metodo: 'Por etapa' }); return; }
    resultado.set(oc.id, { factura: null, metodo: '' });
  });
  return resultado;
}

// Para el portal (2026-10-27, «así queda en el Excel pero no en el portal»): la factura de UNA orden con el mismo cruce flexible, calculado una sola vez
// por cada par de listas (facturas, órdenes) y reutilizado fila por fila. Devuelve { factura, metodo } (metodo '' si no hay factura).
const cachePortal = new WeakMap();
export function facturaDeOrden(facturas, oc, ordenes){
  if(!oc) return { factura: null, metodo: '' };
  const lista = facturas || [];
  if(ordenes && oc.id != null){
    let e = cachePortal.get(lista);
    if(!e || e.ordenes !== ordenes){ e = { ordenes, cruce: buscarFacturasParaOrdenes(ordenes, lista) }; cachePortal.set(lista, e); }
    const r = e.cruce.get(oc.id);
    if(r) return r;
  }
  const exacta = facturaForOrdenCompra(lista, oc);
  return { factura: exacta, metodo: exacta ? 'Exacto' : '' };
}
export function textoCruce(metodo){
  return metodo === 'Aproximado' ? 'Cruce aproximado: mismo contrato y proceso, con la etapa escrita distinto'
    : metodo === 'Por valor' ? 'Cruce por valor: mismo contrato y mismo valor'
    : metodo === 'Por etapa' ? 'Cruce por etapa: mismo contrato y misma etapa'
    : '';
}

// Resumen para avisarle al usuario qué pasó con la búsqueda.
export function resumenCruce(ordenes, cruce, facturas){
  let exactas = 0, nuevas = 0, sin = 0;
  (ordenes || []).forEach(oc => {
    const r = cruce.get(oc.id);
    if(!r || !r.factura){ sin++; return; }
    if(r.metodo === 'Exacto') exactas++; else nuevas++;
  });
  return { total: (ordenes || []).length, exactas, nuevas, sin };
}
