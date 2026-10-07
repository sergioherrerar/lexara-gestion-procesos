import { stripHtml, categoriaSiNoEnProceso, COLORES_SI_NO, parseMonto, fmtMonto, groupCount, desistimientosForProceso } from './graph';
import { imagenComoDataUrl } from './informesPDF';
import { generarDashboardEntidadHTML } from './exportarDashboardHTML';
import { crearHeaderMembreteWord, MARGEN_SUPERIOR_MEMBRETE_MM, MARGEN_INFERIOR_MEMBRETE_MM } from './membreteWord';
import { svgPieChart, svgBarChart, prepararImagen, dataUrlABytes, VERDE_OSCURO, VERDE_TINTE, TEXTO, GRIS_SUAVE } from './exportarDashboardWord';
import firmaCompleta from '../assets/Firma Monica Completa.png';

// Informe "SOS Ejecutivo" (2026-10-07, pedido explícito del usuario con el
// informe de enero 2026 como modelo): carta formal a SOS EPS con 4 numerales
// — (1) procesos de la abogada Diana Santos, (2) recobros ADRES del contrato
// con MD Abogados, (3) reintegros Supersalud y ADRES, (4) procesos sin
// dictámenes periciales — cada uno con su texto, su tabla y su gráfico,
// todo calculado con los procesos VIGENTES de la Entidad SOS (cantidades,
// valores y sumas en letras salen de los datos, no se escriben a mano).
// El texto histórico de los contratos (fechas, números de contrato) sí es
// fijo, tomado tal cual del informe modelo.

const ENTIDAD = 'SOS';
const NOMBRE_HTML = 'SOS-Ejecutivo-Analisis-interactivo.html';

/* ---------------- Números y valores en letras ---------------- */

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function menorDeMil(n){
  if(n === 100) return 'CIEN';
  const c = Math.floor(n / 100), r = n % 100;
  const partes = [];
  if(c) partes.push(CENTENAS[c]);
  if(r) {
    if(r < 30) partes.push(UNIDADES[r]);
    else partes.push(DECENAS[Math.floor(r / 10)] + (r % 10 ? ' Y ' + UNIDADES[r % 10] : ''));
  }
  return partes.join(' ');
}
// "UNO" → "UN" cuando va antes de MIL/MILLONES/PESOS ("veintiún mil", "un peso").
function apocope(s){
  return s.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN');
}
function menorDeUnMillon(n){
  const miles = Math.floor(n / 1000), resto = n % 1000;
  const partes = [];
  if(miles === 1) partes.push('MIL');
  else if(miles > 1) partes.push(apocope(menorDeMil(miles)) + ' MIL');
  if(resto) partes.push(menorDeMil(resto));
  return partes.join(' ');
}
export function enteroEnLetras(n){
  n = Math.floor(n);
  if(n === 0) return 'CERO';
  const millones = Math.floor(n / 1000000), resto = n % 1000000;
  const partes = [];
  if(millones === 1) partes.push('UN MILLÓN');
  else if(millones > 1) partes.push(apocope(menorDeUnMillon(millones)) + ' MILLONES');
  if(resto) partes.push(menorDeUnMillon(resto));
  return partes.join(' ');
}
// "SIETE MIL ... PESOS M/CTE ($7.685.722.962,oo)" — mismo estilo del informe modelo.
function valorEnLetras(valor){
  const total = Math.round((valor || 0) * 100);
  const pesos = Math.floor(total / 100), centavos = total % 100;
  let texto = enteroEnLetras(pesos);
  if(pesos >= 1000000 && pesos % 1000000 === 0) texto += ' DE';
  texto = apocope(texto) + (pesos === 1 ? ' PESO' : ' PESOS');
  if(centavos) texto += ' CON ' + apocope(enteroEnLetras(centavos)) + (centavos === 1 ? ' CENTAVO' : ' CENTAVOS');
  const cifra = '$' + fmtMonto(valor).replace(/,00$/, ',oo');
  return `${texto} M/CTE (${cifra})`;
}
// "nueve (9)" — cantidades dentro del texto corrido.
function cantidadEnLetras(n){
  return `${apocope(enteroEnLetras(n)).toLowerCase()} (${n})`;
}

/* ---------------- Datos ---------------- */

