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

// Descripción de la línea de detalle (Descripcion1..6) como conjunto de palabras: sirve para elegir entre varias coincidencias (p. ej. «…contestaciones de tutelas hechas en el mes de Octubre del 2026»
// separa la orden y la factura de Octubre de las de Septiembre aunque compartan contrato, proceso, etapa y hasta el valor).
const PALABRAS_VACIAS = new Set(['por', 'las', 'los', 'del', 'con', 'para', 'una', 'uno', 'que', 'mes']);
function palabrasDescripcion(r){
  const texto = [1, 2, 3, 4, 5, 6].map(n => r && r['Descripcion' + n]).filter(Boolean).join(' ');
  return new Set(normalize(texto).split(/[^a-z0-9]+/).filter(p => p.length >= 3 && !PALABRAS_VACIAS.has(p)));
}
function parecidoDescripcion(a, b){
  if(!a.size || !b.size) return 0;
  let comunes = 0; a.forEach(p => { if(b.has(p)) comunes++; });
  return comunes / (a.size + b.size - comunes);   // Jaccard: 1 = misma descripción
}

function mismoValor(a, b){ return a > 0 && b > 0 && Math.abs(a - b) < 1; }

// Devuelve un Map: id de la orden → { factura, metodo } o { factura: null, metodo: '' } si no se encontró ninguna.
export function buscarFacturasParaOrdenes(ordenes, facturas){
  const resultado = new Map();
  const lista = facturas || [];
  const info = lista.map(f => {
    const t = computeFacturaTotals(f);
    return { f, contrato: claveContrato(f.Contrato), proceso: soloDigitos(f.Proceso), etapa: claveEtapa(f.EtapaContrato), subtotal: t.subtotal, total: t.total, palabras: palabrasDescripcion(f), usada: false };
  });
  const porContrato = new Map();
  info.forEach(i => { if(i.contrato){ if(!porContrato.has(i.contrato)) porContrato.set(i.contrato, []); porContrato.get(i.contrato).push(i); } });
  const numeroDe = i => Number(facturaNumero(i.f)) || 0;
  const masReciente = (candidatas, oc) => {
    const palabrasOC = oc ? palabrasDescripcion(oc) : null;
    return candidatas.slice().sort((a, b) => (palabrasOC ? parecidoDescripcion(palabrasOC, b.palabras) - parecidoDescripcion(palabrasOC, a.palabras) : 0) || numeroDe(b) - numeroDe(a))[0];
  };

  // «Exacto» (2026-11-11, pedido del usuario: «la búsqueda de la factura en las órdenes de compra relaciona más de una factura»): las órdenes del Grupo Colmédica de todos los meses comparten
  // Contrato + Proceso + Etapa («Julio de 2020» / «Tutelas» / «Tutelas»), y el cruce de siempre las mandaba TODAS a la factura de número más alto. Ahora, entre las órdenes y las facturas que
  // comparten esas tres claves, cada factura se le da a UNA sola orden: primero la que tiene el mismo valor (subtotal o total) y, si no hay, la factura libre de fecha más cercana.
  const clave3 = (c, p, e) => normalize(c) + '\u0001' + normalize(p) + '\u0001' + normalize(e);
  const gruposF = new Map();
  info.forEach(i => { const k = clave3(i.f.Contrato, i.f.Proceso, i.f.EtapaContrato); if(!gruposF.has(k)) gruposF.set(k, []); gruposF.get(k).push(i); });
  const gruposO = new Map();
  (ordenes || []).forEach(oc => { if(!oc || !oc.Contrato) return; const k = clave3(oc.Contrato, oc.Proceso, oc.EtapaContrato); if(!gruposO.has(k)) gruposO.set(k, []); gruposO.get(k).push(oc); });
  const fechaMs = r => { const d = fechaDeRegistro(r); const ms = d ? Date.parse(String(d).slice(0, 10)) : NaN; return Number.isFinite(ms) ? ms : null; };
  const masCercana = (candidatas, oc) => {
    const f0 = fechaMs(oc);
    return candidatas.slice().sort((a, b) => {
      const da = f0 != null && fechaMs(a.f) != null ? Math.abs(fechaMs(a.f) - f0) : Infinity;
      const db = f0 != null && fechaMs(b.f) != null ? Math.abs(fechaMs(b.f) - f0) : Infinity;
      return da - db || numeroDe(b) - numeroDe(a);
    })[0];
  };
  gruposO.forEach((ocs, k) => {
    const fs = gruposF.get(k) || [];
    if(!fs.length) return;
    const asignar = (oc, i) => { i.usada = true; resultado.set(oc.id, { factura: i.f, metodo: 'Exacto' }); };
    if(fs.length === 1 && ocs.length === 1){ asignar(ocs[0], fs[0]); return; }   // el caso normal
    // Puntaje de cada par: mismo valor (subtotal o total) pesa más, luego la misma descripción, y a igualdad la fecha más cercana. Se asigna de mejor a peor, una factura por orden.
    const pares = [];
    ocs.forEach(oc => {
      const t3 = computeOrdenCompraTotals(oc), palabrasOC = palabrasDescripcion(oc), f0 = fechaMs(oc);
      fs.forEach(i => {
        const dias = f0 != null && fechaMs(i.f) != null ? Math.abs(fechaMs(i.f) - f0) / 86400000 : 400;
        const puntaje = (mismoValor(i.subtotal, t3.subtotal) || mismoValor(i.total, t3.total) ? 1000 : 0) + Math.round(parecidoDescripcion(palabrasOC, i.palabras) * 500) - Math.min(dias, 400);
        pares.push({ oc, i, puntaje });
      });
    });
    pares.sort((a, b) => b.puntaje - a.puntaje || numeroDe(b.i) - numeroDe(a.i));
    const ocsListas = new Set();
    pares.forEach(p => { if(ocsListas.has(p.oc.id) || p.i.usada) return; ocsListas.add(p.oc.id); asignar(p.oc, p.i); });
  });

  const pendientes = [];
  (ordenes || []).forEach(oc => {
    if(resultado.has(oc.id)) return;
    const contrato = claveContrato(oc.Contrato);
    const candidatas = contrato ? (porContrato.get(contrato) || []) : [];
    const proceso = soloDigitos(oc.Proceso), etapa = claveEtapa(oc.EtapaContrato);
    const aprox = candidatas.filter(i => !i.usada && i.proceso && i.proceso === proceso && i.etapa && i.etapa === etapa);
    if(aprox.length){ resultado.set(oc.id, { factura: masReciente(aprox, oc).f, metodo: 'Aproximado' }); return; }
    pendientes.push({ oc, candidatas, proceso, etapa });
  });

  // Segunda vuelta: criterios más débiles, sin repetir una factura en dos órdenes.
  pendientes.forEach(({ oc, candidatas, proceso, etapa }) => {
    const t = computeOrdenCompraTotals(oc);
    const libres = candidatas.filter(i => !i.usada);
    const porValor = libres.filter(i => (mismoValor(i.subtotal, t.subtotal) || mismoValor(i.total, t.total)) && (!proceso || !i.proceso || i.proceso === proceso));
    if(porValor.length){ const g = masReciente(porValor, oc); g.usada = true; resultado.set(oc.id, { factura: g.f, metodo: 'Por valor' }); return; }
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
