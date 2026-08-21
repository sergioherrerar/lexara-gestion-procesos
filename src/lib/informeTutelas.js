// Informe diario de Tutelas (PDF + Correo) — modelado sobre el reporte y la
// macro de Access "Correo_2_Click" que el usuario compartió 2026-08-17, y
// sobre un correo .msg real generado por esa macro (revisado 2026-08-18
// para replicar el texto/tablas reales del cuerpo). A diferencia del resto
// de Informes (por Entidad), este junta TODAS las Tutelas sin filtrar por
// Entidad, igual que la consulta original de Access.
// Ver [[project_tutelas_modulo]].
import { prepararDocumentoPDF, fechaCorta, VERDE_OSCURO, GRIS_ZEBRA, BORDE_SUAVE, TEXTO, MARGEN, CONTENIDO_Y_INICIAL, CONTENIDO_Y_MAXIMO } from './informesPDF';
import { stripHtml, parseMonto } from './graph';

const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

// Verde claro pedido explícito por el usuario 2026-08-19 para resaltar la
// fila de "Total de registros" en las tablas de Tutelas — PANTONE 7472C,
// #52bbb5. Solo se usa acá (no es el VERDE_CLARO institucional, más pálido,
// que usan las cajas de resumen del resto de Informes).
const VERDE_CLARO_TUTELAS = [82, 187, 181];

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
    .filter(t => String(t[campoFecha]||"").slice(0,10) === fechaISO)
    // "No Tutela" es una columna numérica en SharePoint (llega como number,
    // no string) — .localeCompare no existe en números y tumbaba el botón
    // entero sin avisar (2026-08-19). Se envuelve en String() antes de comparar.
    .sort((a,b) => String(a.NoTutela||"").localeCompare(String(b.NoTutela||"")));
}

// Dibuja una barra de título verde + una tabla debajo — rediseñada
// 2026-08-19 para calcar exactamente la tabla del correo/reporte real de
// Access que el usuario volvió a mostrar como referencia: columna "Ítem"
// numerada (sin columna de fecha, que el original tampoco tiene), y una fila
// de cierre "Total de registros: N" con el mismo color del encabezado (antes
// no existía ese cierre y la tabla sí traía una columna de fecha de más).
// Devuelve la posición Y donde sigue el contenido siguiente.
function dibujarSeccion(doc, autoTable, titulo, filas, y, pageWidth, dibujarEncabezadoYPie){
  doc.setFillColor(...VERDE_OSCURO);
  doc.rect(MARGEN, y, pageWidth - MARGEN*2, 7, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(255);
  doc.text(titulo, MARGEN + 2, y + 5);
  const filasNumeradas = filas.map((f, i) => [i+1, ...f]);
  autoTable(doc, {
    startY: y + 7,
    margin: { left: MARGEN, right: MARGEN, top: CONTENIDO_Y_INICIAL, bottom: 297 - CONTENIDO_Y_MAXIMO },
    head: [['Ítem','No Tutela','Cliente','Tipo Respuesta']],
    body: filasNumeradas,
    foot: [[{ content: `Total de registros: ${filas.length}`, colSpan: 4, styles:{halign:'right', fontStyle:'bold', fillColor:VERDE_CLARO_TUTELAS, textColor:VERDE_OSCURO, fontSize:8.5} }]],
    // Solo en la última página de ESTA tabla — sin esto, cuando "Tutelas con
    // Vencimiento" empieza en una página y sigue en la siguiente, el total
    // aparecía de golpe justo debajo de la primera fila (antes de tiempo).
    showFoot: 'lastPage',
    styles: { font:'helvetica', fontSize:8.5, cellPadding:2.4, valign:'top', lineColor:BORDE_SUAVE, lineWidth:0.15, textColor:TEXTO },
    headStyles: { fillColor:VERDE_OSCURO, textColor:255, fontStyle:'bold', halign:'center', fontSize:8.5 },
    // "Ítem" y "No Tutela" son valores numéricos — alineados a la derecha
    // (regla general del proyecto: todo lo que sea un valor/número va
    // alineado a la derecha, no centrado ni a la izquierda).
    columnStyles: {
      0: { halign:'right', cellWidth:14 },
      1: { halign:'right', cellWidth:24 },
    },
    alternateRowStyles: { fillColor:GRIS_ZEBRA },
    // willDrawPage, NO didDrawPage — ver la explicación completa en
    // dibujarEncabezadoYPie (informesPDF.js): didDrawPage dispara DESPUÉS
    // de imprimir las filas de esa página (así lo llama la propia
    // librería por dentro: "callEndPageHooks"), incluida una llamada final
    // sobre la ÚLTIMA página justo después de imprimir su total — eso era
    // lo que tapaba "Tutelas con Vencimiento" en la página 2 cuando esa
    // tabla seguía en una segunda hoja.
    willDrawPage: dibujarEncabezadoYPie,
  });
  return doc.lastAutoTable.finalY + 10;
}

export async function generarInformeTutelasPDF(tutelas, fechaNotificacionISO){
  const { fechaVencimiento, fechaNotificacion } = calcularFechasInforme(fechaNotificacionISO);
  const { doc, autoTable, pageWidth, dibujarEncabezadoYPie, numerarPaginas } = await prepararDocumentoPDF('Tutelas notificadas y vencimiento');

  dibujarEncabezadoYPie();
  let y = CONTENIDO_Y_INICIAL;
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...TEXTO);
  doc.text(fechaHoraLarga(new Date()), pageWidth - MARGEN, y, {align:'right'});
  y += 8;

  const notificadas = filasPorFecha(tutelas, 'FechaNotificacion', fechaNotificacion);
  const vencimiento = filasPorFecha(tutelas, 'FechaVencimiento', fechaVencimiento);

  y = dibujarSeccion(doc, autoTable, 'Tutelas Notificadas',
    notificadas.map(t => [t.NoTutela||"—", t.Cliente||"—", t.TipoRespuesta||"—"]),
    y, pageWidth, dibujarEncabezadoYPie);

  dibujarSeccion(doc, autoTable, 'Tutelas con Vencimiento',
    vencimiento.map(t => [t.NoTutela||"—", t.Cliente||"—", t.TipoRespuesta||"—"]),
    y, pageWidth, dibujarEncabezadoYPie);

  numerarPaginas();
  doc.save(`Tutelas Notificadas y con vencimiento ${fechaNotificacion}.pdf`);
}

