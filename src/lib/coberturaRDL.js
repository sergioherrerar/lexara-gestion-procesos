// «Cobertura de la vigilancia (RDL)» (2026-11-27, pedido del usuario): RDL Servicios Jurídicos vigila los procesos y cobra POR PROCESO cada mes (factura hacia el día 30, por el mes en curso).
// Cada día envía el «Informe de novedades judiciales» (una tabla: ciudad, despacho, radicado con enlace a su carpeta de Drive, consecutivo, partes, ACTUACIÓN con sus fechas, términos, ubicación).
// Aquí se LEEN esos informes y se comparan con lo que dice la Rama de cada proceso vigente, para tener evidencia mensual de:
//   · actuaciones IMPORTANTES de la Rama que RDL no reportó (pasados 2 días hábiles) o reportó tarde,
//   · procesos que RDL cobra y en el mes no reportó ninguna novedad,
//   · procesos Terminados en el portal que RDL sigue reportando,
//   · procesos que RDL reporta y no están en el portal.
// Reglas acordadas con el usuario: periodo = el mes calendario en curso; «no reportó» = pasaron 2 días hábiles judiciales desde la actuación; cuentan solo las actuaciones importantes. Funciones puras, sin red.
import { clasificarActuacion } from './ramaResumen.js';
import { sumarDiasHabilesJudiciales } from './audienciasTerminos.js';

const MES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12 };
const sinTildes = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const iso = v => String(v || '').slice(0, 10);
function pad(n){ return String(n).padStart(2, '0'); }

function decodificar(t){
  return String(t || '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function textoCelda(h){
  return decodificar(String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
}
function fechaDMA(t){ const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(t || '')); return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : ''; }

/** Primeros 21 dígitos de un radicado (la terminación 00/01… no cuenta: es la instancia). */
export function c21De(texto){ const d = String(texto || '').replace(/\D/g, ''); return d.length >= 21 ? d.slice(0, 21) : ''; }

/** Las actuaciones con fecha que trae la celda «Actuación» de RDL: [{ fecha, titulo, texto }]. */
export function actuacionesDeCelda(texto){
  const salida = [];
  String(texto || '').split(/\n/).forEach(linea => {
    const m = /^\s*(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]{3,5})\.?\s+(\d{4})\s+-\s+(.*)$/.exec(linea);
    const mes = m && MES[sinTildes(m[2])];
    if(m && mes){
      const resto = m[4].trim(); const corte = resto.indexOf(' - ');
      salida.push({ fecha: `${m[3]}-${pad(mes)}-${pad(m[1])}`, titulo: (corte >= 0 ? resto.slice(0, corte) : resto).trim(), texto: resto });
    }else if(salida.length && linea.trim()){
      salida[salida.length - 1].texto += ' ' + linea.trim();
    }
  });
  return salida;
}

/** Lee la tabla del correo «Informe de novedades judiciales» (HTML): [{ ciudad, despacho, radicado, c21, consecutivo, tipo, apoderado, demandante, demandado, actuaciones[], inicioTermino, finTermino, registro, ubicacion, drive, recibido }]. */
export function parsearInformeRDL(html, recibido = ''){
  const filas = [];
  const trs = String(html || '').split(/<tr[\s>]/i).slice(1);
  let columnas = null;
  trs.forEach(tr => {
    const celdas = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => ({ html: m[1], texto: textoCelda(m[1]) }));
    if(celdas.length < 8) return;
    const nombres = celdas.map(c => sinTildes(c.texto).replace(/\s+/g, ' ').trim());
    if(!columnas){
      if(nombres.includes('radicado') && nombres.some(n => n.startsWith('actuacion'))){
        columnas = {}; nombres.forEach((n, i) => { columnas[n] = i; });
      }
      return;
    }
    const v = nombre => { const i = columnas[nombre]; return i == null ? '' : (celdas[i] ? celdas[i].texto : ''); };
    const radCelda = celdas[columnas['radicado']];
    const radicado = String(radCelda ? radCelda.texto : '').replace(/\D/g, '');
    const enlace = radCelda ? ((/href="([^"]+)"/i.exec(radCelda.html) || [])[1] || '') : '';
    const acts = actuacionesDeCelda(v('actuacion'));
    filas.push({
      ciudad: v('ciudad'), despacho: v('despacho'), radicado, c21: c21De(radicado), consecutivo: v('consecutivo'), tipo: v('tipo de proceso'),
      apoderado: v('apoderado'), demandante: v('demandante'), demandado: v('demandado'),
      actuaciones: acts, actuacionTexto: v('actuacion'), inicioTermino: fechaDMA(v('inicio termino')), finTermino: fechaDMA(v('fin termino')), registro: fechaDMA(v('fecha de registro')),
      ubicacion: v('ubicacion'), drive: decodificar(enlace), recibido: iso(recibido),
    });
  });
  return filas;
}

