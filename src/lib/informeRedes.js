// Informe «Redes sociales» en Excel, PDF y correo (2026-11-12, pedido del usuario: «correo con las [novedades] del mes en borradores… y botón de informe en PDF y Excel en los formatos que ya conoces»).
// Mismos formatos de siempre: Excel con encabezado verde #004941 y fila congelada; PDF con el membrete Lexara, resumen arriba y tablas verdes; correo con la firma de Soporte.
import { estilizarEncabezadoXlsx, fechaISOaExcel } from './informeTutelas';
import { prepararDocumentoPDF, dibujarResumenBox, VERDE_OSCURO, GRIS_SUAVE, TEXTO, BORDE_SUAVE, GRIS_ZEBRA, MARGEN, CONTENIDO_Y_INICIAL, CONTENIDO_Y_MAXIMO } from './informesPDF';
import { firmaHtml, firmaComoImagenInline, crearBorradorConImagenesInline } from './graph';
import { novedadesDelMes, nombreMes, fechaLarga, fechaDMA, nuevosDe, REDES_ORDEN, RED_NOMBRE, BUSTRAL_CALENDARIO } from './redesSociales';

export const ASUNTO_REVISION_REDES = 'Revisión de publicaciones de Lexara Abogados';
const NOTA_BUSTRAL = 'Bustral solo registra el estado actual de cada video (aprobado u objetado); no guarda la fecha ni la hora en que se aprobó u objetó. La hora de publicación se indica cuando está disponible.';

const fmt = n => (n == null ? '—' : Number(n).toLocaleString('es-CO'));
const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dma = f => fechaDMA(f) || '—';
const publicadaTexto = x => x.publicadaEl ? `${dma(x.publicadaEl)}${x.hora ? ' ' + x.hora : ''}` : 'Aún no se ha publicado';
const aprobacionTexto = x => x.estado + (x.objetadoEl ? ` · objetado el ${dma(x.objetadoEl)}` : '') + (x.aprobadoEl ? ` · aprobado el ${dma(x.aprobadoEl)}` : '');
const nombreArchivo = (mes, ext) => `Revisión de publicaciones - ${nombreMes(mes)}.${ext}`;