// --- Correo ---
// Destinatarios/asunto/texto igual a un correo .msg real generado por la
// macro de Access que el usuario compartió 2026-08-18. Un enlace mailto: (a
// diferencia de la automatización COM de Outlook que usaba la macro) NO
// puede llevar el cuerpo en HTML ni adjuntar archivos — solo abre un
// borrador con Para/CC/Asunto/cuerpo en TEXTO PLANO. El PDF se descarga
// aparte (con el otro botón) y hay que adjuntarlo a mano.
// 2026-08-22: para que las tablas SÍ se vean con el mismo formato del PDF
// (bordes, encabezado verde, fila de Total resaltada) — algo que un mailto:
// no puede llevar en el cuerpo — se copian esas tablas ya armadas en HTML al
// portapapeles (`navigator.clipboard.write` con un `ClipboardItem` de tipo
// "text/html") justo antes de abrir el borrador; el usuario solo tiene que
// pegarlas (Ctrl+V) dentro del correo ya abierto, y Outlook (o el cliente
// que sea) las respeta como una tabla real, no como texto. Si el navegador
// no soporta copiar HTML (o el usuario le niega el permiso), cae de vuelta
// al cuerpo de solo texto que ya existía, para no perder la información.
const DESTINATARIO_TO = "daniacp@aliansalud.com.co";
const DESTINATARIOS_CC = ["asesoriajuridica@lexaraabogados.com", "Gerencia@lexaraabogados.com", "myd.abogados.monica@hotmail.com"];

// Un mailto: muy largo puede fallar o cortarse en algunos clientes/SO — se
// limita cuántas filas se listan en el cuerpo (el PDF adjunto siempre trae
// el listado completo, sin límite). Solo aplica al cuerpo de TEXTO plano
// (el de respaldo); la tabla HTML copiada al portapapeles no tiene tope.
const TOPE_FILAS_CORREO = 25;
function listadoTexto(filas){
  const mostrar = filas.slice(0, TOPE_FILAS_CORREO);
  let texto = mostrar.map((t,i) => `${i+1}. ${t.NoTutela||"—"} — ${t.Cliente||"—"} — ${t.TipoRespuesta||"—"}`).join('\n');
  if(!filas.length) texto = '(sin registros)';
  else if(filas.length > TOPE_FILAS_CORREO) texto += `\n… y ${filas.length - TOPE_FILAS_CORREO} más — ver el PDF adjunto para el listado completo.`;
  return texto;
}

