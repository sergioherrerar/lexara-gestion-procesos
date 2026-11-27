// Correo a RDL con el resultado de la vigilancia (2026-11-28, pedido del usuario: «después de la revisión, un botón de correo para informar a RDL las novedades, tanto las buenas como las no tan buenas»).
// Arma el cuerpo del borrador con lo que SÍ va bien y lo que hay que mejorar, con tablas cortas y la petición concreta de cada punto. El correo queda como BORRADOR: nunca se envía solo. Funciones puras.
export const CORREO_RDL = 'informacion@rdinlaw.com';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dma = f => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const TH = 'padding:6px 9px; background:#004941; color:#ffffff; font-size:12px; text-align:left; border:1px solid #004941;';
const TD = 'padding:5px 9px; font-size:12.5px; border:1px solid #e4e4e1; color:#1c2624; vertical-align:top;';
const MAX_FILAS = 25;

function tabla(columnas, filas){
  const cuerpo = filas.slice(0, MAX_FILAS).map(f => '<tr>' + columnas.map(c => `<td style="${TD}">${c.v(f)}</td>`).join('') + '</tr>').join('');
  const mas = filas.length > MAX_FILAS ? `<p style="margin:4px 0 0; font-size:12px; color:#5c6b68;">… y ${filas.length - MAX_FILAS} más (el detalle completo va en el Excel adjunto).</p>` : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:6px 0 4px; width:100%;"><tr>${columnas.map(c => `<th style="${TH}">${esc(c.t)}</th>`).join('')}</tr>${cuerpo}</table>${mas}`;
}
const titulo = t => `<p style="margin:18px 0 4px; font-size:14px; font-weight:700; color:#004941;">${esc(t)}</p>`;
const parrafo = t => `<p style="margin:4px 0; font-size:13.5px;">${t}</p>`;

/** Las secciones que se pueden incluir, con su cantidad: [{ id, nombre, n, tipo: 'bueno'|'mejorar' }]. */
export function seccionesDelCorreoRDL(r, revision, nDiferencias = 0){
  const S = (r && r.resumen) || {};
  return [
    { id: 'bueno', nombre: 'Lo que va bien (reportes a tiempo, informes recibidos)', n: (S.reportadas || 0) + (S.informesLeidos || 0), tipo: 'bueno' },
    { id: 'noReportadas', nombre: 'Actuaciones importantes que no reportaron', n: S.noReportadas || 0, tipo: 'mejorar' },
    { id: 'tardias', nombre: 'Actuaciones reportadas con retraso', n: S.tardias || 0, tipo: 'mejorar' },
    { id: 'sinNovedad', nombre: 'Procesos con movimiento en la Rama y sin ningún reporte', n: S.sinNovedadRDL || 0, tipo: 'mejorar' },
    { id: 'terminadosDiarios', nombre: 'Procesos terminados que siguen reportando', n: S.terminadosQueReporta || 0, tipo: 'mejorar' },
    { id: 'noPortal', nombre: 'Procesos que reportan y no están en nuestro portal', n: S.enRdlNoPortal || 0, tipo: 'mejorar' },
    { id: 'diferencias', nombre: 'Mismo proceso con datos distintos (confirmen cuál es el correcto)', n: nDiferencias || 0, tipo: 'mejorar' },
    { id: 'excelNoEstan', nombre: 'Procesos de su Excel que no están en nuestro portal', n: revision ? revision.noEncontrados.length : 0, tipo: 'mejorar' },
    { id: 'excelTerminados', nombre: 'Procesos terminados que siguen en su Excel (cobro)', n: revision ? revision.terminados.length : 0, tipo: 'mejorar' },
    { id: 'excelFaltantes', nombre: 'Procesos vigentes nuestros que no incluyeron en su Excel', n: revision ? revision.faltantesEnArchivo.length : 0, tipo: 'mejorar' },
  ];
}

/**
 * entradas: { r (resultado de compararCobertura), revision (compararConProcesos o null), mes: 'AAAA-MM', incluir: { id: bool }, nota (texto libre opcional), hayExcelAdjunto }
 * → { asunto, html } (sin firma: la agrega quien crea el borrador).
 */