function descargarBlob(buffer, nombre, tipo){
  const url = URL.createObjectURL(new Blob([buffer], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// ---------- Excel ----------
export async function generarInformeRedesExcel(datos, mes){
  const { default: ExcelJS } = await import('exceljs');
  const { vista, filas } = novedadesDelMes(datos, mes);
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet('Calendario');
  const columnas = ['Programada (Bustral)', 'Pieza', 'Estado de aprobación', 'Fecha de objeción', 'Fecha de aprobación', 'Publicada el', 'Hora de publicación', 'Redes', 'Cumplimiento', 'Vistas (YouTube + TikTok)'];
  ws.columns = [16, 58, 20, 18, 18, 14, 14, 30, 30, 16].map(width => ({ width }));
  estilizarEncabezadoXlsx(ws.addRow(columnas));
  filas.forEach(x => {
    const r = ws.addRow([
      fechaISOaExcel(x.programada), x.titulo, x.estado, x.objetadoEl ? fechaDMA(x.objetadoEl) : 'No la registra Bustral', x.aprobadoEl ? fechaDMA(x.aprobadoEl) : 'No la registra Bustral',
      fechaISOaExcel(x.publicadaEl), x.hora || (x.publicadaEl ? 'No disponible' : ''), x.redes.join(' · '), x.cumplimiento, x.vistas,
    ]);
    r.eachCell(c => { c.alignment = { vertical: 'middle', wrapText: true, horizontal: 'left' }; });
    [1, 6].forEach(i => { r.getCell(i).numFmt = 'dd/mm/yyyy'; r.getCell(i).alignment = { vertical: 'middle', horizontal: 'center' }; });
    r.getCell(10).alignment = { vertical: 'middle', horizontal: 'right' };   // los valores numéricos siempre a la derecha
    r.getCell(10).numFmt = '#,##0';
    if(x.programada && !x.publicadaEl && x.programada < datos.leido) r.getCell(9).font = { bold: true, color: { argb: 'FFA3281C' } };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.addRow([]);
  const nota = ws.addRow([NOTA_BUSTRAL]); nota.getCell(1).font = { italic: true, color: { argb: 'FF5C6B68' } };

  const wr = wb.addWorksheet('Resumen y seguidores');
  wr.columns = [34, 20, 22, 60].map(width => ({ width }));
  estilizarEncabezadoXlsx(wr.addRow(['Resumen de ' + nombreMes(mes), 'Valor']));
  [
    ['Piezas programadas en Bustral', vista.programadas], ['Piezas publicadas', vista.piezasPublicadas],
    ['Publicadas a tiempo', vista.aTiempo], ['Cumplimiento del calendario', vista.pct == null ? '—' : vista.pct + ' %'],
    ['Aprobadas', vista.aprobadas], ['Objetadas', vista.objetadas], ['Sin publicar con fecha vencida', vista.vencidasSin],
  ].forEach(f => { const r = wr.addRow(f); r.getCell(2).alignment = { horizontal: 'right' }; });
  wr.addRow([]);
  estilizarEncabezadoXlsx(wr.addRow(['Red', 'Seguidores actuales', 'Nuevos del mes', 'Nota']));
  REDES_ORDEN.forEach(red => {
    const s = (datos.seguidores || []).find(x => x.red === red) || {};
    const n = nuevosDe(datos, red, s);
    const r = wr.addRow([`${RED_NOMBRE[red]}${s.cuenta ? ' · ' + s.cuenta : ''}`, s.actuales, n.valor, n.texto]);
    r.getCell(2).alignment = { horizontal: 'right' }; r.getCell(3).alignment = { horizontal: 'right' }; r.getCell(4).alignment = { wrapText: true, vertical: 'top' };
    r.getCell(2).numFmt = '#,##0'; r.getCell(3).numFmt = '+#,##0;-#,##0;0';
  });
  wr.addRow([]);
  const fuente = wr.addRow([datos.fuente]); fuente.getCell(1).font = { italic: true, color: { argb: 'FF5C6B68' } };

  const buffer = await wb.xlsx.writeBuffer();
  descargarBlob(buffer, nombreArchivo(mes, 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// ---------- PDF ----------
export async function generarInformeRedesPDF(datos, mes){
  const { vista, filas, noPublicadas } = novedadesDelMes(datos, mes);
  const { doc, autoTable, pageWidth, fecha, dibujarEncabezadoYPie, numerarPaginas } = await prepararDocumentoPDF('Revisión de publicaciones');
  dibujarEncabezadoYPie();
  let y = CONTENIDO_Y_INICIAL;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...TEXTO);
  doc.text(`Bogotá D.C., ${fecha}`, MARGEN, y); y += 9;

  y = dibujarResumenBox(doc, MARGEN, y, pageWidth - MARGEN * 2, [
    { label: 'Mes', value: nombreMes(mes) },
    { label: 'Programadas', value: vista.programadas },
    { label: 'Publicadas', value: vista.piezasPublicadas },
    { label: 'Cumplimiento', value: vista.pct == null ? '—' : vista.pct + ' %' },
    { label: 'Aprobadas / objetadas', value: `${vista.aprobadas} / ${vista.objetadas}` },
  ]) + 8;

  const estilos = {
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, valign: 'top', lineColor: BORDE_SUAVE, lineWidth: 0.15, textColor: TEXTO },
    headStyles: { fillColor: VERDE_OSCURO, textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 8 },
    alternateRowStyles: { fillColor: GRIS_ZEBRA },
    margin: { left: MARGEN, right: MARGEN, top: CONTENIDO_Y_INICIAL, bottom: 297 - CONTENIDO_Y_MAXIMO },
    willDrawPage: dibujarEncabezadoYPie,
  };
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...VERDE_OSCURO);
  doc.text('Lista de novedades', MARGEN, y); y += 3;
  autoTable(doc, {
    ...estilos, startY: y,
    head: [['Programada (Bustral)', 'Pieza', 'Aprobación', 'Publicada (fecha y hora)', 'Cumplimiento']],
    body: filas.map(x => [x.programada ? dma(x.programada) : 'Sin programar', x.titulo, aprobacionTexto(x), x.publicadaEl ? `${publicadaTexto(x)}\n${x.redes.join(' · ')}` : 'Aún no se ha publicado', x.cumplimiento]),
    columnStyles: { 0: { cellWidth: 24, halign: 'center' }, 2: { cellWidth: 28 }, 3: { cellWidth: 34 }, 4: { cellWidth: 28 } },
  });
  y = doc.lastAutoTable.finalY + 8;

  if(noPublicadas.length){
    if(y + 22 > CONTENIDO_Y_MAXIMO){ doc.addPage(); dibujarEncabezadoYPie(); y = CONTENIDO_Y_INICIAL; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(163, 40, 28);
    doc.text('Videos que no se publicaron (fecha programada ya vencida)', MARGEN, y); y += 3;
    autoTable(doc, {
      ...estilos, startY: y,
      head: [['Programada (Bustral)', 'Pieza', 'Aprobación']],
      body: noPublicadas.map(x => [dma(x.programada), x.titulo, aprobacionTexto(x)]),
      columnStyles: { 0: { cellWidth: 28, halign: 'center' }, 2: { cellWidth: 44 } },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  if(y + 40 > CONTENIDO_Y_MAXIMO){ doc.addPage(); dibujarEncabezadoYPie(); y = CONTENIDO_Y_INICIAL; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...VERDE_OSCURO);
  doc.text('Seguidores por red', MARGEN, y); y += 3;
  autoTable(doc, {
    ...estilos, startY: y,
    head: [['Red', 'Seguidores actuales', 'Nuevos del mes']],
    body: REDES_ORDEN.map(red => {
      const s = (datos.seguidores || []).find(x => x.red === red) || {};
      const n = nuevosDe(datos, red, s);
      return [`${RED_NOMBRE[red]}${s.cuenta ? ' · ' + s.cuenta : ''}`, fmt(s.actuales), n.valor == null ? '—' : (n.valor > 0 ? '+' : '') + fmt(n.valor)];
    }),
    columnStyles: { 1: { halign: 'right', cellWidth: 36 }, 2: { halign: 'right', cellWidth: 32 } },   // valores numéricos a la derecha
  });
  y = doc.lastAutoTable.finalY + 6;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...GRIS_SUAVE);
  const lineas = doc.splitTextToSize(NOTA_BUSTRAL, pageWidth - MARGEN * 2);
  if(y + lineas.length * 4 > CONTENIDO_Y_MAXIMO){ doc.addPage(); dibujarEncabezadoYPie(); y = CONTENIDO_Y_INICIAL; }
  doc.text(lineas, MARGEN, y);

  numerarPaginas();
  doc.save(`Revisión de publicaciones - ${nombreMes(mes)} - ${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ---------- Correo ----------
const TH = 'padding:8px 10px; background:#004941; color:#ffffff; font-size:12.5px; text-align:left; border:1px solid #004941;';
const TD = 'padding:7px 10px; font-size:13px; border:1px solid #e4e4e1; color:#1c2624; vertical-align:top;';

// «Hola, buenos días.» hasta el mediodía y «Hola, buenas tardes.» después, según la hora de quien lo crea.
export function saludoRevisionRedes(fecha = new Date()){
  return fecha.getHours() < 12 ? 'Hola, buenos días.' : 'Hola, buenas tardes.';
}

export function construirCorreoRevisionRedes(datos, mes, { fecha = new Date(), srcFirma } = {}){
  const { vista, filas, noPublicadas } = novedadesDelMes(datos, mes);
  const color = c => c === 'badge-rojo' ? '#a3281c' : c === 'badge-naranja' ? '#b3590a' : c === 'badge-verde' ? '#14753f' : '#5c6b68';
  const filasHtml = filas.map(x => `<tr>
    <td style="${TD} white-space:nowrap;">${x.programada ? dma(x.programada) : 'Sin programar'}</td>
    <td style="${TD} font-weight:600;">${esc(x.titulo)}</td>
    <td style="${TD}">${esc(x.estado)}${x.objetadoEl ? `<br><span style="color:#a3281c;">Objetado el ${dma(x.objetadoEl)}</span>` : ''}${x.aprobadoEl ? `<br><span style="color:#14753f;">Aprobado el ${dma(x.aprobadoEl)}</span>` : ''}</td>
    <td style="${TD}">${x.publicadaEl ? `${dma(x.publicadaEl)}${x.hora ? ' · ' + esc(x.hora) : ''}<br><span style="color:#5c6b68; font-size:12px;">${esc(x.redes.join(' · '))}</span>` : '<span style="color:#a3281c;">Aún no se ha publicado</span>'}</td>
    <td style="${TD} color:${color(x.claseCumplimiento)}; font-weight:600;">${esc(x.cumplimiento)}</td>
  </tr>`).join('');
  const lista = noPublicadas.length
    ? `<p style="margin:18px 0 6px; font-size:15px; font-weight:700; color:#a3281c;">Videos que no se publicaron</p>
  <ul style="margin:0; padding-left:20px; font-size:14px; line-height:1.6;">${noPublicadas.map(x => `<li><strong>${esc(x.titulo)}</strong>: programado el ${dma(x.programada)}. ${esc(aprobacionTexto(x))}.</li>`).join('')}</ul>`
    : '<p style="margin:18px 0 0; font-size:14px;">Todas las piezas con fecha vencida se publicaron.</p>';
  const html = `<div style="font-family:'Segoe UI', Arial, sans-serif; color:#1c2624; max-width:860px;">
  <p style="margin:0 0 12px; font-size:15px;">${saludoRevisionRedes(fecha)}</p>
  <p style="margin:0 0 12px; font-size:15px; line-height:1.55;">Les comparto la revisión de las publicaciones de Lexara Abogados de <strong>${esc(nombreMes(mes))}</strong>, según el calendario de Bustral (lectura del ${fechaLarga(datos.leido)}).</p>
  <ul style="margin:0 0 14px; padding-left:20px; font-size:14px; line-height:1.6;">
    <li>Piezas programadas: <strong>${vista.programadas}</strong> · publicadas: <strong>${vista.piezasPublicadas}</strong> (${vista.aTiempo} a tiempo)${vista.pct == null ? '' : ` · cumplimiento del calendario: <strong>${vista.pct} %</strong>`}</li>
    <li>Aprobadas: <strong>${vista.aprobadas}</strong> · objetadas: <strong>${vista.objetadas}</strong> · sin publicar con fecha vencida: <strong>${vista.vencidasSin}</strong></li>
  </ul>
  <p style="margin:0 0 6px; font-size:15px; font-weight:700; color:#004941;">Lista de novedades</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">
    <tr><th style="${TH}">Programada (Bustral)</th><th style="${TH}">Pieza</th><th style="${TH}">Aprobación</th><th style="${TH}">Publicada (fecha y hora)</th><th style="${TH}">Cumplimiento</th></tr>
    ${filasHtml || `<tr><td style="${TD}" colspan="5">No hay publicaciones ni programación en este mes.</td></tr>`}
  </table>
  ${lista}
  <p style="margin:16px 0 0; font-size:12.5px; color:#5c6b68; line-height:1.5;">${esc(NOTA_BUSTRAL)}</p>
  <p style="margin:12px 0 0; font-size:14px; line-height:1.55;">Las piezas pendientes de decisión se aprueban u objetan en el <a href="${BUSTRAL_CALENDARIO}">calendario de Bustral</a>.</p>
  <p style="margin:14px 0 0; font-size:14px;">Cordial saludo,</p>
  ${firmaHtml('soporte', srcFirma)}
</div>`;
  return { asunto: ASUNTO_REVISION_REDES, html };
}

// Crea el borrador en el buzón de quien inició sesión (sin destinatario si no se escribe uno; queda abierto para completarlo).
export async function crearBorradorRevisionRedes(datos, mes, { para = [] } = {}){
  const firma = await firmaComoImagenInline('soporte');
  const correo = construirCorreoRevisionRedes(datos, mes);
  return crearBorradorConImagenesInline({
    to: para, cc: [], subject: correo.asunto, htmlBody: correo.html, imagenes: [firma],
    categorias: ['Revisión de publicaciones (borrador)'],
  });
}
