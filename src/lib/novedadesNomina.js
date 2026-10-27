// Novedades de nómina (Administración, 2026-10-29, pedido del usuario): lo que se le reporta cada mes a Beatriz (contadora contratista) para liquidar la nómina,
// con copia a Gerencia. Se envía el día 29 para que todo lo ocurrido hasta el 28 quede dentro del ciclo.
//   · Tutelas contestadas  → del 29 del mes anterior al 28 del mes (por Vencimiento, igual que «Tutelas por Abogado» en Informes), con su Valor Abogado.
//   · Horas extras         → mismo corte 29 → 28, solo las APROBADAS (igual que la relación mensual de Horas Extras).
//   · Vacaciones           → el mes calendario completo (1 al 31), con el estado de cada solicitud.
import { filtrarTutelasPorMes, agruparPorAbogado, rangoVencimientoDelMes, MESES_NOMBRES } from './informeAbogadosTutelas';
import { filtrarHorasExtrasPorMes, agruparPorColaborador, redondear } from './horasExtras';
import { esColaboradorVigente } from './permissions';
import { estadoPeriodo } from './vacaciones';
import { diasHabilesEntre } from './solicitudVacaciones';
import { fmtMonto, normalize, firmaHtml } from './graph';
import { FICHA_EMPRESA_MD } from '../config';

export { MESES_NOMBRES };
export const CATEGORIA_NOVEDADES = 'Novedades de nómina';
export const CORREO_GERENCIA_NOVEDADES = FICHA_EMPRESA_MD.correo;
// Beatriz Sánchez, contadora de la firma externa ASESCONT (la misma a la que se le dio acceso a Facturación). Si en Equipo MD hay una ficha con su nombre y correo, se usa esa.
export const CORREO_BEATRIZ_POR_DEFECTO = 'beatriz.sanchez@asescont.com.co';

export function destinatariaNovedades(colaboradores){
  // Solo una ficha que sea de verdad ella (correo de ASESCONT, o un nombre que EMPIECE por «Beatriz»): un nombre que solo contenga «Beatriz» (p. ej. «Gloria Beatriz …») es otra persona.
  const ficha = (colaboradores || []).find(c => String(c.Correo || '').includes('@') && (/@asescont\./i.test(c.Correo || '') || /^\s*beatriz\b/i.test(c.Nombre || '')));
  return { nombre: ficha?.Nombre || 'Beatriz Sánchez', correo: (ficha?.Correo || CORREO_BEATRIZ_POR_DEFECTO).trim() };
}

// Cómo se le saluda: siempre «Beatriz» (pedido del usuario 2026-10-29: la ficha puede traer otro primer nombre, p. ej. «Gloria Beatriz …», y el saludo salía «Gloria»).
export function nombreDeSaludo(){ return 'Beatriz'; }

