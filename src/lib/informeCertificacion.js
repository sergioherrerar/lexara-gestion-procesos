// Certificación laboral (Trabajador) / de prestación de servicios
// (Contratista) para un colaborador de Equipo MD — pedido explícito del
// usuario 2026-08-22, a partir de los perfiles reales del equipo (fotos de
// la página del despacho) para confirmar los cargos reales de cada persona.
// Reusa el mismo membrete/firma/paginación que el resto de Informes
// (informesPDF.js) — un solo documento por colaborador, sin tabla (a
// diferencia de las cartas de informe por Entidad, que listan varios
// procesos).
// Ver [[project_colaboradores_roles_permisos]].
import { prepararDocumentoPDF, fechaLarga, VERDE_OSCURO, TEXTO, GRIS_SUAVE, BORDE_SUAVE, MARGEN, CONTENIDO_Y_INICIAL, CONTENIDO_Y_MAXIMO, dibujarResumenBox, FIRMA_DEFECTO } from './informesPDF';

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

// Párrafo central — cambia según sea Trabajador (relación laboral) o
// Contratista (prestación de servicios independiente). Si no hay Fecha de
// retiro, se certifica como vigente "a la fecha de expedición" en vez de
// mostrar un rango cerrado.
function parrafoCertificacion(colaborador, esContratista){
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

  if(esContratista){
    const verbo = vigente ? 'presta' : 'ha prestado';
    return `MD ABOGADOS SAS, identificada con Nit. 900.495.788-3, CERTIFICA QUE:\n\n` +
      `${nombre}, identificado(a) con ${tipoId} No. ${identificacion}, ${verbo} sus servicios profesionales de forma independiente a esta firma, mediante contrato de prestación de servicios, ${rangoFechas}, desempeñándose como ${cargo}.\n\n` +
      `Se aclara que dicha vinculación NO corresponde a una relación laboral, sino a un contrato de prestación de servicios profesionales, sin subordinación ni dependencia.\n\n` +
      `La presente certificación se expide a solicitud del interesado, para los fines que estime convenientes.`;
  }
  const verbo = vigente ? 'labora' : 'laboró';
  return `MD ABOGADOS SAS, identificada con Nit. 900.495.788-3, CERTIFICA QUE:\n\n` +
    `${nombre}, identificado(a) con ${tipoId} No. ${identificacion}, ${verbo} en esta firma ${rangoFechas}, desempeñando el cargo de ${cargo}.\n\n` +
    `La presente certificación se expide a solicitud del interesado, para los fines que estime convenientes.`;
}

export async function generarCertificacionColaboradorPDF(colaborador){
  const esContratista = (colaborador.TipoColaborador||"").toLowerCase() === 'contratista';
  const titulo = esContratista ? 'Certificación de prestación de servicios' : 'Certificación laboral';
  const { doc, pageWidth, hoy, fecha, dibujarEncabezadoYPie, numerarPaginas } = await prepararDocumentoPDF(titulo);

  dibujarEncabezadoYPie();
  let y = CONTENIDO_Y_INICIAL;
  doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(...TEXTO);
  doc.text(`Bogotá D.C., ${fecha}`, MARGEN, y); y += 9;
  doc.text('A quien interese:', MARGEN, y); y += 9;
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...VERDE_OSCURO);
  doc.text(`Asunto: ${titulo}`, MARGEN, y); y += 8;

  y = dibujarResumenBox(doc, MARGEN, y, pageWidth - MARGEN*2, [
    { label:'Cargo', value: colaborador.Cargo || "—" },
    { label:'Fecha de ingreso', value: fechaCortaVisible(colaborador.FechaIngreso) },
    { label: colaborador.FechaRetiro ? 'Fecha de retiro' : 'Estado', value: colaborador.FechaRetiro ? fechaCortaVisible(colaborador.FechaRetiro) : 'Vigente' },
  ]) + 9;

  doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(...TEXTO);
  const lineasParrafo = doc.splitTextToSize(parrafoCertificacion(colaborador, esContratista), pageWidth - MARGEN*2);
  doc.text(lineasParrafo, MARGEN, y, {lineHeightFactor: 1.35});
  y += lineasParrafo.length * 5.4 + 16;

  if(y > CONTENIDO_Y_MAXIMO - 45){
    doc.addPage();
    dibujarEncabezadoYPie();
    y = CONTENIDO_Y_INICIAL;
  }
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...TEXTO);
  doc.text('Certifico cordialmente,', MARGEN, y); y += 14;
  doc.setFont('helvetica','bold'); doc.text(FIRMA_DEFECTO.nombre, MARGEN, y); y += 5;
  doc.setFont('helvetica','normal'); doc.text(FIRMA_DEFECTO.cc, MARGEN, y); y += 5;
  doc.text(FIRMA_DEFECTO.tp, MARGEN, y); y += 12;

  doc.setDrawColor(...BORDE_SUAVE); doc.setLineWidth(0.3);
  doc.line(MARGEN, y, pageWidth - MARGEN, y); y += 5;
  doc.setFont('helvetica','italic'); doc.setFontSize(7.5); doc.setTextColor(...GRIS_SUAVE);
  doc.text('Este documento fue generado automáticamente por el sistema de gestión de procesos de MD Abogados SAS.', MARGEN, y);

  numerarPaginas();
  const hoyISO = hoy.toISOString().slice(0,10);
  doc.save(`${titulo} ${nombreArchivoSeguro(colaborador.Nombre)} ${hoyISO}.pdf`);
}