export function construirCorreoRDL({ r, revision, mes, incluir, nota, hayExcelAdjunto, diferencias = [] }){
  const [anio, m] = String(mes || '').split('-').map(Number);
  const nombreMes = MESES[(m || 1) - 1] || '';
  const S = r.resumen;
  const on = id => !!(incluir && incluir[id]);
  const partes = [];
  partes.push(parrafo('Buenos días, equipo de RDL Servicios Jurídicos.'));
  partes.push(parrafo(`Revisamos el seguimiento que hacen de nuestros procesos durante <strong>${esc(nombreMes)} de ${anio}</strong>: comparamos sus ${S.informesLeidos} «Informes de novedades judiciales» con lo que muestra la Rama Judicial de cada proceso vigente${revision ? ' y con la lista mensual de procesos que ustedes vigilan' : ''}. Les compartimos lo que va bien y lo que necesitamos que revisen.${hayExcelAdjunto ? ' El detalle completo va en el Excel adjunto.' : ''}`));

  if(on('bueno')){
    const total = S.reportadas + S.tardias + S.noReportadas;
    const pct = total ? Math.round(S.reportadas / total * 100) : 0;
    partes.push(titulo('Lo que va bien'));
    partes.push('<ul style="margin:4px 0 4px 18px; padding:0; font-size:13.5px;">'
      + `<li>Recibimos <strong>${S.informesLeidos} informes diarios</strong> en el mes, con novedades de <strong>${S.procesosReportadosPorRDL} procesos</strong>.</li>`
      + (total ? `<li>De las <strong>${total} actuaciones importantes</strong> que registró la Rama en nuestros procesos, <strong>${S.reportadas} (${pct}%)</strong> las reportaron a tiempo.</li>` : '')
      + '<li>Agradecemos la gestión y la oportunidad en los reportes que sí llegaron.</li>'
      + '</ul>');
  }
  const mejoras = [];
  let numeroPunto = 0; const num = () => ++numeroPunto;   // los puntos se numeran solo los que se incluyen
  if(on('noReportadas') && r.noReportadas.length){
    mejoras.push(titulo(`${num()}. Actuaciones importantes que no nos reportaron (${r.noReportadas.length})`)
      + parrafo('Aparecen en la Rama y, pasados 2 días hábiles, no estaban en ningún informe. Les pedimos revisar por qué no se detectaron y reportarlas.')
      + tabla([{ t: 'Proceso', v: f => esc(f.proceso.Radicado) }, { t: 'Cliente', v: f => esc(f.proceso.Cliente || '') }, { t: 'Fecha', v: f => dma(f.fecha) }, { t: 'Actuación en la Rama', v: f => esc(f.actuacion) }], r.noReportadas));
  }
  if(on('tardias') && r.tardias.length){
    mejoras.push(titulo(`${num()}. Actuaciones que reportaron con retraso (${r.tardias.length})`)
      + parrafo('Sí las reportaron, pero pasados más de 2 días hábiles. Para nosotros el tiempo es clave por los términos.')
      + tabla([{ t: 'Proceso', v: f => esc(f.proceso.Radicado) }, { t: 'Actuación', v: f => esc(f.actuacion) }, { t: 'Fecha', v: f => dma(f.fecha) }, { t: 'La reportaron el', v: f => dma(f.recibido) }, { t: 'Días hábiles de retraso', v: f => String(f.retraso) }], r.tardias));
  }
  if(on('sinNovedad') && r.sinNovedadRDL.length){
    mejoras.push(titulo(`${num()}. Procesos con movimiento en la Rama y sin ningún reporte en el mes (${r.sinNovedadRDL.length})`)
      + parrafo('En estos procesos la Rama muestra actuaciones importantes y no recibimos nada de ustedes. Les pedimos confirmar que están en vigilancia.')
      + tabla([{ t: 'Proceso', v: f => esc(f.proceso.Radicado) }, { t: 'Cliente', v: f => esc(f.proceso.Cliente || '') }, { t: 'Actuaciones importantes en la Rama', v: f => String(f.importantes) }], r.sinNovedadRDL));
  }
  const terminados = [];
  if(on('terminadosDiarios')) r.terminadosQueReporta.forEach(f => terminados.push({ radicado: f.radicado, origen: 'Lo siguen reportando en los informes diarios' }));
  if(on('excelTerminados') && revision) revision.terminados.forEach(f => terminados.push({ radicado: f.radicado, origen: 'Figura en su lista mensual (cobro)' }));
  if(terminados.length){
    mejoras.push(titulo(`${num()}. Procesos terminados que siguen en vigilancia (${terminados.length})`)
      + parrafo('Estos procesos ya terminaron. Les pedimos sacarlos de la vigilancia y <strong>dejar de cobrarlos</strong>.')
      + tabla([{ t: 'Radicado', v: f => esc(f.radicado) }, { t: 'Dónde aparece', v: f => esc(f.origen) }], terminados));
  }
  const fuera = [];
  if(on('noPortal')) r.enRdlNoPortal.forEach(f => fuera.push({ radicado: f.radicado, demandante: f.demandante, demandado: f.demandado, origen: 'Informes diarios' }));
  if(on('excelNoEstan') && revision) revision.noEncontrados.forEach(f => fuera.push({ radicado: f.radicado, demandante: f.demandante, demandado: f.demandado, origen: 'Lista mensual' }));
  if(fuera.length){
    mejoras.push(titulo(`${num()}. Procesos que reportan y no corresponden a nuestros procesos registrados (${fuera.length})`)
      + parrafo('No los tenemos en nuestro sistema como procesos de Lexara. Les pedimos confirmar si son nuestros o si hay que retirarlos.')
      + tabla([{ t: 'Radicado', v: f => esc(f.radicado) }, { t: 'Demandante', v: f => esc(f.demandante || '') }, { t: 'Demandado', v: f => esc(f.demandado || '') }, { t: 'Dónde aparece', v: f => esc(f.origen) }], fuera));
  }
  if(on('diferencias') && diferencias.length){
    mejoras.push(titulo(`${num()}. Procesos que son los mismos pero con datos distintos (${diferencias.length})`)
      + parrafo('Cruzamos estos procesos por el número corto y las partes: son el mismo proceso, pero el radicado que tienen ustedes no coincide con el nuestro. Les pedimos <strong>confirmar cuál es el correcto</strong> para corregirlo de nuestro lado o del suyo.')
      + tabla([{ t: 'Radicado de ustedes', v: f => esc(f.fila.radicado) }, { t: 'Radicado en nuestro sistema', v: f => esc(f.proceso.NoCompleto || '') }, { t: 'Proceso', v: f => esc(f.proceso.Radicado) + (f.proceso.Cliente ? ' · ' + esc(f.proceso.Cliente) : '') }, { t: 'Diferencia', v: f => esc(f.diferencias.length ? f.diferencias.map(d => d.campo).join(', ') : 'Número corto y partes') }], diferencias));
  }
  if(on('excelFaltantes') && revision && revision.faltantesEnArchivo.length){
    mejoras.push(titulo(`${num()}. Procesos nuestros vigentes que no incluyeron en su lista (${revision.faltantesEnArchivo.length})`)
      + parrafo('Son procesos activos de Lexara que no aparecen en su lista mensual. Les pedimos incluirlos en la vigilancia.')
      + tabla([{ t: 'Radicado', v: f => esc(f.radicado) }, { t: 'Número corto', v: f => esc(f.consecutivo) }, { t: 'Demandante', v: f => esc(f.demandante || '') }, { t: 'Demandado', v: f => esc(f.demandado || '') }], revision.faltantesEnArchivo));
  }
  if(mejoras.length){ partes.push(`<p style="margin:18px 0 0; font-size:14.5px; font-weight:700; color:#8a4b00;">Lo que necesitamos que revisen</p>`); partes.push(...mejoras); }
  if(String(nota || '').trim()) partes.push(titulo('Nota adicional') + parrafo(esc(nota).replace(/\n/g, '<br>')));
  partes.push(parrafo('Quedamos atentos a sus comentarios y a la corrección de lo anterior. Gracias por su colaboración.'));
  partes.push(parrafo('Cordial saludo,'));
  return {
    asunto: `Seguimiento de la vigilancia judicial – ${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} ${anio}: novedades de Lexara Abogados`,
    html: `<html><body style="font-family:Calibri,Arial,sans-serif; font-size:14px; color:#1c2624;">${partes.join('')}`,
  };
}
