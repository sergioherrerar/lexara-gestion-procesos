// Informe diario de Tutelas (PDF + Correo) — modelado sobre el reporte y la
// macro de Access "Correo_2_Click" que el usuario compartió 2026-08-17, y
// sobre un correo .msg real generado por esa macro (revisado 2026-08-18
// para replicar el texto/tablas reales del cuerpo). A diferencia del resto
// de Informes (por Entidad), este junta TODAS las Tutelas sin filtrar por
// Entidad, igual que la consulta original de Access.
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

// "jueves 13 de agosto de 2026" — mismo formato del párrafo de saludo del
// correo real de Access (sin hora, con "de" antes del mes).
function fechaLargaSinHora(iso){
  const [y,m,d] = iso.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  return `${DIAS[dt.getDay()]} ${dt.getDate()} de ${MESES[dt.getMonth()]} de ${dt.getFullYear()}`;
}

function hoyISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// El usuario elige UNA sola fecha — la de Notificación (cualquier día, la
// que sea) — y la de Vencimiento siempre es la fecha real de HOY, al
// momento exacto de darle clic al botón de PDF o Correo (igual criterio que
// la macro de Access original: TXtDiaNoti para Notificación, Date() del
// sistema para Vencimiento). Corregido 2026-08-18 — antes era al revés.
export function calcularFechasInforme(fechaNotificacionISO){
  return {
    fechaNotificacion: fechaNotificacionISO,
    fechaVencimiento: hoyISO(),
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

export async function generarInformeTutelasPDF(tutelas, fechaNotificacionISO){
  const { fechaVencimiento, fechaNotificacion } = calcularFechasInforme(fechaNotificacionISO);
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
  doc.save(`Tutelas Notificadas y con vencimiento ${fechaNotificacion}.pdf`);
}

// --- Correo ---
// Destinatarios/asunto/texto igual a un correo .msg real generado por la
// macro de Access que el usuario compartió 2026-08-18. IMPORTANTE: un
// enlace mailto: (a diferencia de la automatización COM de Outlook que usaba
// la macro) NO puede adjuntar archivos ni mandar el cuerpo en HTML con
// tablas de colores e imagen de firma — solo abre un borrador con
// Para/CC/Asunto/cuerpo en TEXTO PLANO en el cliente de correo
// predeterminado del equipo (Outlook, si está configurado así). El PDF se
// descarga aparte (con el otro botón) y hay que adjuntarlo a mano.
const DESTINATARIO_TO = "daniacp@aliansalud.com.co";
const DESTINATARIOS_CC = ["asesoriajuridica@lexaraabogados.com", "Gerencia@lexaraabogados.com", "myd.abogados.monica@hotmail.com"];

// Un mailto: muy largo puede fallar o cortarse en algunos clientes/SO — se
// limita cuántas filas se listan en el cuerpo (el PDF adjunto siempre trae
// el listado completo, sin límite).
const TOPE_FILAS_CORREO = 25;
function listadoTexto(filas){
  const mostrar = filas.slice(0, TOPE_FILAS_CORREO);
  let texto = mostrar.map((t,i) => `${i+1}. ${t.NoTutela||"—"} — ${t.Cliente||"—"} — ${t.TipoRespuesta||"—"}`).join('\n');
  if(!filas.length) texto = '(sin registros)';
  else if(filas.length > TOPE_FILAS_CORREO) texto += `\n… y ${filas.length - TOPE_FILAS_CORREO} más — ver el PDF adjunto para el listado completo.`;
  return texto;
}

// Las dos tablas del correo real de Access no tienen columna de fecha (van
// numeradas con "Ítem" y llevan No Tutela/Cliente/Tipo Respuesta) — orden
// real: primero Vencimiento (hoy), después Notificación.
export function abrirCorreoTutelas(tutelas, fechaNotificacionISO){
  const { fechaVencimiento, fechaNotificacion } = calcularFechasInforme(fechaNotificacionISO);
  const notificadas = filasPorFecha(tutelas, 'FechaNotificacion', fechaNotificacion);
  const vencimiento = filasPorFecha(tutelas, 'FechaVencimiento', fechaVencimiento);

  const asunto = `Notificación de Tutelas del (${fechaCorta(fechaNotificacion)}) y Vencimiento de las respuestas del (${fechaCorta(fechaVencimiento)})`;
  const cuerpo = [
    'Buenos días,',
    '',
    `En el documento adjunto se encuentran las tutelas asignadas el día ${fechaLargaSinHora(fechaNotificacion)}, así como aquellas que se encuentran en término de vencimiento para el día de hoy, ${fechaLargaSinHora(fechaVencimiento)}.`,
    '',
    'Contestaciones con Vencimiento el día de hoy',
    listadoTexto(vencimiento),
    `Total de registros: ${vencimiento.length}`,
    '',
    'Tutelas Asignadas el Día Anterior',
    listadoTexto(notificadas),
    `Total de registros: ${notificadas.length}`,
    '',
    '(Recuerda adjuntar el PDF que acabas de descargar antes de enviar este correo.)',
    '',
    'Saludos,',
  ].join('\n');

  const enc = encodeURIComponent;
  const url = `mailto:${DESTINATARIO_TO}?cc=${enc(DESTINATARIOS_CC.join(','))}&subject=${enc(asunto)}&body=${enc(cuerpo)}`;
  window.location.href = url;
}
