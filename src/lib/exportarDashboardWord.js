import { stripHtml, parseMonto, fmtMonto, desistimientosForProceso, groupCount } from './graph';
import { imagenComoDataUrl } from './informesPDF';
import membreteLexara from '../assets/Membrete Lexara.png';
import firmaCompleta from '../assets/Firma Monica Completa.png';

// Exportación Word (.docx) del panel "Análisis de procesos por Entidad" del
// Dashboard — pedido explícito del usuario 2026-08-22, como complemento
// FORMAL/estático del export a HTML (ver exportarDashboardHTML.js, que sí
// queda interactivo): "un word creado como los pdf con el mismo formato y
// pequeños resúmenes de las gráficas con las imágenes pegadas". A
// diferencia del HTML, acá cada gráfico se dibuja UNA vez como imagen
// (SVG propio, sin librería de gráficos) y se pega en el documento — no
// hay filtros que sigan funcionando después de descargarlo.
//
// Duplica a propósito los helpers campoX/construcción de filas de
// exportarDashboardHTML.js (mismo criterio documentado ahí: un <script>
// plano o un documento .docx armado a mano no pueden importar un
// componente React) — si se agrega un campo nuevo al panel de Dashboard,
// replicar el cambio en los 3 lugares (DashboardView.jsx, el export HTML y
// este archivo).

const VERDE_OSCURO = '004941';
const NARANJA = 'ef7d00';
const VERDE_CLARO = '52bbb5';
const TEXTO = '1c2624';
const GRIS_SUAVE = '5c6b68';
const GRIS_LINEA = 'e4e4e1';
const VERDE_TINTE = 'e6efed'; // tinte suave de VERDE_OSCURO, para la caja de resumen (mismo criterio que dibujarResumenBox en informesPDF.js)
const PALETA = ['004941', 'ef7d00', '52bbb5', 'a3281c', '1d5fa3', '8a6410', '6b5115', '5c6b68'];

function campoGlosa(p){ return stripHtml(p.GlosaDemandada || p.OrigenTipoGlosa) || "Sin dato"; }
function campoNaturaleza(p){ return stripHtml(p.NaturalezaProceso || p.TipoAccion) || "Sin dato"; }
function campoSubclasificacion(p){ return stripHtml(p.Subclasificacion || p.TipoProceso) || "Sin dato"; }
function campoAdmitida(p){ return stripHtml(p.Admitida) || "Sin dato"; }
function campoPrueba(p){ return stripHtml(p.PruebaPericial) || "Sin dato"; }
function campoEtapa(p){ return stripHtml(p.EtapaProcesal) || "Sin dato"; }

function escXml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function truncar(s, max=30){
  const str = String(s);
  return str.length > max ? str.slice(0, max-1) + '…' : str;
}

/* ---------------- Cálculo de datos (igual criterio que DashboardView.jsx) ---------------- */

function construirFilas(procesos, desistimientos, entidad){
  const procesosEntidad = entidad === 'todas'
    ? procesos
    : procesos.filter(p => (stripHtml(p.Entidad) || "Sin entidad") === entidad);
  return procesosEntidad.map(p => {
    const propios = desistimientosForProceso(desistimientos, p);
    const d = propios.map(des => {
      const crudo = stripHtml(des.Aprobacion) || "Sin dato";
      const estado = crudo === "Sin dato" ? crudo : crudo.charAt(0).toUpperCase() + crudo.slice(1).toLowerCase();
      return { estado, valor: parseMonto(des.DesistimientoValor) };
    });
    return {
      glosa: campoGlosa(p), naturaleza: campoNaturaleza(p), subclasificacion: campoSubclasificacion(p),
      admitida: campoAdmitida(p), pruebaPericial: campoPrueba(p), etapa: campoEtapa(p),
      valorCartera: parseMonto(p.ValorCarteraActual || p.ValorActualDemanda),
      d,
    };
  });
}
// Mismo criterio que el Dashboard en vivo (ver [[project_dashboard_analisis_entidad]]):
// un balde por PROCESO — el primer desistimiento decide, si tiene más de uno —
// para que la suma de las porciones siempre coincida con la cantidad de procesos.
function desistimientosPorEstadoDeFilas(filas){
  const mapa = new Map();
  filas.forEach(r => {
    let estado, valor;
    if(!r.d.length){ estado = 'Sin desistimiento'; valor = 0; }
    else { estado = r.d[0].estado; valor = r.d[0].valor; }
    const actual = mapa.get(estado) || { cantidad:0, valor:0 };
    mapa.set(estado, { cantidad: actual.cantidad+1, valor: actual.valor+valor });
  });
  return Array.from(mapa.entries()).map(([label,d]) => ({ label, cantidad:d.cantidad, valor:d.valor })).sort((a,b)=>b.cantidad-a.cantidad);
}

