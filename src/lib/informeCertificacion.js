// Certificación laboral (Trabajador) / de prestación de servicios
// (Contratista) para un colaborador de Equipo MD — pedido explícito del
// usuario 2026-08-22, a partir de los perfiles reales del equipo (fotos de
// la página del despacho) para confirmar los cargos reales de cada persona.
// Reusa el mismo membrete/firma/paginación que el resto de Informes
// (informesPDF.js) — un solo documento por colaborador, sin tabla (a
// diferencia de las cartas de informe por Entidad, que listan varios
// procesos).
// Ver [[project_colaboradores_roles_permisos]].
// `imagenComoDataUrl`/`ANCHO_FIRMA_COMPLETA_MM` y la imagen del cierre
// ("Cordial saludo," + firma real + nombre/CC/TP, ya armada como una sola
// pieza) viven en informesPDF.js — se extendieron ahí mismo 2026-08-22 para
// que TODAS las cartas de informe (SOS/Famisanar/Aliansalud/Colpatria/
// Colmédica/genérico) usaran el mismo bloque de cierre, no solo esta
// certificación (que fue donde se armó primero).
import { prepararDocumentoPDF, fechaLarga, VERDE_OSCURO, TEXTO, GRIS_SUAVE, BORDE_SUAVE, MARGEN, CONTENIDO_Y_INICIAL, CONTENIDO_Y_MAXIMO, dibujarResumenBox, FIRMA_DEFECTO, imagenComoDataUrl, ANCHO_FIRMA_COMPLETA_MM } from './informesPDF';
import firmaCompleta from '../assets/Firma Monica Completa.png';

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