/** Lo que RDL reportó, por proceso: Map c21 → { filas[], fechas: Map(fecha → { titulos[], primerRecibido }), drive, ultimoRecibido }. */
export function reportadoPorRDL(informes){
  const mapa = new Map();
  (informes || []).forEach(inf => (inf.filas || []).forEach(f => {
    if(!f.c21) return;
    if(!mapa.has(f.c21)) mapa.set(f.c21, { filas: [], fechas: new Map(), drive: '', ultimoRecibido: '', despacho: f.despacho, demandante: f.demandante, demandado: f.demandado, radicado: f.radicado, consecutivo: f.consecutivo });
    const e = mapa.get(f.c21);
    e.filas.push(f);
    if(f.drive) e.drive = f.drive;
    if(!e.ultimoRecibido || f.recibido > e.ultimoRecibido) e.ultimoRecibido = f.recibido;
    const fechas = f.actuaciones.length ? f.actuaciones : (f.registro ? [{ fecha: f.registro, titulo: '' }] : []);
    fechas.forEach(a => {
      const x = e.fechas.get(a.fecha) || { titulos: [], primerRecibido: '' };
      if(a.titulo && !x.titulos.includes(a.titulo)) x.titulos.push(a.titulo);
      if(f.recibido && (!x.primerRecibido || f.recibido < x.primerRecibido)) x.primerRecibido = f.recibido;
      e.fechas.set(a.fecha, x);
    });
  }));
  return mapa;
}

/** Días hábiles judiciales que pasaron desde `desde` hasta `hasta` (0 si es el mismo día). */
export function retrasoHabiles(desde, hasta){
  const d = iso(desde), h = iso(hasta);
  if(!d || !h || h <= d) return 0;
  let n = 0; let f = d;
  for(let i = 0; i < 400 && f < h; i++){ const s = sumarDiasHabilesJudiciales(f, 1); if(!s || s <= f) break; f = s; if(f <= h) n++; else break; }
  return n;
}

export function rangoDelMes(anio, mes, hoy){
  const ini = `${anio}-${pad(mes)}-01`;
  const ult = new Date(anio, mes, 0).getDate();
  const fin = `${anio}-${pad(mes)}-${pad(ult)}`;
  return { ini, fin, hasta: hoy && hoy < fin ? hoy : fin };
}

/**
 * Compara lo que RDL reportó con las actuaciones de la Rama.
 * entradas: { informes: [{ recibido, filas }], procesos (del portal), actuacionesRama: { c21: [acts] | undefined }, filasExcel (el Excel mensual de RDL, opcional), mes: { ini, fin }, hoy, gracia = 2, c21sProceso(proceso) → [c21 principal, c21 del histórico…] }
 */