/* ---------------- Gráficos como SVG propio, sin librería ---------------- */

function puntoEnCirculo(cx, cy, r, anguloDeg){
  const rad = (anguloDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function describirArco(cx, cy, r, anguloInicio, anguloFin){
  const inicio = puntoEnCirculo(cx, cy, r, anguloInicio);
  const fin = puntoEnCirculo(cx, cy, r, anguloFin);
  const arcoGrande = anguloFin - anguloInicio <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${inicio.x} ${inicio.y} A ${r} ${r} 0 ${arcoGrande} 1 ${fin.x} ${fin.y} Z`;
}

function svgBarChart(data, colorHex){
  const rows = data.slice(0, 8);
  if(!rows.length) return null;
  const max = Math.max(...rows.map(r => r.value));
  const filaAlto = 30, labelAncho = 210, trackAncho = 270, valorAncho = 34, pad = 14;
  const ancho = labelAncho + trackAncho + valorAncho + pad*2;
  const alto = rows.length*filaAlto + pad*2;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">`;
  svg += `<rect x="0" y="0" width="${ancho}" height="${alto}" fill="#ffffff"/>`;
  rows.forEach((r, i) => {
    const y = pad + i*filaAlto;
    const anchoBarra = Math.max(4, Math.round((r.value/max) * trackAncho));
    svg += `<text x="${pad}" y="${y + filaAlto/2 + 4}" font-family="Arial, sans-serif" font-size="12" fill="#${TEXTO}">${escXml(truncar(r.label))}</text>`;
    svg += `<rect x="${pad+labelAncho}" y="${y+7}" width="${trackAncho}" height="16" rx="4" fill="#f4f4f2"/>`;
    svg += `<rect x="${pad+labelAncho}" y="${y+7}" width="${anchoBarra}" height="16" rx="4" fill="#${colorHex}"/>`;
    svg += `<text x="${pad+labelAncho+trackAncho+8}" y="${y + filaAlto/2 + 4}" font-family="Arial, sans-serif" font-size="11" fill="#${GRIS_SUAVE}">${r.value}</text>`;
  });
  svg += '</svg>';
  return { svg, ancho, alto };
}

function svgPieChart(data){
  const conValor = (data||[]).filter(d => d.value > 0);
  const total = conValor.reduce((s,d) => s + d.value, 0);
  if(!total) return null;
  const size = 150, r = size/2, cx = r, cy = r;
  let anguloActual = -90;
  const porciones = conValor.map((d, i) => {
    const barrido = (d.value/total) * 360;
    const inicio = anguloActual, fin = anguloActual + barrido;
    anguloActual = fin;
    return { ...d, color: PALETA[i % PALETA.length], path: barrido >= 359.99 ? null : describirArco(cx, cy, r, inicio, fin) };
  });
  const pad = 14, filaAlto = 20, legendAncho = 230;
  const alto = Math.max(size, porciones.length*filaAlto) + pad*2;
  const ancho = size + legendAncho + pad*2;
  const offY = (alto - size) / 2;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">`;
  svg += `<rect x="0" y="0" width="${ancho}" height="${alto}" fill="#ffffff"/>`;
  svg += `<g transform="translate(${pad},${offY})">`;
  porciones.forEach(p => {
    svg += p.path ? `<path d="${p.path}" fill="#${p.color}"/>` : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#${p.color}"/>`;
  });
  svg += `<circle cx="${cx}" cy="${cy}" r="${r*0.58}" fill="#ffffff"/>`;
  svg += `</g>`;
  const legendX = pad + size + 20;
  const legendY0 = pad + Math.max(0, (alto - pad*2 - porciones.length*filaAlto) / 2);
  porciones.forEach((p, i) => {
    const y = legendY0 + i*filaAlto;
    svg += `<circle cx="${legendX+4}" cy="${y+7}" r="5" fill="#${p.color}"/>`;
    svg += `<text x="${legendX+16}" y="${y+11}" font-family="Arial, sans-serif" font-size="12" fill="#${TEXTO}">${escXml(truncar(p.label, 26))}</text>`;
    svg += `<text x="${legendAncho-6+legendX-pad}" y="${y+11}" font-family="Arial, sans-serif" font-size="11" fill="#${GRIS_SUAVE}" text-anchor="end">${p.value}</text>`;
  });
  svg += '</svg>';
  return { svg, ancho, alto };
}

function svgToPngDataUrl(svgString, ancho, alto, escala = 2){
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = ancho*escala; canvas.height = alto*escala;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function dataUrlABytes(dataUrl){
  const base64 = dataUrl.split(',')[1];
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for(let i=0; i<binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function prepararImagen(construido){
  if(!construido) return null;
  const dataUrl = await svgToPngDataUrl(construido.svg, construido.ancho, construido.alto, 2);
  return { bytes: dataUrlABytes(dataUrl), ancho: construido.ancho, alto: construido.alto };
}

// Recorta solo la franja superior del membrete completo (logo + figura
// decorativa) — la imagen original está pensada para una hoja A4 entera,
// con una franja dorada inclinada al final que no tiene sentido repetir
// como encabezado de página en un Word (se ve cortada a la mitad). El pie
// de página de este documento usa texto simple en su lugar (ver más abajo).
function membreteEncabezadoPng(url){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = Math.round(img.naturalHeight * 0.23);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h, 0, 0, w, h);
      resolve({ dataUrl: canvas.toDataURL('image/png'), w, h });
    };
    img.onerror = reject;
    img.src = url;
  });
}

const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function fechaLarga(d){
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export async function generarDashboardEntidadWord(procesos, desistimientos, entidad){
  const [{ Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType, Header, Footer, convertMillimetersToTwip }] = await Promise.all([
    import('docx'),
  ]);

  const filas = construirFilas(procesos, desistimientos, entidad);
  const titulo = entidad === 'todas' ? 'Todas las entidades' : entidad;
  const hoy = new Date();

  const valorCartera = filas.reduce((s,r) => s + r.valorCartera, 0);
  const desistimientosTodos = filas.flatMap(r => r.d);
  const valorDesistimientos = desistimientosTodos.reduce((s,d) => s + d.valor, 0);
  const desistimientosPorEstado = desistimientosPorEstadoDeFilas(filas);
  const dataDesistimientosEstado = desistimientosPorEstado.map(d => ({ label:d.label, value:d.cantidad }));

  const dataNaturaleza = groupCount(filas, r => r.naturaleza);
  const dataAdmitida = groupCount(filas, r => r.admitida);
  const dataSubclasificacion = groupCount(filas, r => r.subclasificacion);
  const dataPrueba = groupCount(filas, r => r.pruebaPericial);

  const [pngNaturaleza, pngAdmitida, pngSubclasificacion, pngPrueba, pngDesistimientos, membrete, firma] = await Promise.all([
    prepararImagen(svgBarChart(dataNaturaleza, VERDE_OSCURO)),
    prepararImagen(svgPieChart(dataAdmitida)),
    prepararImagen(svgBarChart(dataSubclasificacion, NARANJA)),
    prepararImagen(svgPieChart(dataPrueba)),
    prepararImagen(svgPieChart(dataDesistimientosEstado)),
    membreteEncabezadoPng(membreteLexara),
    imagenComoDataUrl(firmaCompleta, 700),
  ]);
  const membreteBytes = dataUrlABytes(membrete.dataUrl);
  const firmaBytes = dataUrlABytes(firma.dataUrl);

  const anchoMembrete = 420;
  const anchoFirma = 230;

  function celdaResumen(label, value){
    return new TableCell({
      width: { size: 33.33, type: WidthType.PERCENTAGE },
      shading: { fill: VERDE_TINTE, type: ShadingType.CLEAR, color: 'auto' },
      margins: { top: 120, bottom: 120, left: 100, right: 100 },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing:{after:40}, children: [ new TextRun({ text: label.toUpperCase(), size: 15, color: GRIS_SUAVE }) ] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [ new TextRun({ text: value, bold: true, size: 22, color: VERDE_OSCURO }) ] }),
      ],
    });
  }

  function tituloSeccion(texto){
    return new Paragraph({
      spacing: { before: 260, after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GRIS_LINEA } },
      children: [ new TextRun({ text: texto, bold: true, size: 24, color: VERDE_OSCURO, font: 'Georgia' }) ],
    });
  }

  function seccionImagen(texto, png, emptyMsg){
    const parrafos = [tituloSeccion(texto)];
    if(png){
      const anchoDestino = 340;
      parrafos.push(new Paragraph({
        spacing: { after: 160 },
        children: [ new ImageRun({ type:'png', data: png.bytes, transformation: { width: anchoDestino, height: Math.round(anchoDestino * png.alto/png.ancho) } }) ],
      }));
    } else {
      parrafos.push(new Paragraph({ spacing:{after:160}, children:[ new TextRun({ text: emptyMsg, italics:true, size:19, color: GRIS_SUAVE }) ] }));
    }
    return parrafos;
  }

  const parrafoIntro = `A continuación se presenta un resumen gráfico del análisis de procesos correspondiente a ${titulo}, con corte al ${fechaLarga(hoy)}, sobre un total de ${filas.length} proceso${filas.length===1?'':'s'}.`;

  const filasDesglose = desistimientosPorEstado.map(d => new TableRow({
    children: [
      new TableCell({ width:{size:60,type:WidthType.PERCENTAGE}, margins:{top:60,bottom:60,left:80,right:80}, children:[ new Paragraph({ children:[ new TextRun({ text:d.label, size:19, color:TEXTO }) ] }) ] }),
      new TableCell({ width:{size:40,type:WidthType.PERCENTAGE}, margins:{top:60,bottom:60,left:80,right:80}, children:[ new Paragraph({ alignment:AlignmentType.RIGHT, children:[ new TextRun({ text:'$ '+fmtMonto(d.valor), bold:true, size:19, color:VERDE_OSCURO }) ] }) ] }),
    ],
  }));

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: convertMillimetersToTwip(14), bottom: convertMillimetersToTwip(16), left: convertMillimetersToTwip(20), right: convertMillimetersToTwip(20) } },
      },
      headers: {
        default: new Header({ children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [ new ImageRun({ type:'png', data: membreteBytes, transformation: { width: anchoMembrete, height: Math.round(anchoMembrete * membrete.h/membrete.w) } }) ] }),
        ]}),
      },
      footers: {
        default: new Footer({ children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: GRIS_LINEA } },
            spacing: { before: 100 },
            children: [ new TextRun({ text: 'MD Abogados SAS · www.lexaraabogados.com · Gerencia@lexaraabogados.com · +57 312 442 0026', size: 15, color: GRIS_SUAVE }) ],
          }),
        ]}),
      },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing:{before:200, after:60}, children: [ new TextRun({ text: `Análisis de procesos — ${titulo}`, bold:true, size:32, color:VERDE_OSCURO, font:'Georgia' }) ] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing:{after:280}, children: [ new TextRun({ text: 'MD ABOGADOS SAS · Nit 900.495.788-3', size:18, color:GRIS_SUAVE }) ] }),
        new Paragraph({ spacing:{after:220}, children: [ new TextRun({ text: `Bogotá D.C., ${fechaLarga(hoy)}`, size:21, color:TEXTO }) ] }),
        new Table({
          width: { size:100, type: WidthType.PERCENTAGE },
          rows: [ new TableRow({ children: [
            celdaResumen('Procesos filtrados', String(filas.length)),
            celdaResumen('Valor cartera actual', '$ '+fmtMonto(valorCartera)),
            celdaResumen('Total desistimientos', `${desistimientosTodos.length} · $ ${fmtMonto(valorDesistimientos)}`),
          ]}) ],
        }),
        new Paragraph({ spacing:{before:280, after:120}, children: [ new TextRun({ text:'Cordial saludo,', size:21, color:TEXTO }) ] }),
        new Paragraph({ spacing:{after:80}, children: [ new TextRun({ text: parrafoIntro, size:21, color:TEXTO }) ] }),

        ...seccionImagen('Naturaleza del Proceso', pngNaturaleza, 'No hay datos de Naturaleza del Proceso.'),
        ...seccionImagen('Procesos Admitidos', pngAdmitida, 'No hay datos de Admitida.'),
        ...seccionImagen('Subclasificación', pngSubclasificacion, 'No hay datos de Subclasificación.'),
        ...seccionImagen('Procesos con Prueba Pericial', pngPrueba, 'No hay datos de Prueba Pericial.'),

        tituloSeccion('Total de desistimientos'),
        new Paragraph({ spacing:{after:100}, children: [ new TextRun({ text: `${desistimientosTodos.length} desistimiento${desistimientosTodos.length===1?'':'s'} registrado${desistimientosTodos.length===1?'':'s'} · $ ${fmtMonto(valorDesistimientos)}`, bold:true, size:21, color:VERDE_OSCURO }) ] }),
        ...(desistimientosTodos.length ? [ new Table({ width:{size:70,type:WidthType.PERCENTAGE}, rows: filasDesglose }) ] : [ new Paragraph({ spacing:{after:160}, children:[ new TextRun({ text:'No hay desistimientos para estos procesos.', italics:true, size:19, color:GRIS_SUAVE }) ] }) ]),

        ...seccionImagen('Desistimientos', pngDesistimientos, 'No hay desistimientos para estos procesos.'),

        new Paragraph({ spacing:{before:360, after:200}, children: [] }),
        new Paragraph({ children: [ new ImageRun({ type:'png', data: firmaBytes, transformation: { width: anchoFirma, height: Math.round(anchoFirma * firma.alto/firma.ancho) } }) ] }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  descargarWord(blob, titulo);
}

function descargarWord(blob, titulo){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const hoy = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `Analisis de procesos - ${titulo} - ${hoy}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
