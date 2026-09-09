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
// Firma: pedido explícito del usuario 2026-09-01 ("la firma que se igual al
// de la dashboard") — se cambió de "Firma Monica Rubrica.png" (rúbrica sola,
// con nombre/CC/TP como texto aparte) a "Firma Monica Completa.png", el
// mismo bloque de cierre en una sola imagen ("Cordial saludo," + firma +
// nombre/CC/TP quemados) que ya usa el Word del Dashboard (ver
// exportarDashboardWord.js) — mismo ancho (230) y misma forma de calcular el
// alto proporcional con imagenComoDataUrl(), para que se vea igual en los
// dos documentos.
import { fechaLarga, imagenComoDataUrl } from './informesPDF';
import { crearBorradorCorreo } from './graph';
import { crearHeaderMembreteWord, MARGEN_SUPERIOR_MEMBRETE_MM, MARGEN_INFERIOR_MEMBRETE_MM } from './membreteWord';
import { generoDePrimerNombre } from './whatsappPago';
import firmaCompleta from '../assets/Firma Monica Completa.png';

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

// Extrae el nombre del Juez/Magistrado de "No. de despacho" (texto libre,
// ej. "SEC 3 M.P JOSÉ ELVER MUÑOZ BARRERA") — busca la marca "M.P"
// (Magistrado Ponente) y toma todo lo que sigue. La mayoría de los
// despachos NO traen nombre de persona (ej. "Juzgado 12 Civil del Circuito
// de Medellín") — ahí devuelve "" y el saludo se queda en el genérico de
// siempre, nunca se adivina un nombre que no está.
function nombreJuezDelDespacho(proceso){
  const texto = `${proceso.Despacho||''} ${proceso.NumeroDespacho||''}`;
  const m = texto.match(/M\.?\s*P\.?\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

// "Respetado Doctor:" / "Respetada Doctora:" según el género detectado del
// primer nombre del Juez (misma lógica de generoDePrimerNombre ya usada en
// el mensaje de WhatsApp de pagos) — pedido explícito del usuario
// 2026-09-10 ("genero la misma de whatsApp"). Sin nombre detectable en el
// despacho, se deja el genérico "Respetado(a) Doctor(a):" de siempre.
function saludoDoctor(proceso){
  const nombreJuez = nombreJuezDelDespacho(proceso);
  const primerNombre = nombreJuez.split(/\s+/)[0];
  if(!primerNombre) return 'Respetado(a) Doctor(a):';
  return generoDePrimerNombre(primerNombre) === 'f' ? 'Respetada Doctora:' : 'Respetado Doctor:';
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
    saludoDoctor: saludoDoctor(proceso),
    // Usados en el Asunto del correo — ver asuntoCorreo() más abajo.
    tipoProceso: (proceso.TipoProceso || "").trim(),
    demandante: proceso.Demandante || "—",
    demandado: proceso.Demandado || "—",
  };
}

// Bytes reales de la imagen de firma, ya recortada al ancho de destino —
// mismo helper que usa exportarDashboardWord.js (dataUrlABytes) para poder
// pasarle el resultado de imagenComoDataUrl() directo a un ImageRun de docx.
function dataUrlABytes(dataUrl){
  const base64 = dataUrl.split(',')[1];
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for(let i=0; i<binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
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
      'REF: IMPULSO PROCESAL',
      '',
      `RAD:              ${d.radicadoCompleto}`,
      `DEMANDANTE:        ${proceso.Demandante || "—"}`,
      `DEMANDADO:         ${proceso.Demandado || "—"}`,
      '',
      d.saludoDoctor,
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
  const [headerMembrete, firma] = await Promise.all([
    crearHeaderMembreteWord({ Header, ImageRun, Paragraph, HorizontalPositionAlign, HorizontalPositionRelativeFrom, VerticalPositionAlign, VerticalPositionRelativeFrom, TextWrappingType }),
    imagenComoDataUrl(firmaCompleta, 700),
  ]);
  const firmaBytes = dataUrlABytes(firma.dataUrl);
  const anchoFirma = 230; // mismo ancho que usa el Word del Dashboard

  function p(text, opts={}){
    return new Paragraph({
      alignment: opts.align,
      spacing: { after: opts.after ?? 160 },
      tabStops: opts.tabs,
      children: [ new TextRun({ text, bold: opts.bold, italics: opts.italics, size: 22 }) ],
    });
  }
  // Igual que p(), pero con VARIOS tramos de texto en la misma línea, cada
  // uno con su propia negrita/cursiva — pedido explícito del usuario
  // 2026-09-10 (muestra real editada a mano: nombre de la apoderada,
  // Cliente e "IMPULSO PROCESAL" en negrita DENTRO de una frase que sigue
  // igual de plana alrededor).
  function pRuns(segmentos, opts={}){
    return new Paragraph({
      alignment: opts.align,
      spacing: { after: opts.after ?? 160 },
      tabStops: opts.tabs,
      children: segmentos.map(s => new TextRun({ text: s.text, bold: s.bold, italics: s.italics, size: 22 })),
    });
  }
  const vacio = (after=160) => new Paragraph({ spacing:{after}, children:[] });
  // 2 tabs en vez de 1 entre cada tramo (E./S./D. y las 3 líneas de
  // RAD/DEMANDANTE/DEMANDADO) — pedido explícito del usuario 2026-09-10,
  // con paradas de tabulación intermedias para que el segundo tab de cada
  // tramo no empuje el texto fuera de la página.
  const tabsESD = [
    { type: TabStopType.LEFT, position: 2800 }, { type: TabStopType.LEFT, position: 4200 },
    { type: TabStopType.LEFT, position: 6000 }, { type: TabStopType.LEFT, position: 7800 },
  ];
  const tabsDatos = [ { type: TabStopType.LEFT, position: 1600 }, { type: TabStopType.LEFT, position: 2400 } ];

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: convertMillimetersToTwip(MARGEN_SUPERIOR_MEMBRETE_MM), bottom: convertMillimetersToTwip(MARGEN_INFERIOR_MEMBRETE_MM), left: 1100, right: 1100 } } },
      headers: { default: headerMembrete },
      children: [
        p(d.numeroCorto, { bold:true }),
        vacio(400),
        p(d.fecha),
        vacio(),
        p('Señores:', { after:0, bold:true }),
        p(d.despacho, { after:0 }),
        p(d.correoDespacho || '—'),
        vacio(),
        p('E.\t\tS.\t\tD.', { tabs: tabsESD }),
        vacio(),
        pRuns([ { text: 'REF: ' }, { text: 'IMPULSO PROCESAL', bold:true } ]),
        vacio(),
        pRuns([ { text: 'RAD:', bold:true }, { text: `\t\t${d.radicadoCompleto}` } ], { after:0, tabs: tabsDatos }),
        pRuns([ { text: 'DEMANDANTE:', bold:true }, { text: `\t\t${proceso.Demandante || "—"}` } ], { after:0, tabs: tabsDatos }),
        pRuns([ { text: 'DEMANDADO:', bold:true }, { text: `\t\t${proceso.Demandado || "—"}` } ], { tabs: tabsDatos }),
        vacio(),
        p(d.saludoDoctor),
        vacio(),
        pRuns([
          { text: APODERADA_NOMBRE, bold:true },
          { text: ', identificada como aparece al pie de mi correspondiente firma, en mi calidad de apoderada judicial de ' },
          { text: d.cliente, bold:true },
          { text: ', me permito solicitar el ' },
          { text: 'IMPULSO PROCESAL', bold:true },
          { text: ' del presente proceso, de conformidad con los siguientes' },
        ]),
        vacio(300),
        p('ANTECEDENTES', { bold:true, align: AlignmentType.CENTER }),
        vacio(300),
        p('[Escriba aquí los antecedentes del proceso — actuaciones relevantes que justifican la solicitud]', { italics:true }),
        vacio(300),
        p('SOLICITUD', { bold:true, align: AlignmentType.CENTER }),
        vacio(300),
        p('De conformidad con los antecedentes expuestos, me permito SOLICITAR al Despacho el IMPULSO PROCESAL del presente trámite para que [complete aquí la solicitud puntual].'),
        vacio(700),
        // Bloque de cierre en una sola imagen ("Cordial saludo," + firma +
        // nombre/CC/TP ya quemados) — igual que el Word del Dashboard, sin
        // texto aparte porque ya viene incluido en la imagen.
        new Paragraph({ spacing:{before:360, after:200}, children: [] }),
        new Paragraph({ children: [ new ImageRun({ type:'png', data: firmaBytes, transformation: { width: anchoFirma, height: Math.round(anchoFirma * firma.alto/firma.ancho) } }) ] }),
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

// Formato de Asunto pedido explícito del usuario 2026-09-01: "PROCESO {Tipo
// de Proceso} No. {No Completo} de {Demandante} en contra de {Demandado} -
// Solicitud de citatorio." — si el proceso no tiene Tipo de Proceso
// guardado, se omite esa palabra en vez de dejar un hueco en blanco.
function asuntoCorreo(d){
  const tipo = d.tipoProceso ? `${d.tipoProceso} ` : '';
  return `PROCESO ${tipo}No. ${d.radicadoCompleto} de ${d.demandante} en contra de ${d.demandado} - Solicitud de citatorio.`;
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
