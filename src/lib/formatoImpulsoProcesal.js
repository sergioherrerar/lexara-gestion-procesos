// Primer "formato procesal" (memorial) generado por proceso — modelo real
// entregado por el usuario 2026-08-25 ("28-07-26 Impulso Procesal No.
// 2015-00427.docx"): una solicitud de IMPULSO PROCESAL dirigida al
// Juzgado/Despacho de un proceso, con los datos de identificación tomados
// directo de la lista Procesos judiciales — nada se vuelve a digitar.
// El usuario avisó que van a llegar MÁS modelos ("te voy a pasar el modelo
// del resto") — este archivo queda pensado para que cada modelo nuevo sea
// su propia función que reutiliza datosEncabezado() y la firma, en vez de
// generalizar de más antes de conocer los otros formatos.
//
// Dos salidas del mismo dato:
//   1) generarImpulsoProcesalWord(proceso) — descarga un .docx editable.
//   2) enviarBorradorImpulsoProcesalGraph(proceso) / abrirCorreoImpulsoProcesal(proceso)
//      — borrador de correo al Despacho (Correo despacho del proceso), con
//      el MISMO texto del Word como cuerpo (pedido explícito: "el cuerpo del
//      correo el formato del word solo texto organizado" — sin tablas ni
//      imagen de firma, solo texto).
//
// El cuerpo de ANTECEDENTES/SOLICITUD es narrativa propia de cada caso — no
// hay forma de adivinarla desde los datos de la lista — así que el Word y el
// correo dejan esa parte como una instrucción entre corchetes para
// completarla a mano (en Word, o directo en el borrador de Outlook).
//
// Firma: "Firma Monica Rubrica.png" es la rúbrica cortada del PROPIO Word
// que el usuario adjuntó como modelo (sin el nombre/CC/TP quemados en la
// imagen, a diferencia de "Firma Monica Completa.png" que usa el Word del
// Dashboard) — así el nombre/CC/TP quedan como texto real, editable, igual
// que en el modelo original. Datos confirmados tal cual el modelo real:
// "C.C. No. 40.039.240 de Tunja, Boyacá." y "T.P. 97.956 del Consejo
// Superior de la Judicatura.".
import { fechaLarga } from './informesPDF';
import { crearBorradorCorreo } from './graph';
import { crearHeaderMembreteWord, MARGEN_SUPERIOR_MEMBRETE_MM, MARGEN_INFERIOR_MEMBRETE_MM } from './membreteWord';
import firmaRubrica from '../assets/Firma Monica Rubrica.png';

const APODERADA_NOMBRE = "MÓNICA PAOLA QUINTERO JIMÉNEZ";
const APODERADA_CC = "C.C. No. 40.039.240 de Tunja, Boyacá.";
const APODERADA_TP = "T.P. 97.956 del Consejo Superior de la Judicatura.";

