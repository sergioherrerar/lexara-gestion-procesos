// Scaffolding COMPARTIDO para la carta en PDF de los informes por Entidad —
// cada Entidad tiene sus propias columnas y texto (eso vive en su propio
// archivo, p.ej. informeSOS.js/informeFamisanar.js), pero todas comparten el
// mismo membrete, paginación, firma y arreglo de tamaño de archivo. Extraído
// 2026-08-16 al agregar la segunda Entidad (Famisanar) — evita repetir (y
// tener que corregir dos veces) el mismo scaffolding de jsPDF.
// Ver [[project_informes_modulo]].
import logoVerde from '../assets/Logo verde OScuro.png';

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

// El logo original (PNG con transparencia) pesa varios cientos de KB a su
// resolución nativa — de sobra para un logo de 28mm en el encabezado, pero
// si jsPDF no lo reutiliza bien entre las decenas de páginas de un informe
// grande, el PDF terminaba pesando más de 100MB. Se reescala a un tamaño
// chico por canvas y se convierte a JPEG (sin transparencia, se rellena de
// blanco — el fondo de la carta ya es blanco) antes de dárselo a jsPDF:
// mucho más liviano y, junto con el alias fijo en doc.addImage, se incrusta
// una sola vez sin importar cuántas páginas lo usen.
function logoParaPDF(url){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const anchoDestino = 300; // de sobra para nitidez a 28mm impreso
      const escala = anchoDestino / img.naturalWidth;
      const altoDestino = Math.round(img.naturalHeight * escala);
      const canvas = document.createElement('canvas');
      canvas.width = anchoDestino; canvas.height = altoDestino;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, anchoDestino, altoDestino);
      ctx.drawImage(img, 0, 0, anchoDestino, altoDestino);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
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

// Firmante por defecto de las cartas de informe — mismo dato real que ya
// usaba el despacho (tarjeta profesional, dato público). Si algún informe
// necesita otro firmante, se puede pasar `firma` distinto en `opts`.
const FIRMA_DEFECTO = {
  nombre: "MÓNICA PAOLA QUINTERO JIMÉNEZ",
  cc: "C.C. No. 40.039.240 de Tunja",
  tp: "T.P. No. 97.956 del C. S. de la J.",
};

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
  const [{ default: jsPDF }, { default: autoTable }, logoDataUrl] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    logoParaPDF(logoVerde),
  ]);

  const doc = new jsPDF({ unit:'mm', format:'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const hoy = new Date();
  const fecha = fechaLarga(hoy);

  function dibujarEncabezadoYPie(){
    doc.addImage(logoDataUrl, 'JPEG', MARGEN, 10, 28, 11.3, 'lexara-logo-pdf', 'MEDIUM');
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...VERDE_OSCURO);
    doc.text('Reporte procesos judiciales', pageWidth - MARGEN, 14, {align:'right'});
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...GRIS_SUAVE);
    doc.text('MD ABOGADOS SAS · Nit 900.495.788-3', pageWidth - MARGEN, 19, {align:'right'});
    doc.setDrawColor(...VERDE_OSCURO); doc.setLineWidth(0.8);
    doc.line(MARGEN, 25, pageWidth - MARGEN, 25);

    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...GRIS_SUAVE);
    doc.text('www.lexaraabogados.com   ·   Gerencia@lexaraabogados.com   ·   +57 312 442 0026', MARGEN, pageHeight - 14);
  }

  // --- Página 1: encabezado de la carta ---
  dibujarEncabezadoYPie();
  let y = 34;
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
    margin: { left: MARGEN, right: MARGEN, top: 30, bottom: 22 },
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
  if(yFirma > pageHeight - 45){
    doc.addPage();
    dibujarEncabezadoYPie();
    yFirma = 34;
  }
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...TEXTO);
  doc.text('Certifico cordialmente,', MARGEN, yFirma); yFirma += 14;
  doc.setFont('helvetica','bold'); doc.text(firma.nombre, MARGEN, yFirma); yFirma += 5;
  doc.setFont('helvetica','normal'); doc.text(firma.cc, MARGEN, yFirma); yFirma += 5;
  doc.text(firma.tp, MARGEN, yFirma);

  // --- Numeración final, ya con el total real de páginas ---
  const totalPaginas = doc.internal.getNumberOfPages();
  for(let i=1; i<=totalPaginas; i++){
    doc.setPage(i);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...GRIS_SUAVE);
    doc.text(`Página ${i} de ${totalPaginas}`, pageWidth - MARGEN, pageHeight - 14, {align:'right'});
  }

  const hoyISO = hoy.toISOString().slice(0,10);
  doc.save(`${nombreArchivo} ${hoyISO}.pdf`);
}
