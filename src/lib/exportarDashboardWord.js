import { stripHtml, categoriaSiNoEnProceso, COLORES_SI_NO, parseMonto, fmtMonto, desistimientosForProceso, groupCount } from './graph';
import { imagenComoDataUrl } from './informesPDF';
import { crearHeaderMembreteWord, MARGEN_SUPERIOR_MEMBRETE_MM, MARGEN_INFERIOR_MEMBRETE_MM } from './membreteWord';
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

export const VERDE_OSCURO = '004941';
export const NARANJA = 'ef7d00';
export const VERDE_CLARO = '52bbb5';
export const TEXTO = '1c2624';
export const GRIS_SUAVE = '5c6b68';
export const GRIS_LINEA = 'e4e4e1';
export const VERDE_TINTE = 'e6efed'; // tinte suave de VERDE_OSCURO, para la caja de resumen (mismo criterio que dibujarResumenBox en informesPDF.js)
const PALETA = ['004941', 'ef7d00', '52bbb5', 'a3281c', '1d5fa3', '8a6410', '6b5115', '5c6b68'];

function campoGlosa(p){ return stripHtml(p.GlosaDemandada || p.OrigenTipoGlosa) || "Sin dato"; }
function campoNaturaleza(p){ return stripHtml(p.NaturalezaProceso || p.TipoAccion) || "Sin dato"; }
function campoSubclasificacion(p){ return stripHtml(p.Subclasificacion || p.TipoProceso) || "Sin dato"; }
function campoAdmitida(p){ return categoriaSiNoEnProceso(p.Admitida); }
function campoPrueba(p){ return categoriaSiNoEnProceso(p.PruebaPericial); }
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
  // Solo procesos VIGENTES (2026-10-01, pedido explícito del usuario —
  // mismo criterio que DashboardView.jsx/ProcesosView.jsx: EstadoVT
  // contiene "termin").
  const procesosVigentes = procesos.filter(p => !(stripHtml(p.EstadoVT)||"").toLowerCase().includes('termin'));
  const procesosEntidad = entidad === 'todas'
    ? procesosVigentes
    : procesosVigentes.filter(p => (stripHtml(p.Entidad) || "Sin entidad") === entidad);
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

