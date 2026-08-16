// Ficha individual de un solo Proceso judicial en PDF — a diferencia de los
// informes por Entidad (informeSOS.js/informeFamisanar.js/informeLexara.js,
// que listan VARIOS procesos en una carta), este es un resumen de UN solo
// proceso, pensado para el botón de PDF en la tabla de Procesos judiciales
// (ProcesosView.jsx). Reutiliza el mismo membrete/pie/paginación
// (prepararDocumentoPDF en informesPDF.js) que los demás PDF de la app.
// Ver CHANGELOG 2026-08-16 y [[project_informes_modulo]].
import { stripHtml, parseMonto, fmtMonto } from './graph';
import { prepararDocumentoPDF, fechaCorta, VERDE_OSCURO, GRIS_ZEBRA, TEXTO, MARGEN } from './informesPDF';

function despachoConcatenado(p){
  const despacho = (p.Despacho||"").trim();
  const numero = (p.NumeroDespacho||"").trim();
  return [despacho, numero].filter(Boolean).join(" ") || "—";
}
// Nombres de archivo no pueden tener estos caracteres en Windows.
function nombreArchivoSeguro(s){
  return (s||"").toString().replace(/[\/\\?%*:|"<>]/g, "-");
}

export async function generarFichaProcesoPDF(proceso){
  const { doc, autoTable, pageWidth, dibujarEncabezadoYPie, numerarPaginas } = await prepararDocumentoPDF('Ficha del proceso');

  dibujarEncabezadoYPie();
  let y = 34;
  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...VERDE_OSCURO);
  doc.text(`Ficha del proceso — ${proceso.Radicado || proceso.NoCompleto || "—"}`, MARGEN, y);
  y += 8;
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...TEXTO);
  doc.text(`Cliente: ${proceso.Cliente || "—"}`, MARGEN, y);
  y += 8;

  // Tabla de 2 columnas (Campo/Valor) sin encabezado — autoTable pagina sola
  // si Estado/Histórico (las 2 últimas filas, con narrativas largas) no
  // caben en una sola hoja, repitiendo el membrete en cada página nueva.
  const filas = [
    ["No. Completo", proceso.NoCompleto || "—"],
    ["Entidad", proceso.Entidad || "—"],
    ["Apoderado", proceso.Apoderado || "—"],
    ["Despacho", despachoConcatenado(proceso)],
    ["Instancia", proceso.Instancia || "—"],
    ["Tipo de Acción", proceso.TipoAccion || "—"],
    ["Tipo de proceso", proceso.TipoProceso || "—"],
    ["Etapa procesal", proceso.EtapaProcesal || "—"],
    ["Estado V/T", proceso.EstadoVT || "—"],
    ["Fecha admisión", fechaCorta(proceso.FechaAdmision)],
    ["Fecha contestación", fechaCorta(proceso.FechaContestacion)],
    ["Fecha último estado", fechaCorta(proceso.FechaUltimoEstado)],
    ["Valor actual demanda", proceso.ValorActualDemanda ? fmtMonto(parseMonto(proceso.ValorActualDemanda)) : "—"],
    ["Calificación de contingencia", proceso.CalificacionContingencia || "—"],
    ["Estado", stripHtml(proceso.Estado) || "—"],
    ["Histórico", stripHtml(proceso.Historico) || "—"],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN, top: 30, bottom: 22 },
    body: filas,
    styles: { font:'helvetica', fontSize:9, cellPadding:3, valign:'top', lineColor:[224,226,224], lineWidth:0.15, textColor:TEXTO },
    alternateRowStyles: { fillColor: GRIS_ZEBRA },
    columnStyles: {
      0: { halign:'left', fontStyle:'bold', textColor:VERDE_OSCURO, cellWidth:42 },
      1: { halign:'left', cellWidth: pageWidth - MARGEN*2 - 42 },
    },
    didDrawPage: dibujarEncabezadoYPie,
  });

  numerarPaginas();

  const hoyISO = new Date().toISOString().slice(0,10);
  const nombreArchivo = nombreArchivoSeguro(`Ficha ${proceso.Radicado || proceso.NoCompleto || proceso.id}`);
  doc.save(`${nombreArchivo} ${hoyISO}.pdf`);
}