function aISO(d){ return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function deISO(iso){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; }
export function dma(iso){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; }
const pesos = n => '$ ' + fmtMonto(n);
const num = n => String(redondear(n || 0)).replace('.', ',');
function esc(t){ return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// Rangos del ciclo de un mes. Tutelas y horas: 29 del mes anterior al 28 de este (febrero y bisiestos los resuelve solo la normalización de fechas de JavaScript).
export function rangosDelCiclo(anio, mesIndex0){
  const { inicio, fin } = rangoVencimientoDelMes(anio, mesIndex0);
  const primero = new Date(anio, mesIndex0, 1), ultimo = new Date(anio, mesIndex0 + 1, 0);
  return { cortesInicio: aISO(inicio), cortesFin: aISO(fin), mesInicio: aISO(primero), mesFin: aISO(ultimo) };
}

export function armarNovedades({ anio, mesIndex0, tutelas, valoresEntidad, horasExtras, vacacionesPeriodos, colaboradores }){
  const rangos = rangosDelCiclo(anio, mesIndex0);

  const tutelasMes = filtrarTutelasPorMes(tutelas, anio, mesIndex0);
  const porAbogado = agruparPorAbogado(tutelasMes, valoresEntidad);
  const tutelasInfo = { cantidad: tutelasMes.length, grupos: porAbogado.grupos, totalGeneral: porAbogado.totalGeneral };

  // Horas extras: solo trabajadores vigentes (misma regla de Administración → Horas Extras) y solo aprobadas.
  const vigentes = new Set((colaboradores || []).filter(esColaboradorVigente).map(c => (c.Nombre || '').trim()));
  const horasMes = filtrarHorasExtrasPorMes((horasExtras || []).filter(h => vigentes.has((h.Colaborador || '').trim())), anio, mesIndex0, true);
  const agrupadas = agruparPorColaborador(horasMes);
  const valorDe = (g, tipo) => g.filas.find(f => f.tipoRespuesta === tipo)?.total || 0;
  const horasFilas = agrupadas.grupos.map(g => ({
    colaborador: g.colaborador, diurnas: valorDe(g, 'Diurnas'), nocturnas: valorDe(g, 'Nocturnas'),
    diurnasFest: valorDe(g, 'Diurnas Festivas'), nocturnasFest: valorDe(g, 'Nocturnas Festivas'), total: g.totalColaborador,
  }));
  const horasInfo = { registros: horasMes.length, filas: horasFilas, totalGeneral: agrupadas.totalGeneral };

  // Vacaciones: cualquier período que toque el mes calendario (1 al 31). Los que cruzan de mes cuentan solo los días hábiles que caen dentro de este mes.
  const vacFilas = (vacacionesPeriodos || []).map(p => {
    const ini = String(p.FechaInicio || '').slice(0, 10), fin = String(p.FechaFin || '').slice(0, 10);
    if(!deISO(ini) || !deISO(fin) || fin < rangos.mesInicio || ini > rangos.mesFin) return null;
    const estado = estadoPeriodo(p);
    if(estado === 'rechazada') return null;
    const dentro = ini >= rangos.mesInicio && fin <= rangos.mesFin;
    const diasEnMes = dentro ? (Number(p.Dias) || 0) : diasHabilesEntre(ini < rangos.mesInicio ? rangos.mesInicio : ini, fin > rangos.mesFin ? rangos.mesFin : fin);
    return { colaborador: (p.Colaborador || '').trim() || 'Sin colaborador', inicio: ini, fin, diasSolicitados: Number(p.Dias) || 0, diasEnMes, cruzaMes: !dentro, pendiente: estado === 'pendiente', observaciones: p.Observaciones || '' };
  }).filter(Boolean).sort((a, b) => a.colaborador.localeCompare(b.colaborador) || a.inicio.localeCompare(b.inicio));
  const vacInfo = { filas: vacFilas, pendientes: vacFilas.filter(f => f.pendiente).length, totalDiasEnMes: redondear(vacFilas.reduce((s, f) => s + f.diasEnMes, 0)) };

  return { rangos, tutelas: tutelasInfo, horas: horasInfo, vacaciones: vacInfo, consolidado: consolidarPorPersona(tutelasInfo, horasInfo, vacInfo) };
}

// Una sola fila por persona con las tres novedades (pedido del usuario 2026-10-29: «al comienzo del correo un consolidado por persona»). El abogado de una tutela y el
// colaborador de Horas Extras/Vacaciones pueden venir escritos distinto («Ariana Martín» / «Ariana Andrea Martín Mendoza»): se unen si todas las palabras del nombre más
// corto (mínimo dos) están en el más largo, sin importar tildes ni mayúsculas.
function mismaPersona(a, b){
  const ta = normalize(a).split(/\s+/).filter(Boolean), tb = normalize(b).split(/\s+/).filter(Boolean);
  if(ta.join(' ') === tb.join(' ')) return true;
  const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return corto.length >= 2 && corto.every(t => largo.includes(t));
}
function consolidarPorPersona(tutelas, horas, vac){
  const filas = [];
  const fila = nombre => {
    let f = filas.find(x => mismaPersona(x.persona, nombre));
    if(!f){ f = { persona: nombre, tutelas: 0, valor: 0, horas: 0, vacaciones: 0 }; filas.push(f); }
    else if(String(nombre).length > String(f.persona).length) f.persona = nombre;
    return f;
  };
  tutelas.grupos.forEach(g => { const f = fila(g.abogado); f.tutelas += g.filas.reduce((s, x) => s + x.cantidad, 0); f.valor += g.totalAbogado; });
  horas.filas.forEach(h => { fila(h.colaborador).horas += h.total; });
  vac.filas.forEach(v => { fila(v.colaborador).vacaciones += v.diasEnMes; });
  filas.sort((a, b) => a.persona.localeCompare(b.persona));
  filas.forEach(f => { f.horas = redondear(f.horas); f.vacaciones = redondear(f.vacaciones); });
  return {
    filas,
    totales: { tutelas: filas.reduce((s, f) => s + f.tutelas, 0), valor: filas.reduce((s, f) => s + f.valor, 0), horas: redondear(filas.reduce((s, f) => s + f.horas, 0)), vacaciones: redondear(filas.reduce((s, f) => s + f.vacaciones, 0)) },
  };
}

export function etiquetaCiclo(anio, mesIndex0){ return `${MESES_NOMBRES[mesIndex0]} de ${anio}`; }

// ---- Correo para Beatriz ----
const TH = 'padding:8px 10px; background:#004941; color:#ffffff; font-size:12.5px; text-align:left; border:1px solid #004941;';
const THD = TH.replace('text-align:left', 'text-align:right');
const TD = 'padding:7px 10px; font-size:13px; border:1px solid #e4e4e1; color:#1c2624;';
const TDD = TD + ' text-align:right;';
const TITULO = 'margin:26px 0 4px; font-size:16px; font-weight:700; color:#004941;';
const SUBTITULO = 'margin:0 0 10px; font-size:12.5px; color:#5c6b68;';

function tablaConsolidado(c){
  if(!c.filas.length) return '<p style="margin:0; font-size:13.5px; color:#5c6b68;">No hay novedades en este período.</p>';
  const filas = c.filas.map(f => `<tr><td style="${TD}">${esc(f.persona)}</td><td style="${TDD}">${f.tutelas || '—'}</td><td style="${TDD}">${f.valor ? pesos(f.valor) : '—'}</td><td style="${TDD}">${f.horas ? num(f.horas) : '—'}</td><td style="${TDD}">${f.vacaciones ? num(f.vacaciones) : '—'}</td></tr>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;"><tr><th style="${TH}">Persona</th><th style="${THD}">Tutelas contestadas</th><th style="${THD}">Valor Abogado</th><th style="${THD}">Horas extras</th><th style="${THD}">Días de vacaciones</th></tr>${filas}<tr><td style="${TD} background:#004941; color:#fff; font-weight:700;">Total general</td><td style="${TDD} background:#004941; color:#fff; font-weight:700;">${c.totales.tutelas}</td><td style="${TDD} background:#004941; color:#fff; font-weight:700;">${pesos(c.totales.valor)}</td><td style="${TDD} background:#004941; color:#fff; font-weight:700;">${num(c.totales.horas)}</td><td style="${TDD} background:#004941; color:#fff; font-weight:700;">${num(c.totales.vacaciones)}</td></tr></table>`;
}
function tablaTutelas(t){
  if(!t.grupos.length) return '<p style="margin:0; font-size:13.5px; color:#5c6b68;">No hubo tutelas contestadas en este período.</p>';
  const filas = t.grupos.map(g => {
    const detalle = g.filas.map(f => `<tr><td style="${TD}">${esc(g.abogado)}</td><td style="${TD}">${esc(f.tipoRespuesta)}</td><td style="${TDD}">${f.cantidad}</td><td style="${TDD}">${pesos(f.total)}</td></tr>`).join('');
    const cant = g.filas.reduce((s, f) => s + f.cantidad, 0);
    return detalle + `<tr><td style="${TD} background:#e3efee; font-weight:700;" colspan="2">Total ${esc(g.abogado)}</td><td style="${TDD} background:#e3efee; font-weight:700;">${cant}</td><td style="${TDD} background:#e3efee; font-weight:700;">${pesos(g.totalAbogado)}</td></tr>`;
  }).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;"><tr><th style="${TH}">Abogado</th><th style="${TH}">Tipo de respuesta</th><th style="${THD}">Cantidad</th><th style="${THD}">Valor Abogado</th></tr>${filas}<tr><td style="${TD} background:#004941; color:#fff; font-weight:700;" colspan="2">Total general</td><td style="${TDD} background:#004941; color:#fff; font-weight:700;">${t.cantidad}</td><td style="${TDD} background:#004941; color:#fff; font-weight:700;">${pesos(t.totalGeneral)}</td></tr></table>`;
}
function tablaHoras(h){
  if(!h.filas.length) return '<p style="margin:0; font-size:13.5px; color:#5c6b68;">No hubo horas extras aprobadas en este período.</p>';
  const filas = h.filas.map(f => `<tr><td style="${TD}">${esc(f.colaborador)}</td><td style="${TDD}">${num(f.diurnas)}</td><td style="${TDD}">${num(f.nocturnas)}</td><td style="${TDD}">${num(f.diurnasFest)}</td><td style="${TDD}">${num(f.nocturnasFest)}</td><td style="${TDD} font-weight:700;">${num(f.total)}</td></tr>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;"><tr><th style="${TH}">Colaborador</th><th style="${THD}">Diurnas</th><th style="${THD}">Nocturnas</th><th style="${THD}">Diurnas festivas</th><th style="${THD}">Nocturnas festivas</th><th style="${THD}">Total horas</th></tr>${filas}<tr><td style="${TD} background:#004941; color:#fff; font-weight:700;" colspan="5">Total general</td><td style="${TDD} background:#004941; color:#fff; font-weight:700;">${num(h.totalGeneral)}</td></tr></table>`;
}
function tablaVacaciones(v){
  if(!v.filas.length) return '<p style="margin:0; font-size:13.5px; color:#5c6b68;">No hay vacaciones en este mes.</p>';
  const filas = v.filas.map(f => `<tr><td style="${TD}">${esc(f.colaborador)}</td><td style="${TD}">${dma(f.inicio)}</td><td style="${TD}">${dma(f.fin)}</td><td style="${TDD}">${num(f.diasSolicitados)}</td><td style="${TDD}">${num(f.diasEnMes)}${f.cruzaMes ? ' *' : ''}</td><td style="${TD}">${f.pendiente ? '<span style="color:#b3590a; font-weight:700;">Pendiente de aprobación</span>' : 'Aprobada'}</td></tr>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;"><tr><th style="${TH}">Colaborador</th><th style="${TH}">Inicio</th><th style="${TH}">Fin</th><th style="${THD}">Días solicitados</th><th style="${THD}">Días en el mes</th><th style="${TH}">Estado</th></tr>${filas}<tr><td style="${TD} background:#004941; color:#fff; font-weight:700;" colspan="4">Total días en el mes</td><td style="${TDD} background:#004941; color:#fff; font-weight:700;">${num(v.totalDiasEnMes)}</td><td style="${TD} background:#004941;"></td></tr></table>${v.filas.some(f => f.cruzaMes) ? '<p style="margin:6px 0 0; font-size:12px; color:#5c6b68;">* El período cruza de mes: se cuentan solo los días hábiles que caen dentro de este mes.</p>' : ''}`;
}

// `srcFirma`: de dónde sale la imagen de la firma de Soporte (cid: en el correo real, data: en la vista previa).
export function construirCorreoNovedades({ novedades, anio, mesIndex0, destinatario, srcFirma }){
  const etiqueta = etiquetaCiclo(anio, mesIndex0);
  const r = novedades.rangos;
  const pila = nombreDeSaludo(destinatario);
  const asunto = `Novedades de nómina — ${etiqueta} — Lexara Abogados`;
  const html = `<div style="font-family:'Segoe UI', Arial, sans-serif; color:#1c2624; max-width:720px;">
  <p style="margin:0 0 12px; font-size:15px;">Buen día, ${esc(pila)}:</p>
  <p style="margin:0 0 6px; font-size:15px; line-height:1.55;">Te compartimos las novedades de nómina de <strong>${esc(etiqueta)}</strong> de MD Abogados SAS (Lexara Abogados), con corte al 28 para tutelas y horas extras.</p>

  <p style="${TITULO}">Consolidado por persona</p>
  <p style="${SUBTITULO}">Tutelas y horas extras del ${dma(r.cortesInicio)} al ${dma(r.cortesFin)} · vacaciones del ${dma(r.mesInicio)} al ${dma(r.mesFin)}</p>
  ${tablaConsolidado(novedades.consolidado)}

  <p style="${TITULO}">1. Tutelas contestadas</p>
  <p style="${SUBTITULO}">Del ${dma(r.cortesInicio)} al ${dma(r.cortesFin)} (por fecha de vencimiento) · ${novedades.tutelas.cantidad} en total</p>
  ${tablaTutelas(novedades.tutelas)}

  <p style="${TITULO}">2. Horas extras aprobadas</p>
  <p style="${SUBTITULO}">Del ${dma(r.cortesInicio)} al ${dma(r.cortesFin)} · solo las aprobadas por Administración</p>
  ${tablaHoras(novedades.horas)}

  <p style="${TITULO}">3. Vacaciones</p>
  <p style="${SUBTITULO}">Mes completo: del ${dma(r.mesInicio)} al ${dma(r.mesFin)}${novedades.vacaciones.pendientes ? ` · ${novedades.vacaciones.pendientes} solicitud(es) aún sin aprobar` : ''}</p>
  ${tablaVacaciones(novedades.vacaciones)}

  <p style="margin:24px 0 0; font-size:14px; line-height:1.55;">Quedamos atentos a cualquier inquietud o ajuste.</p>
  <p style="margin:14px 0 0; font-size:14px;">Cordial saludo,</p>
  ${firmaHtml('soporte', srcFirma)}
</div>`;
  return { asunto, html };
}
