// Generación de propuestas de servicios (2026-11-25, Administración → «Propuesta de servicios», pedido del usuario): carta de propuesta de prestación de servicios profesionales con el modelo de la
// última propuesta enviada (Propuesta ALIANSALUD 2026-00062): presentación, portafolio de servicios, honorarios por etapas (las mismas del portal, en número de salarios mínimos), condiciones
// contractuales, clientes, equipo de trabajo (perfiles como en la página web) y firma de la representante legal. No requiere datos de un proceso: el cliente, el proceso, las partes y los textos
// se escriben o se eligen en el formulario. Usa el membrete, la firma y la numeración del resto de PDF del portal (informesPDF.js).
import { prepararDocumentoPDF, imagenComoDataUrl, MARGEN, TEXTO, VERDE_OSCURO } from './informesPDF';
import { ETAPA_CONTRATO_OPTIONS } from './graph';
import firmaCompleta from '../assets/Firma Monica Completa.png';

// ---------- números en letras (salarios mínimos) ----------
const UNIDADES = ['CERO', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
function enteroEnLetras(n){
  if(n < 30) return UNIDADES[n];
  const d = Math.floor(n / 10), u = n % 10;
  return DECENAS[d] + (u ? ' Y ' + UNIDADES[u] : '');
}
/** «3» → «TRES (3)», «1,5» → «UNO Y MEDIO (1,5)», «0,5» → «MEDIO (0,5)». Solo hasta 99; fracciones distintas de medio se dejan en cifras. */
export function salariosEnLetras(valor){
  const n = Number(String(valor).replace(',', '.'));
  if(!isFinite(n) || n <= 0) return '';
  const entero = Math.floor(n + 1e-9), fraccion = Math.round((n - entero) * 100) / 100;
  const cifra = String(n).replace('.', ',');
  if(entero > 99) return cifra;
  if(fraccion === 0) return `${enteroEnLetras(entero)} (${cifra})`;
  if(fraccion === 0.5) return `${entero ? (entero === 1 ? 'UNO' : enteroEnLetras(entero)) + ' Y ' : ''}MEDIO (${cifra})`;
  return cifra;
}
export function textoSalarios(valor, ordenTotal = false){
  const n = Number(String(valor).replace(',', '.'));
  const letras = salariosEnLetras(valor);
  if(!letras) return '';
  const singular = n === 1;
  if(ordenTotal) return `${letras} ${singular ? 'SALARIO MÍNIMO MENSUAL LEGAL VIGENTE' : 'SALARIOS MÍNIMOS MENSUALES LEGALES VIGENTES'}`;
  return `${letras} ${singular ? 'SALARIO MÍNIMO LEGAL MENSUAL VIGENTE' : 'SALARIOS MÍNIMOS LEGALES MENSUALES VIGENTES'}`;
}

// ---------- etapas de honorarios: las mismas del portal (orden de compra y factura) ----------
// Se ofrecen las etapas «por salarios» (sin las de porcentaje) y cada una trae su frase para la carta («con la entrega del poder»); la frase se puede cambiar en el formulario.
export const FRASE_ETAPA = {
  'Entrega Poder': 'con la entrega del poder',
  'Entrega poder Demanda': 'con la entrega del poder para presentar la demanda',
  'Sentencia 1ra': 'con la sentencia de primera o única instancia',
  'Sentencia 2da': 'con la sentencia de segunda instancia',
  'Contestacion': 'con la presentación de la contestación de la demanda',
  'Admision': 'con la admisión de la demanda',
  'Radicacion Demanda': 'con la radicación de la demanda',
  'Radicacion Conciliacion': 'con la radicación de la solicitud de conciliación',
  'Audiencia de Conciliacion': 'con la audiencia de conciliación',
  'Reforma': 'con la reforma de la demanda',
  'Auto de Pruebas': 'con el auto de decreto de pruebas',
  'Escrito de Oposicion': 'con el escrito de oposición',
  'Pro Frente a las exepciones': 'con el pronunciamiento frente a las excepciones',
  'Aud artículo 72': 'con la audiencia del artículo 72 del Código Procesal del Trabajo y de la Seguridad Social',
  'Aud Artículo 77 del CPL y  SS': 'con la audiencia del artículo 77 del Código Procesal del Trabajo y de la Seguridad Social',
  'Acta de audiencia': 'con el acta de la audiencia',
  'Recurso de Reposicion': 'con la interposición del recurso de reposición',
  'Administracion Proceso': 'por la administración del proceso',
  'Asesoria': 'por la asesoría',
  'Asesorias': 'por las asesorías',
  'Honorarios': 'por concepto de honorarios',
  'Cuota Litis': 'a título de cuota litis',
  'Tutelas': 'por cada acción de tutela atendida',
};
export const ETAPAS_POR_SALARIOS = ETAPA_CONTRATO_OPTIONS.filter(e => !/^%/.test(e));
const TILDES = { administracion: 'Administración', admision: 'Admisión', asesoria: 'Asesoría', asesorias: 'Asesorías', conciliacion: 'Conciliación', contestacion: 'Contestación', oposicion: 'Oposición', radicacion: 'Radicación', reposicion: 'Reposición', articulo: 'Artículo', exepciones: 'excepciones' };
export function etiquetaEtapa(e){
  const t = String(e || '').replace(/\s+/g, ' ').trim().replace(/\b[A-Za-zÁÉÍÓÚáéíóúñÑ]+\b/g, w => TILDES[w.toLowerCase()] || w);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

// ---------- textos del modelo ----------
const ES_GRUPO_COLMEDICA = /aliansalud|colm[eé]dica|umd|unidad m[eé]dica/i;
export function textoPresentacion({ entidad, rolFrase, vinculada }){
  const ent = String(entidad || '').trim() || 'su entidad';
  const agradecimiento = ES_GRUPO_COLMEDICA.test(entidad || '')
    ? 'Agradecemos la confianza que el Grupo Colmédica ha depositado en nosotros para la representación de sus empresas en diferentes procesos judiciales.'
    : 'Agradecemos la oportunidad de presentarles esta propuesta de servicios profesionales.';
  return [
    `LEXARA ABOGADOS es una marca de la firma MD ABOGADOS SAS, especializada en el campo de las relaciones laborales y de la seguridad social. ${agradecimiento}`,
    'Es importante destacar que contamos con una organización interna especializada en relaciones laborales, empresariales y de seguridad social, enfocada en articular los elementos legales, económicos y administrativos para resguardar los intereses de nuestros clientes.',
    `De manera cordial, queremos manifestar nuestro interés en representar a ${ent} como ${rolFrase}${vinculada ? ', en caso de ser vinculada al proceso mencionado' : ', en el proceso mencionado'}.`,
  ].join('\n\n');
}
export function textoAsunto({ entidad, rol, vinculada, tipoProceso, numeroProceso, demandante, demandado, despacho }){
  const ent = String(entidad || '').trim().toUpperCase();
  let a = 'PROPUESTA DE PRESTACIÓN DE SERVICIOS PROFESIONALES PARA LA REPRESENTACIÓN JUDICIAL' + (ent ? ' DE ' + ent : '');
  const hayProceso = tipoProceso || numeroProceso || demandante || despacho;
  if(hayProceso){
    a += vinculada ? ' COMO PARTE VINCULADA AL PROCESO' : (rol ? ` COMO ${String(rol).toUpperCase()} EN EL PROCESO` : ' EN EL PROCESO');
    if(tipoProceso) a += ' ' + String(tipoProceso).toUpperCase();
    if(numeroProceso) a += ' No. ' + String(numeroProceso).trim().toUpperCase();
    if(demandante) a += ', PROMOVIDO POR ' + String(demandante).trim().toUpperCase();
    if(demandado) a += (demandante ? ' CONTRA ' : ', CONTRA ') + String(demandado).trim().toUpperCase();
    if(despacho) a += ', DE CONOCIMIENTO DEL ' + String(despacho).trim().toUpperCase();
  }
  return a;
}
export function serviciosPorDefecto(corta){
  const c = String(corta || '').trim() || 'la entidad';
  return [{
    titulo: `CONTESTACIÓN DE LA DEMANDA EN CUESTIÓN Y REPRESENTACIÓN JUDICIAL DE ${c.toUpperCase()}`,
    texto: `Proponemos la contestación de la demanda en términos. Para su diseño, es importante presentar los argumentos del caso con el objetivo de obtener una conciliación o sentencia favorable a los intereses de ${c}. Para lograr esto, es indispensable contar con la información interna de la empresa y las pruebas necesarias.\n\nAsimismo, ofrecemos la representación judicial de la compañía en las audiencias, diligencias y reuniones que se requieran.`,
  }];
}
export function conceptoPorDefecto(corta){ return `el diseño de la contestación de la demanda y la representación judicial de ${String(corta || '').trim() || 'la entidad'}`; }
export const CONDICIONES_POR_DEFECTO = [
  'Los anteriores honorarios no incluyen el valor del impuesto IVA, el cual corresponde asumir a la entidad contratante.',
  'El pago de los honorarios se realizará dentro de los quince (15) días calendario siguientes a la radicación de la factura electrónica por parte de MD ABOGADOS SAS.',
  'Es importante señalar que el valor de los honorarios propuestos cubre la representación judicial hasta dos instancias del proceso laboral, no incluye los honorarios de una eventual demanda de casación, ni el escrito de oposición, en caso de que la contraparte u otro demandado interponga el recurso extraordinario.',
].join('\n');
export const CLIENTES_POR_DEFECTO = [
  'ALIANSALUD EPS S.A.', 'COLMÉDICA MEDICINA PREPAGADA', 'UNIDAD MÉDICA DE DIAGNÓSTICO', 'SERVICIOS OCCIDENTALES DE SALUD S.O.S. EPS.', 'FIDUCIARIA DAVI BANK S.A.', 'EPS FAMISANAR SAS',
  'CAJA DE AUXILIOS Y PRESTACIONES DE ACDAC – CAXDAC',
].join('\n');
export const CIERRE_POR_DEFECTO = 'Para nosotros, es de gran interés ampliar nuestra relación profesional, atendiendo estos asuntos y cualquier otro servicio jurídico que su empresa requiera.\n\nQuedamos atentos a sus comentarios con respecto a la propuesta planteada.';

// Equipo de trabajo: el de la casa con el perfil como está en la página web (www.lexaraabogados.com, «Conoce a nuestro equipo»); los externos, igual que en la última propuesta.
export const EQUIPO_LEXARA = [
  { id: 'monica', nombre: 'MÓNICA PAOLA QUINTERO JIMÉNEZ', cargo: 'Gerente', perfil: 'Abogada y especialista en Derecho Público de la Universidad Nacional de Colombia. Magíster en Elaboración de Normas Jurídicas de la Universidad de Buenos Aires, Argentina. Cuenta con más de 25 años de experiencia en derecho administrativo, laboral y de seguridad social. Contratista de la Universidad Nacional de Colombia, donde se ha desempeñado como profesional de apoyo en investigación y como docente ocasional en las especializaciones de Derecho del Trabajo e Instituciones Jurídicas de la Seguridad Social. Actualmente, es asesora, consultora y representante en procesos judiciales de varias empresas y personas naturales.' },
  { id: 'daniel', nombre: 'DANIEL SANTIAGO FLECHAS AGUILAR', cargo: 'Abogado de Procesos', perfil: 'Abogado asociado egresado de la Universidad Nacional de Colombia, Especialista en Derecho constitucional de la misma universidad, y Especialista en Derecho Laboral de la Pontificia Universidad Javeriana. Cuenta con experiencia en investigación académica y la función pública. Actualmente se desempeña en la consultoría y el litigio en Derecho Administrativo, Laboral, Seguridad Social, Derecho Civil y Acciones Constitucionales en LEXARA ABOGADOS.' },
  { id: 'ariana', nombre: 'ARIANA ANDREA MARTIN MENDOZA', cargo: 'Abogada Junior', perfil: 'Abogada de la Universidad Nacional de Colombia, especialista en Derecho Constitucional. Hace parte del equipo de trabajo de Lexara Abogados, donde se encarga de las acciones constitucionales, en particular la elaboración y contestación de acciones de tutela.' },
  { id: 'sergio', nombre: 'SERGIO ALEXANDER HERRERA RAMÍREZ', cargo: 'Analista Help Desk', perfil: 'Ingeniero en Desarrollo de Software y Técnico-Tecnólogo en Análisis y Desarrollo de Tecnología de la Información. Brinda soporte tecnológico al equipo, atendiendo y resolviendo incidentes y requerimientos para mantener la operación en continuo funcionamiento. Cuenta con experiencia en la revisión, organización y depuración de bases de datos, garantizando su integridad, y en el diseño de informes personalizados que optimizan la gestión de la información. Domina el mantenimiento preventivo y correctivo de equipos de cómputo, asegurando su óptimo rendimiento, desarrolla aplicaciones web y herramientas de automatización que agilizan los procesos internos lo cual mejora la administración de la información. Se destaca por su enfoque analítico, su orientación a la solución de problemas y su capacidad organizativa para gestionar de forma eficiente los recursos tecnológicos de la firma.' },
  { id: 'miguel', nombre: 'MIGUEL ANGEL TORRES OSPINA', cargo: 'Estudiante Pregrado Derecho', perfil: 'Estudiante de octavo semestre de Derecho de la Universidad Nacional de Colombia, con vocación por las relaciones laborales y la seguridad social. Como asistente jurídico, apoya al equipo de la firma en el seguimiento de los procesos, la proyección de contestaciones de tutelas y de solicitudes de pruebas, la revisión y organización de documentos y la atención oportuna de los requerimientos de los clientes. Cuenta con experiencia en investigación legal y redacción de documentos jurídicos, aplicada al diseño de contenidos académicos. Se destaca por su disciplina, su rigor en el manejo de la información y su compromiso con la reserva profesional, y aporta al equipo una mirada fresca y actualizada del derecho.' },
  { id: 'jhony', externo: true, nombre: 'JHONY JAVIER ÑUSTES DUCUARA', cargo: 'Asesor externo', perfil: 'Abogado y especialista en Derecho Administrativo de la Universidad Nacional de Colombia. Magíster en Derecho Médico de la Universidad Externado de Colombia. Tiene más de 10 años de experiencia como asesor y consultor en Derecho Administrativo, Civil, Ambiental, Responsabilidad Médica y Derechos Humanos.' },
  { id: 'hugo', externo: true, nombre: 'HUGO ANDRÉS ACEVEDO SERRATO', cargo: 'Asesor externo', perfil: 'Abogado de la Universidad Militar Nueva Granada, especialista en Derecho Laboral y Seguridad Social de la Universidad Sergio Arboleda, y en Derecho Administrativo de la Universidad Libre. Cuenta con más de 10 años de experiencia en el sistema de seguridad social en pensiones, con práctica en litigios ante la jurisdicción laboral y en el trámite de acciones constitucionales de tutela.' },
  { id: 'outsourcing', externo: true, nombre: 'OUTSORCING DE SERVICIOS Research & Development in Law S.A.S.', cargo: 'Dependencia judicial', perfil: 'Empresa externa contratada para prestar servicios de dependencia judicial, reporta diariamente por correo electrónico, los movimientos de los procesos judiciales y prejudiciales a nivel nacional, y remite las piezas procesales correspondientes.' },
];

// ---------- PDF ----------
const X = 26, ANCHO = 158, Y_INICIO = 62, Y_MAX = 262, LINEA = 5.1, TAM = 10.5;
function fechaLargaDeISO(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}
export function nombreArchivoPropuesta(d){
  const ent = String(d.entidad || 'Entidad').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  const num = String(d.numeroProceso || '').replace(/[\\/:*?"<>|]/g, '').trim();
  return `Propuesta ${ent}${num ? ' - ' + num : ''}.pdf`;
}

/** Arma el PDF y lo devuelve como { doc, nombre }; `datos` es el estado del formulario (ver PropuestaServiciosTab). */
export async function construirPropuestaPDF(datos){
  const d = datos;
  const { doc, dibujarEncabezadoYPie, numerarPaginas } = await prepararDocumentoPDF('Propuesta de servicios', { sinTitulo: true });
  let y = Y_INICIO;
  dibujarEncabezadoYPie();
  const nuevaPagina = () => { doc.addPage(); dibujarEncabezadoYPie(); y = Y_INICIO; };
  const asegurar = alto => { if(y + alto > Y_MAX) nuevaPagina(); };
  // Párrafo justificado (la última línea queda a la izquierda); `sangria` desplaza todo el bloque; `negrita` para títulos.
  function parrafo(texto, { negrita = false, sangria = 0, justificar = true, despues = 3.2, color = TEXTO, minimoLineas = 2 } = {}){
    doc.setFont('helvetica', negrita ? 'bold' : 'normal'); doc.setFontSize(TAM); doc.setTextColor(...color);
    const ancho = ANCHO - sangria;
    const lineas = doc.splitTextToSize(String(texto || ''), ancho);
    asegurar(Math.min(lineas.length, minimoLineas) * LINEA);
    lineas.forEach((l, i) => {
      if(y + LINEA > Y_MAX) nuevaPagina();
      doc.setFont('helvetica', negrita ? 'bold' : 'normal'); doc.setFontSize(TAM); doc.setTextColor(...color);
      const ultima = i === lineas.length - 1;
      if(justificar && !ultima && l.trim().includes(' ')) doc.text(l, X + sangria, y, { align: 'justify', maxWidth: ancho });
      else doc.text(l, X + sangria, y);
      y += LINEA;
    });
    y += despues;
  }
  // Viñeta con guion y sangría francesa; `lider` en negrita antes del texto normal (no mezcla: va en su propia línea si hace falta).
  function vineta(texto, { negrita = false } = {}){
    const lineas = doc.splitTextToSize(String(texto || ''), ANCHO - 10);
    asegurar(negrita ? lineas.length * LINEA + LINEA * 3 : Math.min(lineas.length, 2) * LINEA);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(TAM); doc.setTextColor(...TEXTO);
    doc.text('-', X + 4, y);
    lineas.forEach((l, i) => {
      if(y + LINEA > Y_MAX) nuevaPagina();
      doc.setFont('helvetica', negrita ? 'bold' : 'normal'); doc.setFontSize(TAM); doc.setTextColor(...TEXTO);
      const ultima = i === lineas.length - 1;
      if(!negrita && !ultima && l.trim().includes(' ')) doc.text(l, X + 10, y, { align: 'justify', maxWidth: ANCHO - 10 });
      else doc.text(l, X + 10, y);
      y += LINEA;
    });
    y += 2.4;
  }
  const lineasDe = t => String(t || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  const titulo = t => { asegurar(LINEA * 4); parrafo(t, { negrita: true, justificar: false, despues: 2.4, minimoLineas: 3 }); };

  // --- Fecha y destinatario ---
  parrafo(`Bogotá D.C., ${fechaLargaDeISO(d.fecha)}`, { justificar: false, despues: 7 });
  parrafo('Señores', { negrita: true, justificar: false, despues: 0 });
  parrafo(String(d.entidad || '').toUpperCase(), { negrita: true, justificar: false, despues: 0 });
  if(d.atteNombre) parrafo('Atte. ' + d.atteNombre, { negrita: true, justificar: false, despues: 0 });
  if(d.atteCargo) parrafo(d.atteCargo, { negrita: true, justificar: false, despues: 0 });
  parrafo('E.        S.        D.', { negrita: true, justificar: false, despues: 5 });
  parrafo('ASUNTO: ' + String(d.asunto || '').replace(/^ASUNTO:\s*/i, ''), { negrita: true, despues: 4.5 });
  parrafo(d.saludo || 'Respetados señores:', { justificar: false, despues: 3 });
  lineasDe(d.presentacion).forEach(p => parrafo(p));

  // --- Portafolio ---
  const servicios = (d.servicios || []).filter(s => (s.titulo || s.texto));
  if(servicios.length){
    titulo('PORTAFOLIO DE SERVICIOS');
    servicios.forEach(s => {
      if(s.titulo) vineta(String(s.titulo).toUpperCase(), { negrita: true });
      lineasDe(s.texto).forEach(p => parrafo(p));
    });
  }

  // --- Honorarios ---
  const filas = (d.honorarios || []).filter(f => Number(String(f.salarios).replace(',', '.')) > 0);
  if(filas.length){
    const total = filas.reduce((s, f) => s + Number(String(f.salarios).replace(',', '.')), 0);
    vineta('HONORARIOS', { negrita: true });
    parrafo(`Para la cancelación de nuestros honorarios profesionales, presentamos a ${d.entidadCorta || 'la entidad'} la siguiente propuesta económica:`);
    parrafo(`${d.concepto ? 'Por ' + String(d.concepto).replace(/^por\s+/i, '') + ', s' : 'S'}e pagará como honorarios la suma de ${textoSalarios(total, true)}, los cuales se causarán así:`);
    filas.forEach(f => {
      const frase = String(f.frase || '').trim();
      vineta(`${textoSalarios(f.salarios)}${frase ? ', ' + frase : ''}.`);
    });
    if(d.cambioCompetencia && Number(String(d.cambioCompetenciaSalarios).replace(',', '.')) > 0){
      parrafo(`En el eventual caso de que el proceso cambie de competencia o de jurisdicción, se causará ${textoSalarios(d.cambioCompetenciaSalarios, true)}, adicional, el cual se cobrará al ser admitida la demanda en el nuevo despacho judicial.`);
    }
  }
  const condiciones = lineasDe(d.condiciones);
  if(condiciones.length){ titulo('CONDICIONES CONTRACTUALES'); condiciones.forEach(c => vineta(c)); }

  // --- Clientes ---
  const clientes = lineasDe(d.clientes);
  if(clientes.length){ titulo('NUESTROS CLIENTES'); clientes.forEach(c => vineta(c)); y += 2; }

  // --- Equipo de trabajo ---
  const equipo = EQUIPO_LEXARA.filter(m => (d.equipo || {})[m.id]);
  if(equipo.length){
    titulo('NUESTRO EQUIPO DE TRABAJO');
    equipo.forEach(m => {
      vineta(`${m.nombre} – ${m.cargo}`, { negrita: true });
      parrafo(m.perfil, { sangria: 6, despues: 3 });
    });
  }

  // --- Cierre y firma ---
  let firma = null;
  try{ firma = await imagenComoDataUrl(firmaCompleta); }catch(err){ console.error('No se pudo cargar la firma:', err); }
  const ancho = 66;
  const alto = firma ? ancho * (firma.alto / firma.ancho) : 30;
  const parrafosCierre = lineasDe(d.cierre);
  asegurar(alto + 4 + (parrafosCierre.length ? LINEA * 5 : 0));
  parrafosCierre.forEach(p => parrafo(p));
  asegurar(alto + 4);
  if(firma) doc.addImage(firma.dataUrl, 'JPEG', X - 3, y, ancho, alto);
  else { parrafo('Cordial saludo,', { justificar: false, despues: 14 }); parrafo('MÓNICA PAOLA QUINTERO JIMÉNEZ', { negrita: true, justificar: false, despues: 0 }); parrafo('Representante Legal', { negrita: true, justificar: false }); }
  numerarPaginas();
  doc.setProperties({ title: nombreArchivoPropuesta(d).replace(/\.pdf$/, ''), author: 'MD ABOGADOS SAS - Lexara Abogados' });
  return { doc, nombre: nombreArchivoPropuesta(d) };
}
export async function generarPropuestaPDF(datos){
  const { doc, nombre } = await construirPropuestaPDF(datos);
  doc.save(nombre);
  return nombre;
}
/** Para adjuntar al correo: { nombre, contentType, base64 }. */
export async function propuestaComoAdjunto(datos){
  const { doc, nombre } = await construirPropuestaPDF(datos);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  let binario = '';
  for(let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { nombre, contentType: 'application/pdf', base64: btoa(binario) };
}
/** Para la vista previa: devuelve una URL de objeto del PDF. */
export async function propuestaComoURL(datos){
  const { doc } = await construirPropuestaPDF(datos);
  return URL.createObjectURL(doc.output('blob'));
}
