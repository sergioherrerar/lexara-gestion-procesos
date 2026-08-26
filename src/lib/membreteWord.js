// Encabezado de membrete compartido entre los distintos .docx que genera la
// app (Dashboard > Análisis por Entidad, Procesos judiciales > Impulso
// Procesal, y los que vengan después) — antes cada archivo tenía su propia
// copia de este recorte, con un tamaño distinto "a ojo". Extraído 2026-08-26
// (pedido explícito del usuario, comparando un Word real contra un PDF real:
// "ajusta un poco el encabezado ya que esta un poco pequeño, guiate por el
// pdf" — y luego "de igual forma para el formato de Word que saca desde los
// procesos judiciales").
//
// Recorta solo la franja superior del membrete completo (logo + figura
// decorativa) — la imagen original está pensada para una hoja A4 entera
// (ver membreteParaPDF en informesPDF.js, que la usa completa como fondo de
// página), con una franja dorada inclinada al final que no tiene sentido
// repetir como encabezado de página en un Word.
import membreteLexara from '../assets/Membrete Lexara.png';

// Misma proporción que CONTENIDO_Y_INICIAL/297mm en informesPDF.js (76/297)
// — para que el encabezado corte justo donde el PDF real empieza su
// contenido, en vez de un porcentaje fijo a ojo (antes 0.23, algo más corto
// que el logo real).
const PROPORCION_ENCABEZADO = 76 / 297;
// Ancho del área de contenido de una página A4 (tamaño por defecto de
// `docx` cuando no se fija `pgSz` explícito, confirmado inspeccionando el
// .docx real generado — 210mm), con ~20mm de margen a cada lado, convertido
// a px @ 96dpi — el encabezado ocupa casi todo ese ancho (con un poco de
// aire para no desbordar el margen derecho). Antes quedaba fijo en 420px
// (poco más de la mitad), por eso se veía chico comparado con el PDF (ahí
// el membrete cubre la hoja completa, sin margen).
export const ANCHO_MEMBRETE_WORD = 620;

function membreteEncabezadoPng(url){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = Math.round(img.naturalHeight * PROPORCION_ENCABEZADO);
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

function dataUrlABytes(dataUrl){
  const base64 = dataUrl.split(',')[1];
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for(let i=0; i<binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

// Arma el <Header> de docx, listo para `sections[0].headers.default`. Recibe
// las clases de `docx` ya importadas por quien llama (Header/ImageRun/
// Paragraph/AlignmentType) para no repetir el import dinámico de la
// librería en cada archivo. Devuelve también `alturaMm` (alto real del
// encabezado ya renderizado, en mm) para que quien llama pueda dejarle
// suficiente margen superior al cuerpo y que no se encimen.
export async function crearHeaderMembreteWord({ Header, ImageRun, Paragraph, AlignmentType }){
  const membrete = await membreteEncabezadoPng(membreteLexara);
  const membreteBytes = dataUrlABytes(membrete.dataUrl);
  const altoPx = Math.round(ANCHO_MEMBRETE_WORD * membrete.h / membrete.w);
  const header = new Header({ children: [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new ImageRun({ type:'png', data: membreteBytes, transformation: { width: ANCHO_MEMBRETE_WORD, height: altoPx } }),
    ]}),
  ]});
  const alturaMm = Math.round((altoPx / 96) * 25.4);
  return { header, alturaMm };
}
