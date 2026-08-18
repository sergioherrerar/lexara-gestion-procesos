// Informe diario de Tutelas (PDF + Correo) — modelado sobre el reporte y la
// macro de Access "Correo_2_Click" que el usuario compartió 2026-08-17. A
// diferencia del resto de Informes (por Entidad), este junta TODAS las
// Tutelas sin filtrar por Entidad, igual que la consulta original de Access.
// Ver [[project_tutelas_modulo]].
import { prepararDocumentoPDF, fechaCorta, VERDE_OSCURO, GRIS_ZEBRA, TEXTO, MARGEN } from './informesPDF';

const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

// "lunes, 17 de agosto de 2026    10:45:41 a. m." — igual al formato del
// encabezado del reporte de Access (día + hora exacta de generación).
function fechaHoraLarga(d){
  let horas12 = d.getHours() % 12; if(horas12 === 0) horas12 = 12;
  const ampm = d.getHours() >= 12 ? 'p. m.' : 'a. m.';
  const mins = String(d.getMinutes()).padStart(2,'0');
  const segs = String(d.getSeconds()).padStart(2,'0');
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}    ${horas12}:${mins}:${segs} ${ampm}`;
}

// Suma/resta días a una fecha "yyyy-mm-dd" sin líos de huso horario (evita
// construir un Date desde el string ISO completo, que UTC-desplaza el día).
function sumarDias(iso, dias){
  const [y,m,d] = iso.split('-').map(Number);
  const dt = new Date(y, m-1, d + dias);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

// El usuario solo elige UNA fecha (la de Vencimiento) — la de Notificación
// sale sola como el día anterior a esa (pedido explícito 2026-08-17: "por
// fecha de notificacion las de fecha del dia anterior sea cual sea").
export function calcularFechasInforme(fechaVencimientoISO){
  return {
    fechaVencimiento: fechaVencimientoISO,
    fechaNotificacion: sumarDias(fechaVencimientoISO, -1),
  };
}

function filasPorFecha(tutelas, campoFecha, fechaISO){
  return tutelas
    .filter(t => (t[campoFecha]||"").slice(0,10) === fechaISO)
    .sort((a,b) => (a.NoTutela||"").localeCompare(b.NoTutela||""));
}

// Dibuja una barra de título verde + una tabla debajo (mismo criterio visual
// que el resto de Informes) y devuelve la posición Y donde sigue el
// contenido siguiente.
function dibujarSeccion(doc, autoTable, titulo, columnas, filas, y, pageWidth, dibujarEncabezadoYPie){
  doc.setFillColor(...VERDE_OSCURO);
  doc.rect(MARGEN, y, pageWidth - MARGEN*2, 7, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(255);
  doc.text(titulo, MARGEN + 2, y + 5);
  autoTable(doc, {
    startY: y + 7,
    margin: { left: MARGEN, right: MARGEN, top: 30, bottom: 22 },
    head: [columnas],
    body: filas,
    styles: { font:'helvetica', fontSize:8.5, cellPadding:2.4, valign:'top', lineColor:[224,226,224], lineWidth:0.15, textColor:TEXTO },
    headStyles: { fillColor:VERDE_OSCURO, textColor:255, fontStyle:'bold', halign:'center', fontSize:8.5 },
    alternateRowStyles: { fillColor:GRIS_ZEBRA },
    didDrawPage: dibujarEncabezadoYPie,
  });
  return doc.lastAutoTable.finalY + 10;
}

export async function generarInformeTutelasPDF(tutelas, fechaVencimientoISO){
  const { fechaVencimiento, fechaNotificacion } = calcularFechasInforme(fechaVencimientoISO);
  const { doc, autoTable, pageWidth, dibujarEncabezadoYPie, numerarPaginas } = await prepararDocumentoPDF('Tutelas notificadas y vencimiento');

  dibujarEncabezadoYPie();
  let y = 32;
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(...VERDE_OSCURO);
  doc.text('Tutelas Notificadas y con vencimiento', MARGEN, y);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...TEXTO);
  doc.text(fechaHoraLarga(new Date()), pageWidth - MARGEN, y, {align:'right'});
  y += 8;

  const notificadas = filasPorFecha(tutelas, 'FechaNotificacion', fechaNotificacion);
  const vencimiento = filasPorFecha(tutelas, 'FechaVencimiento', fechaVencimiento);

  y = dibujarSeccion(doc, autoTable, 'Tutelas Notificadas',
    ['No Tutela','Cliente','Tipo Respuesta','Fecha Notificación'],
    notificadas.map(t => [t.NoTutela||"—", t.Cliente||"—", t.TipoRespuesta||"—", fechaCorta(t.FechaNotificacion)]),
    y, pageWidth, dibujarEncabezadoYPie);

  dibujarSeccion(doc, autoTable, 'Tutelas con Vencimiento',
    ['No Tutela','Cliente','Tipo Respuesta','Vencimiento'],
    vencimiento.map(t => [t.NoTutela||"—", t.Cliente||"—", t.TipoRespuesta||"—", fechaCorta(t.FechaVencimiento)]),
    y, pageWidth, dibujarEncabezadoYPie);

  numerarPaginas();
  doc.save(`Tutelas Notificadas y con vencimiento ${fechaVencimiento}.pdf`);
}

// Botón "Correo" — mismos destinatarios y asunto que la macro de Access
// original. IMPORTANTE: un enlace mailto: (a diferencia de la automatización
// COM de Outlook que usaba la macro) NO puede adjuntar archivos ni mandar el
// cuerpo con las tablas de colores y la imagen de firma en HTML — solo abre
// un borrador con Para/CC/Asunto/cuerpo en texto plano en el cliente de
// correo predeterminado del equipo (Outlook, si está configurado así). El
// PDF se descarga aparte (con el otro botón) y hay que adjuntarlo a mano.
const DESTINATARIO_TO = "daniacp@aliansalud.com.co";
const DESTINATARIOS_CC = ["asesoriajuridica@lexaraabogados.com", "Gerencia@lexaraabogados.com", "myd.abogados.monica@hotmail.com"];

export function abrirCorreoTutelas(fechaVencimientoISO){
  const { fechaVencimiento, fechaNotificacion } = calcularFechasInforme(fechaVencimientoISO);
  const asunto = `Notificación de Tutelas del (${fechaCorta(fechaNotificacion)}) y Vencimiento de las respuestas del (${fechaCorta(fechaVencimiento)})`;
  const cuerpo = `Buenos días,\n\n` +
    `En el documento adjunto se encuentran las tutelas asignadas el día ${fechaCorta(fechaNotificacion)}, ` +
    `así como aquellas que se encuentran en término de vencimiento para el día ${fechaCorta(fechaVencimiento)}.\n\n` +
    `(Recuerda adjuntar el PDF que acabas de descargar antes de enviar este correo.)\n\n` +
    `Saludos,`;
  const enc = encodeURIComponent;
  const url = `mailto:${DESTINATARIO_TO}?cc=${enc(DESTINATARIOS_CC.join(','))}&subject=${enc(asunto)}&body=${enc(cuerpo)}`;
  window.location.href = url;
}