// Marcas de acento combinadas (U+0300–U+036F), armadas por código para que
// ninguna herramienta de edición las convierta.
const MARCAS_ACENTO = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
function sinTildes(s){
  return String(s || '').normalize('NFD').replace(MARCAS_ACENTO, '').toLowerCase();
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// Estilo del informe modelo: "enero 16 de 2026".
function fechaCarta(d){
  return `${MESES[d.getMonth()]} ${d.getDate()} de ${d.getFullYear()}`;
}
function clasificarGlosa(p){
  const g = sinTildes(stripHtml(p.GlosaDemandada || p.OrigenTipoGlosa));
  if(g.includes('antiguo')) return 'diana';
  if(g.includes('reintegro')) return 'reintegros';
  if(g.includes('recobro')) return 'recobros';
  return 'otros';
}
// Corrige la ortografía de las categorías que vienen tal cual de SharePoint
// ("Admision" → "Admisión", "Apelacion" → "Apelación", "reestablecimiento" →
// "restablecimiento") y unifica mayúsculas/espacios, para que el informe salga
// limpio y "Ordinario laboral" / "ordinario laboral" cuenten como una sola.
// Solo toca las categorías del informe (naturaleza, subclasificación, etapa),
// no nombres propios ni despachos.
function limpiarEtiqueta(texto){
  let s = String(texto || '').split(' ').filter(Boolean).join(' ');
  if(!s) return s;
  s = s.replace(/reestablecimiento/gi, m => (m[0] === 'R' ? 'Restablecimiento' : 'restablecimiento'));
  // Palabras terminadas en -cion / -sion / -ciones / -siones sin tilde → con tilde.
  // (en plural no lleva tilde: "ciones"; en mayúsculas se respeta: "ADMISIÓN")
  s = s.replace(/([A-Za-z]*)(c|s)ion(es)?(?![A-Za-z])/gi, (m, raiz, c, pl) => {
    const corregida = pl ? raiz + c + 'ion' + pl : raiz + c + 'ión';
    return pl ? m : (m === m.toUpperCase() ? corregida.toUpperCase() : corregida);
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fila(p){
  const naturaleza = limpiarEtiqueta(stripHtml(p.NaturalezaProceso || p.TipoAccion)) || 'Sin dato';
  const subclasificacion = limpiarEtiqueta(stripHtml(p.Subclasificacion || p.TipoProceso)) || '';
  return {
    radicado: stripHtml(p.Radicado) || '—',
    contrato: stripHtml(p.NumeroContrato) || 'Sin contrato',
    despacho: `${stripHtml(p.Despacho) || ''} ${stripHtml(p.NumeroDespacho) || ''}`.trim() || '—',
    naturaleza,
    subTotal: subclasificacion || 'Sin dato',
    subclasificacion: subclasificacion && sinTildes(subclasificacion) !== sinTildes(naturaleza) ? subclasificacion : '',
    etapa: limpiarEtiqueta(stripHtml(p.EtapaProcesal)) || 'Sin dato',
    admitida: categoriaSiNoEnProceso(p.Admitida),
    pruebaPericial: categoriaSiNoEnProceso(p.PruebaPericial),
    valor: parseMonto(p.ValorCarteraActual || p.ValorActualDemanda),
  };
}
// "2026-01-16T00:00:00Z" → "16 de enero de 2026" (solo la parte de fecha, sin husos horarios).
function fechaIsoALarga(iso){
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(String(iso || ''));
  return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : '';
}
function fechaIsoACorta(iso){
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}
function porRadicado(a, b){
  return a.radicado.localeCompare(b.radicado, 'es', { numeric: true });
}
function esLaboral(f){ return sinTildes(f.naturaleza).includes('laboral'); }
function sumar(filas){ return filas.reduce((s, f) => s + f.valor, 0); }

/* ---------------- Documento ---------------- */

export async function generarSosEjecutivoWord(procesos, desistimientos){
  const { Document, Packer, Paragraph, TextRun, ExternalHyperlink, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType, VerticalAlign, Header, convertMillimetersToTwip, HorizontalPositionAlign, HorizontalPositionRelativeFrom, VerticalPositionAlign, VerticalPositionRelativeFrom, TextWrappingType } = await import('docx');

  // Solo procesos VIGENTES de SOS (mismo criterio que el Dashboard).
  const vigentes = procesos
    .filter(p => !(stripHtml(p.EstadoVT) || '').toLowerCase().includes('termin'))
    .filter(p => (stripHtml(p.Entidad) || 'Sin entidad') === ENTIDAD);
  if(!vigentes.length) throw new Error('No hay procesos vigentes de SOS para armar el informe.');

  const grupos = { diana: [], recobros: [], reintegros: [], otros: [] };
  vigentes.forEach(p => grupos[clasificarGlosa(p)].push(fila(p)));
  Object.values(grupos).forEach(g => g.sort(porRadicado));
  const todos = vigentes.map(fila);
  const hoy = new Date();

  // Desistimientos de los procesos vigentes de SOS (cruce por ID, como en el resto del portal).
  const desis = [];
  vigentes.forEach(p => {
    const base = fila(p);
    desistimientosForProceso(desistimientos || [], p).forEach(d => {
      const crudo = stripHtml(d.Aprobacion) || 'Sin dato';
      desis.push({
        radicado: base.radicado, despacho: base.despacho,
        valor: parseMonto(d.DesistimientoValor),
        fechaRad: String(d.FechaRadicacion || '').slice(0, 10),
        fechaApr: String(d.FechaAprobacion || '').slice(0, 10),
        estado: crudo === 'Sin dato' ? crudo : crudo.charAt(0).toUpperCase() + crudo.slice(1).toLowerCase(),
      });
    });
  });
  desis.sort((a, b) => (a.fechaRad || '9999').localeCompare(b.fechaRad || '9999') || porRadicado(a, b));
  const fechasRad = desis.map(d => d.fechaRad).filter(Boolean).sort();
  const valorDesis = sumar(desis);

  const dianaLaboral = grupos.diana.filter(esLaboral);
  const dianaAdmin = grupos.diana.filter(f => !esLaboral(f));
  const enProceso = todos.filter(f => f.pruebaPericial === 'En Proceso').sort(porRadicado);
  const sinPerito = todos.filter(f => f.pruebaPericial === 'NO').sort(porRadicado);

  // Barras de Naturaleza del Proceso, como en el Dashboard (mismo color), filtradas por grupo.
  const imagenGrafico = (filas) => prepararImagen(svgBarChart(groupCount(filas, f => f.naturaleza), VERDE_OSCURO));
  const [pngDiana, pngRecobros, pngReintegros, pngOtros, pngPrueba, pngDesis, headerMembrete, firma] = await Promise.all([
    imagenGrafico(grupos.diana),
    imagenGrafico(grupos.recobros),
    imagenGrafico(grupos.reintegros),
    grupos.otros.length ? imagenGrafico(grupos.otros) : null,
    prepararImagen(svgPieChart(groupCount(todos, f => f.pruebaPericial), COLORES_SI_NO)),
    prepararImagen(svgPieChart(groupCount(desis, d => d.estado).map(g => ({ ...g, detalle: '$' + fmtMonto(sumar(desis.filter(d => d.estado === g.label))) })))),
    crearHeaderMembreteWord({ Header, ImageRun, Paragraph, HorizontalPositionAlign, HorizontalPositionRelativeFrom, VerticalPositionAlign, VerticalPositionRelativeFrom, TextWrappingType }),
    imagenComoDataUrl(firmaCompleta, 700),
  ]);
  const firmaBytes = dataUrlABytes(firma.dataUrl);

  /* ---- bloques de construcción ---- */
  const T = 21; // 10.5 pt, igual que el resto de las cartas
  const parrafo = (texto, opciones = {}) => new Paragraph({
    alignment: opciones.alinear || AlignmentType.JUSTIFIED,
    spacing: { after: opciones.despues ?? 160 },
    children: [ new TextRun({ text: texto, size: T, color: TEXTO, bold: !!opciones.negrita }) ],
  });
  const lineaSimple = (texto, negrita = false, despues = 0) => new Paragraph({ spacing: { after: despues }, children: [ new TextRun({ text: texto, size: T, color: TEXTO, bold: negrita }) ] });
  const numeral = (n, texto) => new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 320, after: 160 },
    keepNext: true,
    indent: { left: 360, hanging: 360 },
    children: [ new TextRun({ text: `${typeof n === 'number' ? n + '.' : n}\t${texto}`, size: T, color: TEXTO, bold: true }) ],
  });

  const BORDE = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const BORDES = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE };
  const MARGENES = { top: 50, bottom: 50, left: 70, right: 70 };

  function celdaEncabezado(texto, ancho){
    return new TableCell({
      width: { size: ancho, type: WidthType.DXA },
      shading: { fill: VERDE_OSCURO, type: ShadingType.CLEAR, color: 'auto' },
      verticalAlign: VerticalAlign.CENTER,
      borders: BORDES, margins: MARGENES,
      children: [ new Paragraph({ alignment: AlignmentType.CENTER, children: [ new TextRun({ text: texto, bold: true, size: 19, color: 'FFFFFF' }) ] }) ],
    });
  }
  function celda(texto, ancho, alinear = AlignmentType.CENTER, extra = ''){
    const hijos = [ new Paragraph({ alignment: alinear, children: [ new TextRun({ text: texto, size: 19, color: TEXTO }) ] }) ];
    if(extra) hijos.push(new Paragraph({ alignment: alinear, children: [ new TextRun({ text: extra, size: 16, color: GRIS_SUAVE }) ] }));
    return new TableCell({ width: { size: ancho, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, borders: BORDES, margins: MARGENES, children: hijos });
  }
  function tabla(anchos, encabezados, filasCeldas){
    const total = anchos.reduce((a, b) => a + b, 0);
    return new Table({
      width: { size: total, type: WidthType.DXA },
      columnWidths: anchos,
      alignment: AlignmentType.CENTER,
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: encabezados.map((e, i) => celdaEncabezado(e, anchos[i])) }),
        ...filasCeldas.map(celdas => new TableRow({ cantSplit: true, children: celdas })),
      ],
    });
  }
  const espacio = () => new Paragraph({ spacing: { after: 160 }, children: [] });

  // Tabla de procesos (Naturaleza | Radicado | Despacho | Valor cartera actual)
  function tablaProcesos(filas){
    const A = [1750, 1450, 3900, 2538];
    return tabla(A, ['Naturaleza del Proceso', 'Radicado', 'Despacho Judicial', 'Valor Cartera actual'],
      filas.map(f => [
        celda(f.naturaleza, A[0], AlignmentType.CENTER, f.subclasificacion),
        celda(f.radicado, A[1]),
        celda(f.despacho, A[2]),
        celda('$' + fmtMonto(f.valor), A[3], AlignmentType.RIGHT),
      ]));
  }
  // Contratos del grupo y cuántos procesos (y cuánta cartera) tiene cada uno.
  function tablaContratos(filas){
    const A = [5000, 1800, 2838];
    const mapa = new Map();
    filas.forEach(f => { const a = mapa.get(f.contrato) || { n: 0, valor: 0 }; mapa.set(f.contrato, { n: a.n + 1, valor: a.valor + f.valor }); });
    const lista = Array.from(mapa.entries()).sort((a, b) => b[1].n - a[1].n);
    return tabla(A, ['Contrato', 'Procesos', 'Valor Cartera actual'], lista.map(([c, d]) => [ celda(c, A[0]), celda(String(d.n), A[1]), celda('$' + fmtMonto(d.valor), A[2], AlignmentType.RIGHT) ]));
  }
  function tablaRadicadoDespacho(filas, tituloTercera, textoTercera){
    const A = [1500, 4100, 4038];
    return tabla(A, ['Radicado', 'Despacho Judicial', tituloTercera],
      filas.map(f => [ celda(f.radicado, A[0]), celda(f.despacho, A[1]), celda(textoTercera(f), A[2]) ]));
  }
  function grafico(png, titulo, ancho = 440){
    if(!png) return [];
    return [
      new Paragraph({ spacing: { before: 200, after: 80 }, keepNext: true, alignment: AlignmentType.CENTER, children: [ new TextRun({ text: titulo, bold: true, size: 19, color: VERDE_OSCURO }) ] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [ new ImageRun({ type: 'png', data: png.bytes, transformation: { width: ancho, height: Math.round(ancho * png.alto / png.ancho) } }) ] }),
    ];
  }
  const sinProcesos = (texto) => parrafo(texto, { despues: 160 });

  const hijos = [];

  /* ---- Encabezado de carta (destinatario tomado del informe modelo) ---- */
  hijos.push(
    new Paragraph({ spacing: { before: 200, after: 280 }, children: [ new TextRun({ text: `Bogotá D.C., ${fechaCarta(hoy)}`, size: T, color: TEXTO }) ] }),
    lineaSimple('Doctora', true),
    lineaSimple('ANGELA MONCADA', true),
    lineaSimple('Jefe jurídica SOS EPS', true),
    lineaSimple('Cali – Valle del Cauca', true, 280),
    new Paragraph({ spacing: { after: 220 }, children: [ new TextRun({ text: `Asunto: INFORME EJECUTIVO DE GESTIÓN LEGAL CON CORTE AL ${hoy.getDate()} DE ${MESES[hoy.getMonth()].toUpperCase()} DE ${hoy.getFullYear()}`, bold: true, size: T, color: TEXTO }) ] }),
    lineaSimple('Respetada Doctora:', false, 220),
    parrafo(`En mi calidad de representante legal de la empresa MD ABOGADOS SAS, me permito dar respuesta a su requerimiento, a fin de indicarles que mi representada a la fecha tiene la representación judicial en ${vigentes.length} proceso${vigentes.length === 1 ? '' : 's'} judicial${vigentes.length === 1 ? '' : 'es'} que aparecen relacionados en archivo Excel adjunto, en el que aparece el estado de los procesos y demás asuntos relevantes.`),
    parrafo(`Los ${vigentes.length} procesos citados se discriminan así:`),
  );
  // Enlace al análisis interactivo (HTML) de SOS: se descarga junto con este
  // Word, en la misma carpeta, y el enlace es relativo (por eso el nombre
  // fijo y sin espacios). Si se envía por correo, se adjuntan los dos archivos.
  const enlaceHtml = new Paragraph({
    alignment: AlignmentType.JUSTIFIED, spacing: { after: 160 },
    children: [
      new TextRun({ text: 'Para consultar de forma interactiva el análisis de los procesos de SOS (filtros y gráficos por Glosa, Naturaleza, Admitida, Subclasificación, Prueba Pericial y Etapa), ingrese a: ', size: T, color: TEXTO }),
      new ExternalHyperlink({ link: NOMBRE_HTML, children: [ new TextRun({ text: NOMBRE_HTML, size: T, color: '1d5fa3', underline: {} }) ] }),
    ],
  });

  /* ---- Información consolidada de todos los procesos (antes del numeral 1) ---- */
  const nLaborales = todos.filter(esLaboral).length;
  const nAdministrativos = todos.filter(f => sinTildes(f.naturaleza).includes('administrativ')).length;
  const nOtrosNat = todos.length - nLaborales - nAdministrativos;
  const SIN_BORDE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const SIN_BORDES = { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE };
  const celdaResumen = (rotulo, valor) => new TableCell({
    width: { size: 3212, type: WidthType.DXA },
    shading: { fill: VERDE_TINTE, type: ShadingType.CLEAR, color: 'auto' },
    borders: SIN_BORDES, margins: { top: 80, bottom: 80, left: 80, right: 80 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [ new TextRun({ text: rotulo.toUpperCase(), size: 14, color: GRIS_SUAVE }) ] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [ new TextRun({ text: valor, bold: true, size: 20, color: VERDE_OSCURO }) ] }),
    ],
  });
  // Mini tabla de conteo (categoría | cantidad) para meter 3 lado a lado en menos de media hoja.
  function miniTabla(titulo, datos){
    const A = [2350, 750];
    const borde = { style: BorderStyle.SINGLE, size: 4, color: 'b8c0bd' };
    const bordes = { top: borde, bottom: borde, left: borde, right: borde };
    const m = { top: 20, bottom: 20, left: 60, right: 60 };
    const cel = (texto, ancho, alinear, extra = {}) => new TableCell({
      width: { size: ancho, type: WidthType.DXA }, borders: bordes, margins: m, verticalAlign: VerticalAlign.CENTER,
      ...(extra.fondo ? { shading: { fill: extra.fondo, type: ShadingType.CLEAR, color: 'auto' } } : {}),
      children: [ new Paragraph({ alignment: alinear, children: [ new TextRun({ text: texto, size: 15, bold: !!extra.negrita, color: extra.color || TEXTO }) ] }) ],
    });
    const total = datos.reduce((s, d) => s + d.value, 0);
    return new Table({
      width: { size: A[0] + A[1], type: WidthType.DXA }, columnWidths: A,
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: [ cel(titulo, A[0], AlignmentType.LEFT, { fondo: VERDE_OSCURO, negrita: true, color: 'FFFFFF' }), cel('Procesos', A[1], AlignmentType.RIGHT, { fondo: VERDE_OSCURO, negrita: true, color: 'FFFFFF' }) ] }),
        ...datos.map(d => new TableRow({ cantSplit: true, children: [ cel(d.label, A[0], AlignmentType.LEFT), cel(String(d.value), A[1], AlignmentType.RIGHT) ] })),
        new TableRow({ cantSplit: true, children: [ cel('Total', A[0], AlignmentType.LEFT, { negrita: true, fondo: VERDE_TINTE }), cel(String(total), A[1], AlignmentType.RIGHT, { negrita: true, fondo: VERDE_TINTE }) ] }),
      ],
    });
  }
  const celdaMini = (titulo, datos) => new TableCell({
    width: { size: 3212, type: WidthType.DXA }, borders: SIN_BORDES, margins: { top: 0, bottom: 0, left: 40, right: 40 },
    children: [ miniTabla(titulo, datos), new Paragraph({ spacing: { after: 0 }, children: [] }) ],
  });
  hijos.push(
    new Table({
      width: { size: 9636, type: WidthType.DXA }, columnWidths: [3212, 3212, 3212], borders: { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE, insideHorizontal: SIN_BORDE, insideVertical: SIN_BORDE },
      rows: [ new TableRow({ cantSplit: true, children: [
        celdaResumen('Procesos vigentes', String(todos.length)),
        celdaResumen('Valor cartera actual', '$' + fmtMonto(sumar(todos))),
        celdaResumen('Laborales / Administrativos', `${nLaborales} / ${nAdministrativos}` + (nOtrosNat ? ` (+${nOtrosNat} otros)` : '')),
      ] }) ],
    }),
    new Paragraph({ spacing: { after: 100 }, children: [] }),
    new Table({
      width: { size: 9636, type: WidthType.DXA }, columnWidths: [3212, 3212, 3212], borders: { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE, insideHorizontal: SIN_BORDE, insideVertical: SIN_BORDE },
      rows: [ new TableRow({ cantSplit: true, children: [
        celdaMini('Naturaleza del Proceso', groupCount(todos, f => f.naturaleza)),
        celdaMini('Subclasificación', groupCount(todos, f => f.subTotal)),
        celdaMini('Etapa del proceso', groupCount(todos, f => f.etapa)),
      ] }) ],
    }),
    new Paragraph({ spacing: { after: 160 }, children: [] }),
  );
  hijos.push(enlaceHtml);

  /* ---- 1. Diana Santos ---- */
  hijos.push(numeral(1, 'PROCESOS DE RECOBROS ADRES DE LOS CONTRATOS DE LA ABOGADA DIANA PATRICIA SANTOS RUIZ'));
  if(!grupos.diana.length){
    hijos.push(sinProcesos('A la fecha no hay procesos vigentes en este grupo.'));
  } else {
    hijos.push(
      parrafo(`Durante los años 2008 a 2012, la EPS SOS contrató directamente a la abogada DIANA PATRICIA SANTOS para la representación judicial de ${cantidadEnLetras(grupos.diana.length)} procesos de recobros otrora FOSYGA, los cuales fueron inicialmente radicados como acciones de reparación directa ante la jurisdicción administrativa, entre 2014 a 2016, y posteriormente fueron enviados a la jurisdicción laboral, en la cual para ${cantidadEnLetras(dianaLaboral.length)} de esos procesos se definió la competencia por el Consejo Superior de la Judicatura en Laboral y se han desarrollado en esos juzgados:`),
    );
    if(dianaLaboral.length) hijos.push(tablaProcesos(dianaLaboral), espacio());
    if(dianaAdmin.length){
      hijos.push(parrafo(`Sin embargo, para ${cantidadEnLetras(dianaAdmin.length)} de los ${cantidadEnLetras(grupos.diana.length)} procesos asignados a Diana Santos, la competencia volvió a la jurisdicción administrativa, a saber:`), tablaProcesos(dianaAdmin), espacio());
    }
    hijos.push(
      parrafo(`El total de la cartera demandada en los procesos judiciales que devienen del contrato suscrito con DIANA PATRICIA SANTOS es de ${valorEnLetras(sumar(grupos.diana))}`),
      parrafo('Por contrato, los procesos se distribuyen así:', { despues: 100 }),
      tablaContratos(grupos.diana), espacio(),
      parrafo('Dado que de estos procesos se habían causado honorarios de manera inicial en la jurisdicción laboral a nombre de DIANA PATRICIA SANTOS, el seguimiento a los mismos se pactó de manera verbal por parte de MD ABOGADOS SAS, pero los honorarios pactados en los contratos con la abogada inicial se causan y ella los cobra a su nombre. Inclusive en las disponibilidades presupuestales que hace la entidad son tenidos en cuenta de esa forma.'),
      ...grafico(pngDiana, 'Naturaleza del Proceso — procesos de Diana Santos'),
    );
  }

  /* ---- 2. Recobros ADRES (contrato con MD Abogados) ---- */
  hijos.push(numeral(2, 'PROCESOS DE RECOBROS ADRES DEL CONTRATO GJU-31-03-2025-431 CON MD ABOGADOS SAS'));
  hijos.push(
    parrafo('El 2 de febrero de 2015 se suscribió el contrato CPS-JUR-02-02-15 entre EPS SOS S.A. y MD ABOGADOS SAS con el objeto de brindar asesoría y representación judicial para la gestión de cobro judicial y prejudicial de la cartera de recobros FOSYGA y además continuar con seis (6) procesos judiciales que la EPS había iniciado a través de otros abogados diferentes a DIANA PATRICIA SANTOS (En ese entonces socia de MD ABOGADOS SAS).'),
    parrafo('El anterior contrato se renovó en 2016 y 2017. Para el año 2018 se suscribió un nuevo contrato, el CPS-01-02-2017-20103, con fecha de inicio 2 de febrero de 2018, con similar objeto y se relacionaron catorce (14) procesos en curso.'),
    parrafo('De este contrato cada año se suscribió un Otrosí, para celebrar en total seis (6) Otrosíes, hasta el 1 de febrero de 2025.'),
    parrafo('El 31 de enero de 2025, se suscribió el contrato GJU-31-03-2025-431 con el objeto de continuar la asesoría y representación judicial de la entidad en los procesos de recobros ADRES, con el mismo valor de honorarios mensuales, cobrados desde el año 2018, cuya vigencia se pactó desde el 2 de febrero de 2025 y hasta el 1 de febrero de 2026.'),
  );
  if(!grupos.recobros.length){
    hijos.push(sinProcesos('A la fecha no hay procesos vigentes en este grupo.'));
  } else {
    hijos.push(
      parrafo(`A la fecha, en virtud de este contrato, están vigentes ${cantidadEnLetras(grupos.recobros.length)} proceso${grupos.recobros.length === 1 ? '' : 's'} judicial${grupos.recobros.length === 1 ? '' : 'es'}, a saber:`),
      parrafo('Por contrato, los procesos se distribuyen así:', { despues: 100 }),
      tablaContratos(grupos.recobros), espacio(),
      tablaProcesos(grupos.recobros), espacio(),
      parrafo(`En total la cartera demandada por recobros en el contrato con MD ABOGADOS SAS a la fecha asciende a ${valorEnLetras(sumar(grupos.recobros))}`),
      ...grafico(pngRecobros, 'Naturaleza del Proceso — procesos de recobros ADRES'),
    );
  }

  /* ---- 3. Reintegros ---- */
  hijos.push(numeral(3, 'PROCESOS DE REINTEGROS SUPERSALUD Y ADRES'));
  if(!grupos.reintegros.length){
    hijos.push(sinProcesos('A la fecha no hay procesos vigentes en este grupo.'));
  } else {
    hijos.push(
      parrafo(`Durante los años 2020 a 2022, se suscribieron contratos entre SOS EPS S.A. y MD ABOGADOS SAS para la representación judicial en procesos de reintegros ordenados por la Supersalud, y con posterioridad la ADRES contra la EPS, de los cuales a la fecha cursan ${cantidadEnLetras(grupos.reintegros.length)} proceso${grupos.reintegros.length === 1 ? '' : 's'}, cuyas cuantías son las siguientes:`),
      tablaProcesos(grupos.reintegros), espacio(),
      parrafo(`Para un total demandado de ${valorEnLetras(sumar(grupos.reintegros))}.`),
      parrafo('Por contrato, los procesos se distribuyen así:', { despues: 100 }),
      tablaContratos(grupos.reintegros), espacio(),
      ...grafico(pngReintegros, 'Naturaleza del Proceso — procesos de reintegros'),
    );
  }

  /* ---- Procesos que no caen en ninguno de los 3 grupos (para que el total cuadre) ---- */
  if(grupos.otros.length){
    hijos.push(
      numeral('•', 'OTROS PROCESOS (SIN GLOSA DEMANDADA CLASIFICADA)'),
      parrafo(`Adicionalmente, ${cantidadEnLetras(grupos.otros.length)} proceso${grupos.otros.length === 1 ? '' : 's'} no tiene${grupos.otros.length === 1 ? '' : 'n'} Glosa Demandada que permita ubicarlo${grupos.otros.length === 1 ? '' : 's'} en los grupos anteriores:`),
      tablaProcesos(grupos.otros), espacio(),
      parrafo(`Cartera de estos procesos: ${valorEnLetras(sumar(grupos.otros))}`),
      ...grafico(pngOtros, 'Naturaleza del Proceso — otros procesos'),
    );
  }

  /* ---- 4. Dictámenes periciales (3 grupos: SI / En Proceso / NO) ---- */
  const conDictamenFilas = todos.filter(f => f.pruebaPericial === 'SI').sort(porRadicado);
  const plural = (n, uno, varios) => (n === 1 ? uno : varios);
  const subtitulo = (texto) => new Paragraph({ keepNext: true, spacing: { before: 200, after: 100 }, children: [ new TextRun({ text: texto, bold: true, size: T, color: VERDE_OSCURO }) ] });
  hijos.push(
    numeral(4, 'PROCESOS Y DICTÁMENES PERICIALES'),
    parrafo(`De los ${todos.length} procesos de SOS, ${cantidadEnLetras(conDictamenFilas.length)} ${plural(conDictamenFilas.length, 'cuenta', 'cuentan')} con dictamen pericial entregado, ${cantidadEnLetras(enProceso.length)} ${plural(enProceso.length, 'tiene', 'tienen')} el dictamen en proceso y ${cantidadEnLetras(sinPerito.length)} ${plural(sinPerito.length, 'no tiene', 'no tienen')} dictamen pericial, así:`),
    ...grafico(pngPrueba, 'Prueba pericial — todos los procesos de SOS'),
  );

  // 4.1 Dictamen pericial entregado (SI)
  hijos.push(subtitulo('Procesos con dictamen pericial entregado (SI)'));
  if(conDictamenFilas.length){
    hijos.push(
      parrafo(`A la fecha ${cantidadEnLetras(conDictamenFilas.length)} proceso${plural(conDictamenFilas.length, '', 's')} ${plural(conDictamenFilas.length, 'cuenta', 'cuentan')} con dictamen pericial entregado, ${plural(conDictamenFilas.length, 'que es el siguiente', 'que son los siguientes')}:`),
      tablaRadicadoDespacho(conDictamenFilas, 'DICTAMEN PERICIAL', () => 'Dictamen pericial entregado'), espacio(),
    );
  } else {
    hijos.push(parrafo('A la fecha no hay procesos con dictamen pericial entregado.'));
  }

  // 4.2 Dictamen pericial en proceso (En Proceso)
  hijos.push(subtitulo('Procesos con dictamen pericial en proceso (En Proceso)'));
  if(enProceso.length){
    hijos.push(
      parrafo(`Están pendientes de entregar dictámenes periciales ya asignados a la empresa ACIEL. A la fecha hay ${cantidadEnLetras(enProceso.length)} proceso${plural(enProceso.length, '', 's')} con programación de entrega que ${plural(enProceso.length, 'es el siguiente', 'son los siguientes')}:`),
      tablaRadicadoDespacho(enProceso, 'DICTAMEN PERICIAL', () => 'Dictamen asignado a ACIEL, en proceso de elaboración'), espacio(),
    );
  } else {
    hijos.push(parrafo('A la fecha no hay procesos con dictamen pericial en proceso de elaboración.'));
  }

  // 4.3 Sin dictamen pericial (NO)
  hijos.push(subtitulo('Procesos sin dictamen pericial (NO)'));
  if(sinPerito.length){
    hijos.push(
      parrafo(`Hay ${cantidadEnLetras(sinPerito.length)} proceso${plural(sinPerito.length, '', 's')} sin dictamen pericial, pendiente${plural(sinPerito.length, '', 's')} de que ${plural(sinPerito.length, 'le', 'les')} sea asignado perito, dado que según lo conversado con la empresa ACIEL, aún no los tienen adjudicados. ${plural(sinPerito.length, 'Es el siguiente', 'Tales son')}:`),
      tablaRadicadoDespacho(sinPerito, 'DICTAMEN PERICIAL', f => `Pendiente de asignación de perito, ${f.admitida === 'SI' ? 'ya fue admitida' : 'aún no fue admitida'}`), espacio(),
    );
  } else {
    hijos.push(parrafo('A la fecha no hay procesos pendientes de que se les asigne perito.'));
  }

  /* ---- 5. Desistimientos presentados ---- */
  hijos.push(numeral(5, 'DESISTIMIENTOS PRESENTADOS'));
  if(!desis.length){
    hijos.push(parrafo('A la fecha no hay desistimientos registrados para los procesos de SOS.'));
  } else {
    const aprobados = desis.filter(d => sinTildes(d.estado).startsWith('aprob'));
    const periodo = fechasRad.length
      ? (fechasRad[0] === fechasRad[fechasRad.length - 1]
        ? `el ${fechaIsoALarga(fechasRad[0])}`
        : `entre el ${fechaIsoALarga(fechasRad[0])}, fecha del primer desistimiento presentado, y el ${fechaIsoALarga(fechasRad[fechasRad.length - 1])}, fecha del último radicado`)
      : 'durante el período de gestión';
    hijos.push(
      parrafo(`Dentro de la gestión adelantada se han presentado ${cantidadEnLetras(desis.length)} desistimiento${desis.length === 1 ? '' : 's'} de recobros ${periodo}. En ese tiempo se ha recuperado cartera por desistimientos por un valor de ${valorEnLetras(valorDesis)}${aprobados.length ? `, de los cuales ${cantidadEnLetras(aprobados.length)} ya ${aprobados.length === 1 ? 'fue aprobado' : 'fueron aprobados'} por ${valorEnLetras(sumar(aprobados))}` : ''}. El detalle es el siguiente:`),
      (() => {
        const A = [1350, 2900, 1650, 1250, 1250, 1238];
        return tabla(A, ['Radicado', 'Despacho Judicial', 'Valor desistimiento', 'Fecha radicación', 'Aprobación', 'Fecha aprobación'],
          desis.map(d => [
            celda(d.radicado, A[0]), celda(d.despacho, A[1]), celda('$' + fmtMonto(d.valor), A[2], AlignmentType.RIGHT),
            celda(fechaIsoACorta(d.fechaRad), A[3]), celda(d.estado, A[4]), celda(fechaIsoACorta(d.fechaApr), A[5]),
          ]));
      })(),
      espacio(),
      ...grafico(pngDesis, 'Desistimientos presentados por estado de aprobación (cantidad · valor)', 480),
    );
  }

  /* ---- Cierre y firma ---- */
  const anchoFirma = 230;
  hijos.push(
    parrafo('De conformidad con lo expuesto, se presenta informe de gestión frente a la representación judicial de EPS SOS S.A. en los procesos encomendados.', { despues: 200 }),
    new Paragraph({ keepNext: true, spacing: { after: 160 }, children: [ new TextRun({ text: 'Quedamos pendientes de sus inquietudes y recomendaciones.', size: T, color: TEXTO }) ] }),
    new Paragraph({ children: [ new ImageRun({ type: 'png', data: firmaBytes, transformation: { width: anchoFirma, height: Math.round(anchoFirma * firma.alto / firma.ancho) } }) ] }),
  );

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: convertMillimetersToTwip(MARGEN_SUPERIOR_MEMBRETE_MM), bottom: convertMillimetersToTwip(MARGEN_INFERIOR_MEMBRETE_MM), left: convertMillimetersToTwip(20), right: convertMillimetersToTwip(20) } } },
      headers: { default: headerMembrete },
      children: hijos,
    }],
  });

  // Se descarga primero el HTML (el Word lo enlaza) y luego el Word.
  generarDashboardEntidadHTML(procesos, desistimientos, ENTIDAD, NOMBRE_HTML);
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SOS Ejecutivo - ${hoy.toISOString().slice(0, 10)}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