function escapeHtml(v){
  return String(v==null ? "" : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Misma estructura visual que dibujarSeccion() en el PDF (barra de título
// verde oscuro + tabla con encabezado verde + fila de Total en verde claro
// Pantone 7472C) pero como HTML, para pegar en un correo.
function tablaHtml(titulo, filas){
  const filasHtml = filas.map((t,i) => `
    <tr style="background:${i % 2 ? '#f7f8f7' : '#ffffff'};">
      <td style="border:1px solid #e0e2e0;padding:4px 8px;text-align:right;">${i+1}</td>
      <td style="border:1px solid #e0e2e0;padding:4px 8px;text-align:right;">${escapeHtml(t.NoTutela||'—')}</td>
      <td style="border:1px solid #e0e2e0;padding:4px 8px;">${escapeHtml(t.Cliente||'—')}</td>
      <td style="border:1px solid #e0e2e0;padding:4px 8px;">${escapeHtml(t.TipoRespuesta||'—')}</td>
    </tr>`).join('');
  const sinRegistros = `<tr><td colspan="4" style="border:1px solid #e0e2e0;padding:6px 8px;text-align:center;color:#666666;">(sin registros)</td></tr>`;
  return `
    <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin:10px 0 16px;font-family:Calibri,Arial,sans-serif;font-size:10.5pt;color:#1c2624;">
      <tr><td colspan="4" style="background:#004941;color:#ffffff;font-weight:bold;padding:6px 8px;">${escapeHtml(titulo)}</td></tr>
      <tr style="background:#004941;color:#ffffff;font-weight:bold;">
        <td style="border:1px solid #e0e2e0;padding:4px 8px;text-align:right;">Ítem</td>
        <td style="border:1px solid #e0e2e0;padding:4px 8px;text-align:right;">No Tutela</td>
        <td style="border:1px solid #e0e2e0;padding:4px 8px;">Cliente</td>
        <td style="border:1px solid #e0e2e0;padding:4px 8px;">Tipo Respuesta</td>
      </tr>
      ${filasHtml || sinRegistros}
      <tr>
        <td colspan="4" style="background:#52bbb5;color:#004941;font-weight:bold;text-align:right;padding:5px 8px;">Total de registros: ${filas.length}</td>
      </tr>
    </table>`;
}

// Copia el HTML (tipo "text/html") y un texto plano de respaldo (tipo
// "text/plain") al portapapeles a la vez — así, si el cliente donde se pega
// no soporta HTML, cae solo al texto. Devuelve true si se alcanzó a copiar
// el HTML (para saber si conviene simplificar el cuerpo del mailto), false
// si solo se pudo copiar texto plano o nada.
// NUNCA lanza — esto es un extra (la tabla bonita para pegar), no la acción
// principal (abrir el borrador del correo). Si algo falla, cualquier cosa
// (permiso denegado, navegador sin soporte, documento sin foco, etc.) tiene
// que degradar en silencio a "no se copió nada" y dejar que el correo se
// abra igual con el cuerpo de texto de respaldo — nunca bloquear eso.
async function copiarTablaAlPortapapeles(html, texto){
  try{
    if(navigator.clipboard && window.ClipboardItem){
      const item = new ClipboardItem({
        'text/html': new Blob([html], {type:'text/html'}),
        'text/plain': new Blob([texto], {type:'text/plain'}),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  }catch(err){ console.error('No se pudo copiar la tabla en HTML, se intenta solo texto:', err); }
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(texto);
    }
  }catch(err){ console.error('No se pudo copiar ni siquiera el texto plano:', err); }
  return false;
}

// Las dos tablas del correo real de Access no tienen columna de fecha (van
// numeradas con "Ítem" y llevan No Tutela/Cliente/Tipo Respuesta) — orden
// real: primero Vencimiento (hoy), después Notificación.
// Devuelve true si logró copiar las tablas en HTML al portapapeles (para
// que quien llama pueda avisarle al usuario que las pegue con Ctrl+V).
export async function abrirCorreoTutelas(tutelas, fechaNotificacionISO){
  const { fechaVencimiento, fechaNotificacion } = calcularFechasInforme(fechaNotificacionISO);
  const notificadas = filasPorFecha(tutelas, 'FechaNotificacion', fechaNotificacion);
  const vencimiento = filasPorFecha(tutelas, 'FechaVencimiento', fechaVencimiento);

  const asunto = `Notificación de Tutelas del (${fechaCorta(fechaNotificacion)}) y Vencimiento de las respuestas del (${fechaCorta(fechaVencimiento)})`;
  const introTexto = `Buenos días,\n\nEn el documento adjunto se encuentran las tutelas asignadas el día ${fechaLargaSinHora(fechaNotificacion)}, así como aquellas que se encuentran en término de vencimiento para el día de hoy, ${fechaLargaSinHora(fechaVencimiento)}.`;
  const cuerpoConListado = [
    introTexto, '',
    'Contestaciones con Vencimiento el día de hoy',
    listadoTexto(vencimiento),
    `Total de registros: ${vencimiento.length}`,
    '',
    'Tutelas Asignadas el Día Anterior',
    listadoTexto(notificadas),
    `Total de registros: ${notificadas.length}`,
    '',
    'Saludos,',
  ].join('\n');

  const htmlTablas = tablaHtml('Contestaciones con Vencimiento el día de hoy', vencimiento) + tablaHtml('Tutelas Asignadas el Día Anterior', notificadas);
  const copiadoHtml = await copiarTablaAlPortapapeles(htmlTablas, cuerpoConListado);

  // Si sí se copió el HTML, el cuerpo del mailto se deja simple (sin el
  // listado en texto) con un aviso de dónde pegar — evita duplicar la misma
  // información dos veces dentro del correo.
  const cuerpo = copiadoHtml
    ? `${introTexto}\n\n[Pega aquí las tablas: Ctrl+V]\n\nSaludos,`
    : cuerpoConListado;

  const enc = encodeURIComponent;
  const url = `mailto:${DESTINATARIO_TO}?cc=${enc(DESTINATARIOS_CC.join(','))}&subject=${enc(asunto)}&body=${enc(cuerpo)}`;
  window.location.href = url;
  return copiadoHtml;
}

// --- Excel ---
// Mismo formato institucional que el resto de Informes (encabezado verde
// #004941, Aptos Narrow blanco negrita, fila congelada) — columnas
// confirmadas por el usuario 2026-08-19 con un Excel real ("Total
// Tutelas.xlsx"): junta TODAS las tutelas (no filtra por fecha, a
// diferencia del PDF/Correo). "Valor Entidad"/"Valor Abogado" no son
// campos propios de la Tutela — se buscan en Valores Entidad por la
// Entidad de cada tutela.
const COLOR_ENCABEZADO_XLSX = "FF004941";

function fechaISOaExcel(iso){
  if(!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if(!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}
function estilizarEncabezadoXlsx(row){
  row.height = 30;
  row.eachCell(cell => {
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb: COLOR_ENCABEZADO_XLSX} };
    cell.font = { name:'Aptos Narrow', size:11, bold:true, color:{argb:'FFFFFFFF'} };
    cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
  });
}
function estilizarFilaXlsx(row){
  row.eachCell(cell => { cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true }; });
}

export async function generarInformeTutelasExcel(tutelas, valoresEntidad){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Tutelas");

  const columnas = ["Id","No Tutela","Cliente","Ciudad","Prestación","Usuario","No Identificación",
    "fecha Notificación","Vencimiento","Tema","Solicita","Tipo Respuesta","Valor Entidad","Valor Abogado","Abogado Tutela"];
  const anchos = [8, 12, 34, 16, 16, 26, 16, 16, 16, 26, 40, 16, 14, 14, 22];
  ws.columns = columnas.map((c,i) => ({ width: anchos[i] }));
  estilizarEncabezadoXlsx(ws.addRow(columnas));

  tutelas.forEach(t => {
    const valorEnt = (valoresEntidad||[]).find(v => v.Entidad === t.Entidad) || null;
    const row = ws.addRow([
      t.id, t.NoTutela||"", t.Cliente||"", t.Ciudad||"", t.Prestacion||"", t.Usuario||"", t.NoIdentificacion||"",
      fechaISOaExcel(t.FechaNotificacion), fechaISOaExcel(t.FechaVencimiento), t.Tema||"", stripHtml(t.Solicita)||"",
      t.TipoRespuesta||"", valorEnt ? parseMonto(valorEnt.ValorEntidad) : "", valorEnt ? parseMonto(valorEnt.ValorAbogado) : "",
      t.AbogadoRespuesta||"",
    ]);
    estilizarFilaXlsx(row);
  });

  ["Valor Entidad","Valor Abogado"].forEach(header => {
    ws.getColumn(columnas.indexOf(header)+1).numFmt = '"$"#,##0.00';
  });
  ["fecha Notificación","Vencimiento"].forEach(header => {
    ws.getColumn(columnas.indexOf(header)+1).numFmt = 'dd/mm/yyyy';
  });

  ws.views = [{ state:'frozen', ySplit:1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const hoy = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `Total Tutelas ${hoy}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