export function compararCobertura({ informes, procesos, actuacionesRama, filasExcel, mes, hoy, gracia = 2, c21sProceso }){
  const rdl = reportadoPorRDL(informes);
  const c21Proceso = p => (c21sProceso(p) || [])[0] || '';
  // Lo que RDL reportó de un proceso, juntando todos sus radicados (el actual y los del histórico)
  const rdlDe = p => { const e = (c21sProceso(p) || []).map(k => rdl.get(k)).filter(Boolean); if(!e.length) return null; if(e.length === 1) return e[0]; const fechas = new Map(); e.forEach(y => y.fechas.forEach((v, k) => { if(!fechas.has(k)) fechas.set(k, v); })); return { ...e[0], fechas, drive: e.map(y => y.drive).find(Boolean) || '' }; };
  const dentro = f => f >= mes.ini && f <= mes.fin;
  const noReportadas = [], tardias = [], enPlazo = [];
  const porProceso = [];
  const vigentes = (procesos || []).filter(p => String(p.EstadoVT || '').trim().toUpperCase() === 'VIGENTE');
  const vistos = new Set();
  vigentes.forEach(p => {
    const k = c21Proceso(p);
    if(!k || vistos.has(k)) return;   // varios registros del portal pueden ser el mismo expediente: se cuenta una vez
    vistos.add(k);
    const acts = actuacionesRama ? actuacionesRama[k] : undefined;
    if(!acts) return;
    const r = rdlDe(p);
    const imp = acts.filter(a => dentro(iso(a.fecha)) && clasificarActuacion(a).importante);
    const fila = { proceso: p, c21: k, importantes: imp.length, reportadas: 0, tardias: 0, noReportadas: 0, enPlazo: 0, rdlEnElMes: r ? [...r.fechas.keys()].filter(dentro).length : 0, drive: r ? r.drive : '' };
    imp.forEach(a => {
      const f = iso(a.fecha); const rep = r && r.fechas.get(f);
      const limite = sumarDiasHabilesJudiciales(f, gracia);
      const registro = { proceso: p, c21: k, fecha: f, actuacion: a.actuacion, anotacion: a.anotacion || '', drive: r ? r.drive : '' };
      if(rep){
        const retraso = rep.primerRecibido ? retrasoHabiles(f, rep.primerRecibido) : 0;
        if(retraso > gracia){ fila.tardias++; tardias.push({ ...registro, recibido: rep.primerRecibido, retraso }); } else fila.reportadas++;
      }else if(limite && limite <= hoy){ fila.noReportadas++; noReportadas.push({ ...registro, limite }); }
      else{ fila.enPlazo++; enPlazo.push({ ...registro, limite }); }
    });
    porProceso.push(fila);
  });
  // Procesos con novedades importantes en la Rama y NINGUNA novedad de RDL en el mes
  const sinNovedadRDL = porProceso.filter(x => x.importantes > 0 && x.rdlEnElMes === 0);

  // Lo que RDL cobra (Excel mensual) y no reportó nada en el mes
  const cobradosSinNovedad = [];
  (filasExcel || []).forEach(fx => {
    const k = c21De(fx.radicado);
    if(!k) return;
    const r = rdl.get(k);
    const enMes = r ? [...r.fechas.keys()].filter(dentro).length : 0;
    if(enMes === 0){
      const rama = actuacionesRama ? actuacionesRama[k] : undefined;
      const movRama = rama ? rama.filter(a => dentro(iso(a.fecha))).length : null;
      cobradosSinNovedad.push({ radicado: fx.radicado, consecutivo: fx.consecutivo, demandante: fx.demandante, demandado: fx.demandado, movimientoRama: movRama });
    }
  });

  // Terminados en el portal que RDL sigue reportando en el mes
  const terminadosQueReporta = [];
  const idsVigentes = new Set(vigentes.flatMap(p => c21sProceso(p) || []));
  const porC21Terminado = new Map();
  (procesos || []).forEach(p => { if(String(p.EstadoVT || '').trim().toUpperCase() === 'TERMINADO'){ (c21sProceso(p) || []).forEach(k => { if(k && !idsVigentes.has(k)) porC21Terminado.set(k, p); }); } });
  // Reportados por RDL que no están en el portal (ni vigentes ni terminados ni en revisión)
  const conocidos = new Set((procesos || []).flatMap(p => c21sProceso(p) || []).filter(Boolean));
  const enRdlNoPortal = [];
  rdl.forEach((e, k) => {
    const enMes = [...e.fechas.keys()].filter(dentro);
    if(!enMes.length) return;
    if(porC21Terminado.has(k)) terminadosQueReporta.push({ proceso: porC21Terminado.get(k), c21: k, radicado: e.radicado, ultima: enMes.sort().pop(), drive: e.drive, despacho: e.despacho });
    else if(!conocidos.has(k)) enRdlNoPortal.push({ c21: k, radicado: e.radicado, consecutivo: e.consecutivo, despacho: e.despacho, demandante: e.demandante, demandado: e.demandado, ultima: enMes.sort().pop(), drive: e.drive });
  });

  return {
    resumen: {
      informesLeidos: (informes || []).length, procesosReportadosPorRDL: rdl.size, procesosVigentesComparados: porProceso.length,
      importantesEnRama: porProceso.reduce((s, x) => s + x.importantes, 0), reportadas: porProceso.reduce((s, x) => s + x.reportadas, 0),
      tardias: tardias.length, noReportadas: noReportadas.length, enPlazo: enPlazo.length, sinNovedadRDL: sinNovedadRDL.length,
      cobradosSinNovedad: cobradosSinNovedad.length, terminadosQueReporta: terminadosQueReporta.length, enRdlNoPortal: enRdlNoPortal.length,
    },
    noReportadas: noReportadas.sort((a, b) => a.fecha.localeCompare(b.fecha)), tardias, enPlazo, sinNovedadRDL, cobradosSinNovedad, terminadosQueReporta, enRdlNoPortal, porProceso,
  };
}
