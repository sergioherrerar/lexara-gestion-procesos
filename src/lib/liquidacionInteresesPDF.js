// PDF de "Liquidación Intereses" (Modo 1 — una línea) — mismo membrete/pie
// que el resto de PDF de Informes (ver informesPDF.js), con un cuerpo propio:
// caja de datos ingresados, caja de resultado y la tabla de desglose por año
// (igual estructura que el Excel real del usuario, "Año / Días en Mora /
// Valor Intereses"). No lleva firma — es una hoja de cálculo interna, no una
// carta dirigida a un tercero.
import { fmtMonto } from './graph';
import { avisosLiquidacion } from './liquidacionIntereses';
import {
  prepararDocumentoPDF, dibujarResumenBox, fechaCorta,
  MARGEN, CONTENIDO_Y_MAXIMO, VERDE_OSCURO, GRIS_SUAVE, TEXTO, GRIS_ZEBRA, BORDE_SUAVE, VERDE_CLARO,
} from './informesPDF';

export async function generarLiquidacionInteresesPDF(resultado, opts = {}){
  const { doc, autoTable, pageWidth, hoy, fecha, dibujarEncabezadoYPie, numerarPaginas } = await prepararDocumentoPDF('Liquidación de Intereses');

  dibujarEncabezadoYPie();
  let y = 78;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...GRIS_SUAVE);
  doc.text(`Fecha de liquidación: ${fecha}`, MARGEN, y);
  if(opts.referencia){
    doc.text(`Referencia: ${opts.referencia}`, pageWidth - MARGEN, y, { align: 'right' });
  }
  y += 8;

  y = dibujarResumenBox(doc, MARGEN, y, pageWidth - MARGEN * 2, [
    { label: 'Valor deuda', value: `$${fmtMonto(resultado.valorDeuda)}` },
    { label: 'Fecha vencimiento', value: fechaCorta(resultado.fechaVencimiento) },
    { label: 'Fecha de cálculo', value: fechaCorta(resultado.fechaCalculo) },
  ]) + 10;

  const itemsResultado = [
    { label: 'Días en mora', value: resultado.diasMora },
    { label: 'Interés moratorio', value: `$${fmtMonto(resultado.interesMoratorio)}` },
  ];
  if(resultado.incluirIPC){
    itemsResultado.push({ label: 'Incremento IPC', value: resultado.ipc.disponible ? `$${fmtMonto(resultado.ipc.incremento)}` : 'N/D' });
  }
  itemsResultado.push({ label: 'Total a pagar', value: `$${fmtMonto(resultado.totalAPagar)}` });
  y = dibujarResumenBox(doc, MARGEN, y, pageWidth - MARGEN * 2, itemsResultado) + 8;

  // Mismos avisos EXACTOS que ve el usuario en pantalla (Modo 1) — una sola
  // función compartida (avisosLiquidacion) para que nunca digan algo distinto.
  avisosLiquidacion(resultado).forEach(aviso => {
    doc.setFont('helvetica', aviso.tipo === 'error' ? 'bold' : 'italic');
    doc.setFontSize(aviso.tipo === 'error' ? 9.5 : 8.5);
    doc.setTextColor(...(aviso.tipo === 'error' ? [178, 59, 59] : (aviso.tipo === 'ok' ? VERDE_OSCURO : GRIS_SUAVE)));
    const texto = aviso.tipo === 'error' ? `Atención: ${aviso.texto}` : aviso.texto;
    const lineas = doc.splitTextToSize(texto, pageWidth - MARGEN * 2);
    doc.text(lineas, MARGEN, y);
    y += lineas.length * 5 + 3;
  });
  y += 4;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...VERDE_OSCURO);
  doc.text('Desglose del interés moratorio por año', MARGEN, y); y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN, top: 76, bottom: 297 - CONTENIDO_Y_MAXIMO },
    head: [['Año', 'Días en Mora', 'Valor Intereses']],
    body: resultado.desglosePorAnio.map(r => [String(r.anio), String(r.dias), `$${fmtMonto(r.valor)}`]),
    foot: [[
      { content: 'Total', styles: { fontStyle: 'bold' } },
      { content: String(resultado.diasMora), styles: { fontStyle: 'bold', halign: 'right' } },
      { content: `$${fmtMonto(resultado.interesMoratorio)}`, styles: { fontStyle: 'bold', halign: 'right' } },
    ]],
    showFoot: 'lastPage',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, valign: 'middle', lineColor: BORDE_SUAVE, lineWidth: 0.15, textColor: TEXTO },
    headStyles: { fillColor: VERDE_OSCURO, textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { halign: 'center' }, 1: { halign: 'right' }, 2: { halign: 'right' } },
    alternateRowStyles: { fillColor: GRIS_ZEBRA },
    footStyles: { fillColor: VERDE_CLARO, textColor: VERDE_OSCURO },
    willDrawPage: dibujarEncabezadoYPie,
  });

  let yPie = doc.lastAutoTable.finalY + 10;
  doc.setDrawColor(...BORDE_SUAVE); doc.setLineWidth(0.3);
  doc.line(MARGEN, yPie, pageWidth - MARGEN, yPie); yPie += 5;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(...GRIS_SUAVE);
  doc.text('Este documento fue generado automáticamente por el sistema de gestión de procesos de MD Abogados SAS.', MARGEN, yPie);

  numerarPaginas();
  const hoyISO = hoy.toISOString().slice(0, 10);
  doc.save(`Liquidación Intereses ${hoyISO}.pdf`);
}