export function svgBarChart(data, colorHex){
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

export function svgPieChart(data, colores){
  const conValor = (data||[]).filter(d => d.value > 0);
  const total = conValor.reduce((s,d) => s + d.value, 0);
  if(!total) return null;
  const size = 150, r = size/2, cx = r, cy = r;
  let anguloActual = -90;
  const porciones = conValor.map((d, i) => {
    const barrido = (d.value/total) * 360;
    const inicio = anguloActual, fin = anguloActual + barrido;
    anguloActual = fin;
    return { ...d, color: ((colores && colores[d.label]) || "").replace("#", "") || PALETA[i % PALETA.length], path: barrido >= 359.99 ? null : describirArco(cx, cy, r, inicio, fin) };
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

export function dataUrlABytes(dataUrl){
  const base64 = dataUrl.split(',')[1];
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for(let i=0; i<binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

export async function prepararImagen(construido){
  if(!construido) return null;
  const dataUrl = await svgToPngDataUrl(construido.svg, construido.ancho, construido.alto, 2);
  return { bytes: dataUrlABytes(dataUrl), ancho: construido.ancho, alto: construido.alto };
}

const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
export function fechaLarga(d){
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export async function generarDashboardEntidadWord(procesos, desistimientos, entidad){
  const [{ Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType, Header, convertMillimetersToTwip, HorizontalPositionAlign, HorizontalPositionRelativeFrom, VerticalPositionAlign, VerticalPositionRelativeFrom, TextWrappingType }] = await Promise.all([
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

  const [pngNaturaleza, pngAdmitida, pngSubclasificacion, pngPrueba, pngDesistimientos, headerMembrete, firma] = await Promise.all([
    prepararImagen(svgBarChart(dataNaturaleza, VERDE_OSCURO)),
    prepararImagen(svgPieChart(dataAdmitida, COLORES_SI_NO)),
    prepararImagen(svgBarChart(dataSubclasificacion, NARANJA)),
    prepararImagen(svgPieChart(dataPrueba, COLORES_SI_NO)),
    prepararImagen(svgPieChart(dataDesistimientosEstado)),
    crearHeaderMembreteWord({ Header, ImageRun, Paragraph, HorizontalPositionAlign, HorizontalPositionRelativeFrom, VerticalPositionAlign, VerticalPositionRelativeFrom, TextWrappingType }),
    imagenComoDataUrl(firmaCompleta, 700),
  ]);
  const firmaBytes = dataUrlABytes(firma.dataUrl);

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

  // Tabla de conteo (2026-10-01, pedido explícito del usuario: "incluye las
  // tablas de los gráficos con el formato así con los colores
  // corporativos") — mismo formato de 2 columnas (etiqueta | cifra en
  // negrita VERDE_OSCURO, alineada a la derecha) que ya usaba el desglose
  // de desistimientos más abajo en el documento, ahora reutilizado también
  // para cada gráfico de arriba.
  function filasConteo(data){
    return data.map(d => new TableRow({
      children: [
        new TableCell({ width:{size:60,type:WidthType.PERCENTAGE}, margins:{top:60,bottom:60,left:80,right:80}, children:[ new Paragraph({ children:[ new TextRun({ text:d.label, size:19, color:TEXTO }) ] }) ] }),
        new TableCell({ width:{size:40,type:WidthType.PERCENTAGE}, margins:{top:60,bottom:60,left:80,right:80}, children:[ new Paragraph({ alignment:AlignmentType.RIGHT, children:[ new TextRun({ text:String(d.value), bold:true, size:19, color:VERDE_OSCURO }) ] }) ] }),
      ],
    }));
  }

  function seccionImagen(texto, png, emptyMsg, data){
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
    if(data && data.length){
      parrafos.push(new Table({ width:{size:70,type:WidthType.PERCENTAGE}, rows: filasConteo(data) }));
    }
    return parrafos;
  }

  const filasDesglose = desistimientosPorEstado.map(d => new TableRow({
    children: [
      new TableCell({ width:{size:60,type:WidthType.PERCENTAGE}, margins:{top:60,bottom:60,left:80,right:80}, children:[ new Paragraph({ children:[ new TextRun({ text:d.label, size:19, color:TEXTO }) ] }) ] }),
      new TableCell({ width:{size:40,type:WidthType.PERCENTAGE}, margins:{top:60,bottom:60,left:80,right:80}, children:[ new Paragraph({ alignment:AlignmentType.RIGHT, children:[ new TextRun({ text:'$ '+fmtMonto(d.valor), bold:true, size:19, color:VERDE_OSCURO }) ] }) ] }),
    ],
  }));

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: convertMillimetersToTwip(MARGEN_SUPERIOR_MEMBRETE_MM), bottom: convertMillimetersToTwip(MARGEN_INFERIOR_MEMBRETE_MM), left: convertMillimetersToTwip(20), right: convertMillimetersToTwip(20) } },
      },
      headers: {
        default: headerMembrete,
      },
      children: [
        // Encabezado de carta formal (2026-10-01, pedido explícito del
        // usuario, con un ejemplo real de carta pegado como referencia:
        // "incluye un encabezado así, mejóralo a tu criterio"). El
        // destinatario (Doctor/a, nombre, cargo) varía según quién esté a
        // cargo en cada Entidad en el momento — un dato que no se guarda en
        // ningún lado del portal — así que queda como "XXX" para llenar a
        // mano antes de enviarla (pedido explícito: "reemplaza los nombres
        // por xxx para después... depende quien esté"). Lo que SÍ se conoce
        // (fecha, Entidad, cantidad de procesos) se llena real, no con "XXX".
        new Paragraph({ spacing:{before:200, after:280}, children: [ new TextRun({ text: `Bogotá D.C., ${fechaLarga(hoy)}`, size:21, color:TEXTO }) ] }),
        new Paragraph({ spacing:{after:0}, children: [ new TextRun({ text: 'Doctor(a)', size:21, color:TEXTO }) ] }),
        new Paragraph({ spacing:{after:0}, children: [ new TextRun({ text: 'XXX', bold:true, size:21, color:TEXTO }) ] }),
        new Paragraph({ spacing:{after:220}, children: [ new TextRun({ text: `XXX — ${titulo}`, size:21, color:TEXTO }) ] }),
        new Paragraph({ spacing:{after:220}, children: [ new TextRun({ text: `Asunto: Informe ejecutivo de gestión legal — ${titulo}`, bold:true, size:23, color:VERDE_OSCURO, font:'Georgia' }) ] }),
        new Paragraph({ spacing:{after:220}, children: [ new TextRun({ text: 'Respetado(a) Doctor(a):', size:21, color:TEXTO }) ] }),
        new Paragraph({ spacing:{after:160}, children: [ new TextRun({ text: `En mi calidad de representante legal de la empresa MD ABOGADOS SAS, me permito informarle que mi representada tiene a la fecha, con corte al ${fechaLarga(hoy)}, la representación judicial en ${filas.length} proceso${filas.length===1?'':'s'} judicial${filas.length===1?'':'es'} correspondiente${filas.length===1?'':'s'} a ${titulo}, según se relaciona en el presente informe, en el que aparece el estado de los procesos y demás asuntos relevantes.`, size:21, color:TEXTO }) ] }),
        new Paragraph({ spacing:{after:200}, children: [ new TextRun({ text: `Los ${filas.length} proceso${filas.length===1?'':'s'} citado${filas.length===1?'':'s'} se discrimina${filas.length===1?'':'n'} así:`, size:21, color:TEXTO }) ] }),
        new Table({
          width: { size:100, type: WidthType.PERCENTAGE },
          rows: [ new TableRow({ children: [
            celdaResumen('Procesos activos', String(filas.length)),
            celdaResumen('Valor cartera actual', '$ '+fmtMonto(valorCartera)),
            celdaResumen('Total desistimientos', '$ '+fmtMonto(valorDesistimientos)),
          ]}) ],
        }),

        ...seccionImagen('Naturaleza del Proceso', pngNaturaleza, 'No hay datos de Naturaleza del Proceso.', dataNaturaleza),
        ...seccionImagen('Procesos Admitidos', pngAdmitida, 'No hay datos de Admitida.', dataAdmitida),
        ...seccionImagen('Subclasificación', pngSubclasificacion, 'No hay datos de Subclasificación.', dataSubclasificacion),
        ...seccionImagen('Procesos con Prueba Pericial', pngPrueba, 'No hay datos de Prueba Pericial.', dataPrueba),

        tituloSeccion('Total de desistimientos'),
        new Paragraph({ spacing:{after:100}, children: [ new TextRun({ text: `${desistimientosTodos.length} desistimiento${desistimientosTodos.length===1?'':'s'} registrado${desistimientosTodos.length===1?'':'s'} · $ ${fmtMonto(valorDesistimientos)}`, bold:true, size:21, color:VERDE_OSCURO }) ] }),
        ...(desistimientosTodos.length ? [ new Table({ width:{size:70,type:WidthType.PERCENTAGE}, rows: filasDesglose }) ] : [ new Paragraph({ spacing:{after:160}, children:[ new TextRun({ text:'No hay desistimientos para estos procesos.', italics:true, size:19, color:GRIS_SUAVE }) ] }) ]),

        ...seccionImagen('Desistimientos', pngDesistimientos, 'No hay desistimientos para estos procesos.', dataDesistimientosEstado),

        new Paragraph({ spacing:{before:360, after:120}, children: [ new TextRun({ text:'Cordial saludo,', size:21, color:TEXTO }) ] }),
        new Paragraph({ spacing:{after:200}, children: [] }),
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
