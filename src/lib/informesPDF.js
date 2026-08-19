// Scaffolding COMPARTIDO para los PDF de la app: tanto la carta de informe
// por Entidad (varios procesos en una tabla) como la ficha individual de un
// solo proceso comparten el mismo membrete, pie de página y numeración —
// `prepararDocumentoPDF()` arma eso una sola vez y cada uno construye el
// cuerpo que necesita encima. Extraído 2026-08-16 al agregar la 2ª Entidad
// (Famisanar) y ampliado el mismo día al agregar la ficha por proceso.
// Encabezado rediseñado 2026-08-19 para usar el membrete completo real
// (el mismo que ya usaba la hoja imprimible de Facturas/Órdenes de compra
// — src/components/FacturaDrawer.jsx, clase .print-membrete-bg), en vez del
// logo chico + título propio que tenía antes — pedido explícito del
// usuario: "el encabezado sea igual...como el de facturas".
// Ver [[project_informes_modulo]].
import membreteLexara from '../assets/Membrete Lexara.png';

const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
export function fechaLarga(d){
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
export function fechaCorta(iso){
  if(!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if(!m) return "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// El membrete original (PNG a 2563×3625, sin transparencia) pesa varios
// cientos de KB a su resolución nativa — de sobra para una hoja A4 completa,
// pero si jsPDF no lo reutiliza bien entre las decenas de páginas de un
// informe grande, el PDF terminaba pesando más de 100MB (ya pasó antes con
// el logo chico). Se reescala a ~150dpi por canvas y se convierte a JPEG
// antes de dárselo a jsPDF: mucho más liviano y, junto con el alias fijo en
// doc.addImage, se incrusta una sola vez sin importar cuántas páginas lo usen.
function membreteParaPDF(url){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const anchoDestino = 1240; // ~150dpi para una hoja A4 completa (210mm)
      const escala = anchoDestino / img.naturalWidth;
      const altoDestino = Math.round(img.naturalHeight * escala);
      const canvas = document.createElement('canvas');
      canvas.width = anchoDestino; canvas.height = altoDestino;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, anchoDestino, altoDestino);
      ctx.drawImage(img, 0, 0, anchoDestino, altoDestino);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export const VERDE_OSCURO = [0, 73, 65];
export const GRIS_SUAVE = [92, 107, 104];
export const TEXTO = [28, 38, 36];
export const GRIS_ZEBRA = [247, 248, 247];
export const MARGEN = 18;
// El membrete completo ocupa el logo/cintas arriba y la barra dorada de
// contacto abajo — el contenido de cada informe tiene que dejar espacio
// para ambos. CONTENIDO_Y_INICIAL es el mismo criterio que ya usaba la
// hoja imprimible de Facturas (`.print-body{padding-top:60mm}`) para el
// título del documento; el cuerpo de cada informe empieza un poco más
// abajo, después del título/subtítulo/línea. CONTENIDO_Y_MAXIMO es hasta
// dónde puede llegar el contenido antes de la franja dorada del pie.
export const CONTENIDO_Y_INICIAL = 76;
export const CONTENIDO_Y_MAXIMO = 255;

// Firmante por defecto de las cartas de informe — mismo dato real que ya
// usaba el despacho (tarjeta profesional, dato público). Si algún informe
// necesita otro firmante, se puede pasar `firma` distinto en `opts`.
export const FIRMA_DEFECTO = {
  nombre: "MÓNICA PAOLA QUINTERO JIMÉNEZ",
  cc: "C.C. No. 40.039.240 de Tunja",
  tp: "T.P. No. 97.956 del C. S. de la J.",
};

// Arma el documento jsPDF + carga el membrete una sola vez — lo comparten la
// carta de informe (generarCartaInformePDF), la ficha individual de proceso
// (generarFichaProcesoPDF en informeProceso.js) y el informe de Tutelas
// (informeTutelas.js). `tituloEncabezado` es el título del documento, en la
// franja debajo del logo — mismo lugar/estilo que "SOLICITUD DE
// FACTURACIÓN ELECTRÓNICA" en la hoja imprimible de Facturas.
export async function prepararDocumentoPDF(tituloEncabezado = 'Reporte procesos judiciales'){
  const [{ default: jsPDF }, { default: autoTable }, membreteDataUrl] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    membreteParaPDF(membreteLexara),
  ]);

  const doc = new jsPDF({ unit:'mm', format:'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const hoy = new Date();
  const fecha = fechaLarga(hoy);

  function dibujarEncabezadoYPie(){
    // Membrete completo (logo + cintas arriba, franja dorada de contacto
    // abajo, ya con su propio texto/íconos incrustados en la imagen) —
    // estirado a la hoja A4 entera, igual que en la impresión de Facturas.
    doc.addImage(membreteDataUrl, 'JPEG', 0, 0, pageWidth, pageHeight, 'lexara-membrete-pdf', 'MEDIUM');
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...VERDE_OSCURO);
    doc.text(tituloEncabezado, MARGEN, 60);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...GRIS_SUAVE);
    doc.text('MD ABOGADOS SAS · Nit 900.495.788-3', MARGEN, 66);
    doc.setDrawColor(...VERDE_OSCURO); doc.setLineWidth(0.8);
    doc.line(MARGEN, 70, pageWidth - MARGEN, 70);
  }

  // Numeración final — se llama al terminar de armar todo el documento, ya
  // con el total real de páginas (mientras se arma no se sabe cuántas van a
  // hacer falta si hay tablas/texto largo que paginan solos). Va justo
  // encima de la franja dorada del membrete (que ya trae su propio texto de
  // contacto incrustado, no hace falta repetirlo acá).
  function numerarPaginas(){
    const totalPaginas = doc.internal.getNumberOfPages();
    for(let i=1; i<=totalPaginas; i++){
      doc.setPage(i);
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...GRIS_SUAVE);
      doc.text(`Página ${i} de ${totalPaginas}`, pageWidth - MARGEN, CONTENIDO_Y_MAXIMO, {align:'right'});
    }
  }

  return { doc, autoTable, pageWidth, pageHeight, hoy, fecha, dibujarEncabezadoYPie, numerarPaginas };
}