// Nombres de archivo no pueden tener estos caracteres en Windows.
function nombreArchivoSeguro(s){
  return (s||"").toString().replace(/[\/\\?%*:|"<>]/g, "-");
}

function despachoConNumero(p){
  const despacho = (p.Despacho||"").trim();
  const numero = (p.NumeroDespacho||"").trim();
  if(!despacho) return "—";
  return numero ? `${despacho} (${numero})` : despacho;
}

// Datos compartidos entre el Word y el correo — mismos campos del proceso,
// un solo lugar si el modelo cambia. El radicado completo puede venir en
// NoCompleto o en su alias RadicadoActual (misma columna real, ver
// config.js) — se toma el que haya.
function datosEncabezado(proceso){
  return {
    numeroCorto: proceso.Radicado || "—",
    fecha: `Bogotá D.C., ${fechaLarga(new Date())}`,
    despacho: despachoConNumero(proceso),
    correoDespacho: (proceso.CorreoDespacho || "").trim(),
    radicadoCompleto: proceso.NoCompleto || proceso.RadicadoActual || proceso.Radicado || "—",
    cliente: proceso.Cliente || "—",
  };
}

async function bytesDeAsset(url){
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function escapeHtml(v){
  return String(v==null ? "" : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ---------------- Texto compartido (Word y correo parten del mismo guion) ---------------- */

function lineasDocumento(proceso){
  const d = datosEncabezado(proceso);
  return {
    d,
    lineas: [
      d.numeroCorto,
      '',
      d.fecha,
      '',
      'Señores:',
      d.despacho,
      d.correoDespacho || '—',
      '',
      'E.          S.          D.',
      '',
      'REF: ',
      '',
      `RAD:              ${d.radicadoCompleto}`,
      `DEMANDANTE:        ${proceso.Demandante || "—"}`,
      `DEMANDADO:         ${proceso.Demandado || "—"}`,
      '',
      'Respetado(a) Doctor(a):',
      '',
      `${APODERADA_NOMBRE}, identificada como aparece al pie de mi correspondiente firma, en mi calidad de apoderada judicial de ${d.cliente}, me permito solicitar el IMPULSO PROCESAL del presente proceso, de conformidad con los siguientes`,
      '',
      'ANTECEDENTES',
      '',
      '[Escriba aquí los antecedentes del proceso — actuaciones relevantes que justifican la solicitud]',
      '',
      'SOLICITUD',
      '',
      'De conformidad con los antecedentes expuestos, me permito SOLICITAR al Despacho el IMPULSO PROCESAL del presente trámite para que [complete aquí la solicitud puntual].',
      '',
      'Con todo respeto,',
      '',
      APODERADA_NOMBRE,
      APODERADA_CC,
      APODERADA_TP,
    ],
  };
}

/* ---------------- 1) Word ---------------- */

export async function generarImpulsoProcesalWord(proceso){
  const [{ Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, TabStopType, Header, convertMillimetersToTwip, HorizontalPositionAlign, HorizontalPositionRelativeFrom, VerticalPositionAlign, VerticalPositionRelativeFrom, TextWrappingType }] = await Promise.all([
    import('docx'),
  ]);
  const { d } = lineasDocumento(proceso);
  // Membrete real de Lexara como encabezado — pedido explícito del usuario
  // 2026-08-26 ("de igual forma para el formato de Word que saca desde los
  // procesos judiciales"), mismo tratamiento que el Word del Dashboard (ver
  // membreteWord.js) — reemplaza el margen superior grande que traía el
  // modelo original (pensado para papel membretado ya impreso).
  const [headerMembrete, firmaBytes] = await Promise.all([
    crearHeaderMembreteWord({ Header, ImageRun, Paragraph, HorizontalPositionAlign, HorizontalPositionRelativeFrom, VerticalPositionAlign, VerticalPositionRelativeFrom, TextWrappingType }),
    bytesDeAsset(firmaRubrica),
  ]);

  function p(text, opts={}){
    return new Paragraph({
      alignment: opts.align,
      spacing: { after: opts.after ?? 160 },
      tabStops: opts.tabs,
      children: [ new TextRun({ text, bold: opts.bold, italics: opts.italics, size: 22 }) ],
    });
  }
  const vacio = (after=160) => new Paragraph({ spacing:{after}, children:[] });
  const tabsESD = [ { type: TabStopType.LEFT, position: 4200 }, { type: TabStopType.LEFT, position: 7800 } ];
  const tabsDatos = [ { type: TabStopType.LEFT, position: 1600 } ];

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: convertMillimetersToTwip(MARGEN_SUPERIOR_MEMBRETE_MM), bottom: convertMillimetersToTwip(MARGEN_INFERIOR_MEMBRETE_MM), left: 1100, right: 1100 } } },
      headers: { default: headerMembrete },
      children: [
        p(d.numeroCorto, { bold:true }),
        vacio(400),
        p(d.fecha),
        vacio(),
        p('Señores:', { after:0 }),
        p(d.despacho, { after:0 }),
        p(d.correoDespacho || '—'),
        vacio(),
        p('E.\tS.\tD.', { tabs: tabsESD }),
        vacio(),
        p('REF: '),
        vacio(),
        p(`RAD:\t${d.radicadoCompleto}`, { after:0, tabs: tabsDatos }),
        p(`DEMANDANTE:\t${proceso.Demandante || "—"}`, { after:0, tabs: tabsDatos }),
        p(`DEMANDADO:\t${proceso.Demandado || "—"}`, { tabs: tabsDatos }),
        vacio(),
        p('Respetado(a) Doctor(a):'),
        vacio(),
        p(`${APODERADA_NOMBRE}, identificada como aparece al pie de mi correspondiente firma, en mi calidad de apoderada judicial de ${d.cliente}, me permito solicitar el IMPULSO PROCESAL del presente proceso, de conformidad con los siguientes`),
        vacio(300),
        p('ANTECEDENTES', { bold:true, align: AlignmentType.CENTER }),
        vacio(300),
        p('[Escriba aquí los antecedentes del proceso — actuaciones relevantes que justifican la solicitud]', { italics:true }),
        vacio(300),
        p('SOLICITUD', { bold:true, align: AlignmentType.CENTER }),
        vacio(300),
        p('De conformidad con los antecedentes expuestos, me permito SOLICITAR al Despacho el IMPULSO PROCESAL del presente trámite para que [complete aquí la solicitud puntual].'),
        vacio(700),
        p('Con todo respeto,'),
        vacio(200),
        new Paragraph({ spacing:{after:80}, children:[ new ImageRun({ type:'png', data: firmaBytes, transformation:{ width:130, height:120 } }) ] }),
        p(APODERADA_NOMBRE, { bold:true, after:0 }),
        p(APODERADA_CC, { after:0 }),
        p(APODERADA_TP),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const hoyISO = new Date().toISOString().slice(0,10);
  // "Impulso Procesal {Numero corto} {fecha}" — pedido explícito del usuario
  // 2026-08-26, sin guion entre el nombre del formato y el número.
  const nombreArchivo = nombreArchivoSeguro(`Impulso Procesal ${d.numeroCorto} ${hoyISO}`);
  descargarWord(blob, `${nombreArchivo}.docx`);
}

function descargarWord(blob, nombreArchivo){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------- 2) Correo ---------------- */

function asuntoCorreo(d){
  return `Impulso procesal — Rad. ${d.radicadoCompleto}`;
}

// Crea el borrador DIRECTO en Outlook por Microsoft Graph — mismo mecanismo
// que el correo de Tutelas (ver enviarBorradorTutelasGraph en
// informeTutelas.js y crearBorradorCorreo en graph.js). Sin adjunto: el
// cuerpo ya trae todo el texto, y el usuario pidió explícitamente que el
// correo NO lleve tablas ni imagen, solo texto organizado.
export async function enviarBorradorImpulsoProcesalGraph(proceso){
  const { d, lineas } = lineasDocumento(proceso);
  if(!d.correoDespacho) throw new Error('Este proceso no tiene un "Correo despacho" guardado — agrégalo en la pestaña "Detalles del despacho" del proceso antes de generar el correo.');
  const htmlBody = `<html><body style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#1c2624;">${lineas.map(l => l ? `<p style="margin:0 0 8px;">${escapeHtml(l)}</p>` : `<p style="margin:0 0 8px;">&nbsp;</p>`).join('')}</body></html>`;
  return crearBorradorCorreo({ to: d.correoDespacho, subject: asuntoCorreo(d), htmlBody });
}

// Respaldo sin permiso de Graph — abre el cliente de correo local con
// destinatario/asunto/cuerpo ya listos (texto plano, sin formato).
export function abrirCorreoImpulsoProcesal(proceso){
  const { d, lineas } = lineasDocumento(proceso);
  if(!d.correoDespacho) throw new Error('Este proceso no tiene un "Correo despacho" guardado — agrégalo en la pestaña "Detalles del despacho" del proceso antes de generar el correo.');
  const enc = encodeURIComponent;
  window.location.href = `mailto:${d.correoDespacho}?subject=${enc(asuntoCorreo(d))}&body=${enc(lineas.join('\n'))}`;
}