// "15 de enero de 2024" — para meter dentro del párrafo de texto corrido
// (fechaCorta de informesPDF.js da "dd/mm/aaaa", muy numérico para una
// certificación formal).
function fechaLargaSinDia(iso){
  if(!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if(!m) return null;
  return `${Number(m[3])} de ${MESES[Number(m[2])-1]} de ${m[1]}`;
}
function fechaCortaVisible(iso){
  if(!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if(!m) return "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function nombreArchivoSeguro(s){
  return (s||"").toString().replace(/[\/\\?%*:|"<>]/g, "-");
}

// Párrafo central, como una lista de "tramos" ({text, bold}) en vez de un
// solo string — jsPDF no soporta negrita a mitad de una línea con su
// doc.text() normal, así que se arma por tramos y se dibuja tramo por tramo
// más abajo (dibujarParrafoConNegritas). {parrafo:true} marca un salto de
// párrafo (línea en blanco). Nombre e identificación en negrita — pedido
// explícito del usuario 2026-08-22 (los señaló en un PDF real). Cambia
// según sea Trabajador (relación laboral) o Contratista (prestación de
// servicios independiente); si no hay Fecha de retiro, certifica como
// vigente "a la fecha de expedición" en vez de mostrar un rango cerrado.
function segmentosCertificacion(colaborador, esContratista){
  const nombre = (colaborador.Nombre || "").toUpperCase();
  const tipoId = colaborador.TipoIdentificacion || "C.C.";
  const identificacion = colaborador.Identificacion || "—";
  const cargo = colaborador.Cargo || "—";
  const desde = fechaLargaSinDia(colaborador.FechaIngreso);
  const hasta = fechaLargaSinDia(colaborador.FechaRetiro);
  const vigente = !!desde && !hasta;
  const rangoFechas = desde
    ? (hasta ? `desde el ${desde} hasta el ${hasta}` : `desde el ${desde} a la fecha de expedición del presente documento, vinculación que continúa vigente`)
    : `durante el tiempo que se relaciona en los registros del despacho`;

  const encabezado = { text: 'MD ABOGADOS SAS, identificada con Nit. 900.495.788-3, CERTIFICA QUE:' };
  const nombreBold = { text: nombre + ',', bold: true };
  const conectorId = { text: `identificado(a) con ${tipoId} No.` };
  const idBold = { text: identificacion + ',', bold: true };
  const cierre = { text: 'La presente certificación se expide a solicitud del interesado, para los fines que estime convenientes.' };

  if(esContratista){
    const verbo = vigente ? 'presta' : 'ha prestado';
    return [
      encabezado, { parrafo:true },
      nombreBold, conectorId, idBold,
      { text: `${verbo} sus servicios profesionales de forma independiente a esta firma, mediante contrato de prestación de servicios, ${rangoFechas}, desempeñándose como ${cargo}.` },
      { parrafo:true },
      { text: 'Se aclara que dicha vinculación NO corresponde a una relación laboral, sino a un contrato de prestación de servicios profesionales, sin subordinación ni dependencia.' },
      { parrafo:true }, cierre,
    ];
  }
  const verbo = vigente ? 'labora' : 'laboró';
  return [
    encabezado, { parrafo:true },
    nombreBold, conectorId, idBold,
    { text: `${verbo} en esta firma ${rangoFechas}, desempeñando el cargo de ${cargo}.` },
    { parrafo:true }, cierre,
  ];
}

// Dibuja los tramos de segmentosCertificacion() en la hoja, ajustando línea
// por línea (palabra por palabra) contra `maxWidth` — necesario porque
// doc.splitTextToSize()/doc.text() de jsPDF trabajan con UN solo estilo de
// letra por llamada, no pueden mezclar negrita a mitad de una oración.
// Requiere que ya se haya llamado doc.setFontSize()/doc.setTextColor()
// antes (el tamaño/color no cambian por tramo, solo bold/normal).
function dibujarParrafoConNegritas(doc, segmentos, x, y, maxWidth, lineHeight){
  let cursorX = x, cursorY = y;
  segmentos.forEach(seg => {
    if(seg.parrafo){ cursorY += lineHeight * 1.6; cursorX = x; return; }
    doc.setFont('helvetica', seg.bold ? 'bold' : 'normal');
    seg.text.split(' ').filter(Boolean).forEach(palabra => {
      if(cursorX + doc.getTextWidth(palabra) > x + maxWidth){
        cursorY += lineHeight;
        cursorX = x;
      }
      doc.text(palabra, cursorX, cursorY);
      cursorX += doc.getTextWidth(palabra + ' ');
    });
  });
  return cursorY + lineHeight;
}

export async function generarCertificacionColaboradorPDF(colaborador){
  const esContratista = (colaborador.TipoColaborador||"").toLowerCase() === 'contratista';
  const titulo = esContratista ? 'Certificación de prestación de servicios' : 'Certificación laboral';
  const { doc, pageWidth, hoy, fecha, dibujarEncabezadoYPie, numerarPaginas } = await prepararDocumentoPDF(titulo);

  dibujarEncabezadoYPie();
  let y = CONTENIDO_Y_INICIAL;
  doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(...TEXTO);
  doc.text(`Bogotá D.C., ${fecha}`, MARGEN, y); y += 9;
  // "A quien interese" / Asunto centrados (pedido explícito del usuario
  // 2026-08-22) — la fecha de arriba se queda alineada al margen.
  doc.text('A quien interese:', pageWidth/2, y, {align:'center'}); y += 9;
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...VERDE_OSCURO);
  doc.text(`Asunto: ${titulo}`, pageWidth/2, y, {align:'center'}); y += 8;

  y = dibujarResumenBox(doc, MARGEN, y, pageWidth - MARGEN*2, [
    { label:'Cargo', value: colaborador.Cargo || "—" },
    { label:'Fecha de ingreso', value: fechaCortaVisible(colaborador.FechaIngreso) },
    { label: colaborador.FechaRetiro ? 'Fecha de retiro' : 'Estado', value: colaborador.FechaRetiro ? fechaCortaVisible(colaborador.FechaRetiro) : 'Vigente' },
  ]) + 9;

  doc.setFontSize(10.5); doc.setTextColor(...TEXTO);
  y = dibujarParrafoConNegritas(doc, segmentosCertificacion(colaborador, esContratista), MARGEN, y, pageWidth - MARGEN*2, 5.4) + 11;

  if(y > CONTENIDO_Y_MAXIMO - 45){
    doc.addPage();
    dibujarEncabezadoYPie();
    y = CONTENIDO_Y_INICIAL;
  }
  // Bloque de cierre completo ("Cordial saludo," + firma real + nombre/CC/TP
  // impresos) como una sola imagen — solo para Mónica, la firmante por
  // defecto de todos los Informes (FIRMA_DEFECTO). Si algún día firma otra
  // persona, esto necesita su propia imagen equivalente. Si la imagen no
  // carga por lo que sea, cae de vuelta al mismo bloque armado con texto
  // (sin la firma real) para no dejar la certificación sin cierre.
  try{
    const { dataUrl, ancho, alto } = await imagenComoDataUrl(firmaCompleta);
    const altoBloque = ANCHO_FIRMA_COMPLETA_MM * (alto/ancho);
    doc.addImage(dataUrl, 'JPEG', MARGEN - 3, y, ANCHO_FIRMA_COMPLETA_MM, altoBloque);
    y += altoBloque + 6;
  }catch(err){
    console.error('No se pudo cargar la imagen de cierre, se usa el texto de respaldo:', err);
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...TEXTO);
    doc.text('Cordial saludo,', MARGEN, y); y += 20;
    doc.setFont('helvetica','bold'); doc.text(FIRMA_DEFECTO.nombre, MARGEN, y); y += 5;
    doc.setFont('helvetica','normal'); doc.text(FIRMA_DEFECTO.cc, MARGEN, y); y += 5;
    doc.text(FIRMA_DEFECTO.tp, MARGEN, y); y += 12;
  }

  doc.setDrawColor(...BORDE_SUAVE); doc.setLineWidth(0.3);
  doc.line(MARGEN, y, pageWidth - MARGEN, y); y += 5;
  doc.setFont('helvetica','italic'); doc.setFontSize(7.5); doc.setTextColor(...GRIS_SUAVE);
  doc.text('Este documento fue generado automáticamente por el sistema de gestión de procesos de MD Abogados SAS.', MARGEN, y);

  numerarPaginas();
  const hoyISO = hoy.toISOString().slice(0,10);
  doc.save(`${titulo} ${nombreArchivoSeguro(colaborador.Nombre)} ${hoyISO}.pdf`);
}