// opts: {
//   nombreArchivo: "Informe SOS" (sin fecha ni extensión, se agregan solas),
//   nombreEntidad: "EPS SERVICIO OCCIDENTAL DE SALUD S.A" (razón social completa, para "Señores:"),
//   cantidadProcesos: number,
//   parrafo: string (texto ya armado, puede usar la fecha/cantidad que el caller ya interpoló),
//   columnas: ["Encabezado 1", "Encabezado 2", ...],
//   filas: [[...], [...]] (mismo orden que `columnas`, ya formateadas como texto),
//   columnStyles: objeto de jspdf-autotable (estilos por índice de columna),
//   firma: {nombre, cc, tp} (opcional, por defecto FIRMA_DEFECTO),
// }
export async function generarCartaInformePDF(opts){
  const { nombreArchivo, nombreEntidad, cantidadProcesos, parrafo, columnas, filas, columnStyles, firma = FIRMA_DEFECTO } = opts;
  const { doc, autoTable, pageWidth, pageHeight, hoy, fecha, dibujarEncabezadoYPie, numerarPaginas } = await prepararDocumentoPDF();

  // --- Página 1: encabezado de la carta ---
  dibujarEncabezadoYPie();
  let y = CONTENIDO_Y_INICIAL;
  doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(...TEXTO);
  doc.text(`Bogotá D.C., ${fecha}`, MARGEN, y); y += 8;
  doc.text('Señores:', MARGEN, y); y += 5;
  doc.setFont('helvetica','bold'); doc.text(nombreEntidad, MARGEN, y); y += 5;
  doc.setFont('helvetica','normal'); doc.text('Ciudad', MARGEN, y); y += 8;
  doc.setFont('helvetica','bold'); doc.setTextColor(...VERDE_OSCURO);
  doc.text('Asunto: Reporte procesos judiciales', MARGEN, y); y += 6;
  doc.setFont('helvetica','normal'); doc.setTextColor(...TEXTO);
  doc.text(`Cantidad de procesos: ${cantidadProcesos}`, MARGEN, y); y += 8;
  doc.text('Cordial saludo,', MARGEN, y); y += 7;
  const lineasParrafo = doc.splitTextToSize(parrafo, pageWidth - MARGEN*2);
  doc.text(lineasParrafo, MARGEN, y);
  y += lineasParrafo.length * 5 + 6;

  // --- Tabla (autoTable pagina sola y repite el encabezado en cada hoja) ---
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN, top: CONTENIDO_Y_INICIAL, bottom: 297 - CONTENIDO_Y_MAXIMO },
    head: [columnas],
    body: filas,
    styles: { font:'helvetica', fontSize:8.5, cellPadding:2.4, valign:'top', lineColor:[224,226,224], lineWidth:0.15, textColor:TEXTO },
    headStyles: { fillColor:VERDE_OSCURO, textColor:255, fontStyle:'bold', halign:'center', fontSize:8.5 },
    alternateRowStyles: { fillColor:GRIS_ZEBRA },
    columnStyles,
    didDrawPage: dibujarEncabezadoYPie,
  });

  // --- Firma, después de la tabla (nueva hoja si ya no cabe) ---
  let yFirma = doc.lastAutoTable.finalY + 16;
  if(yFirma > CONTENIDO_Y_MAXIMO - 25){
    doc.addPage();
    dibujarEncabezadoYPie();
    yFirma = CONTENIDO_Y_INICIAL;
  }
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...TEXTO);
  doc.text('Certifico cordialmente,', MARGEN, yFirma); yFirma += 14;
  doc.setFont('helvetica','bold'); doc.text(firma.nombre, MARGEN, yFirma); yFirma += 5;
  doc.setFont('helvetica','normal'); doc.text(firma.cc, MARGEN, yFirma); yFirma += 5;
  doc.text(firma.tp, MARGEN, yFirma);

  numerarPaginas();

  const hoyISO = hoy.toISOString().slice(0,10);
  doc.save(`${nombreArchivo} ${hoyISO}.pdf`);
}
