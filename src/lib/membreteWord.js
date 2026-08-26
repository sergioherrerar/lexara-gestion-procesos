// Encabezado de membrete compartido entre los distintos .docx que genera la
// app (Dashboard > Análisis por Entidad, Procesos judiciales > Impulso
// Procesal, y los que vengan después). Extraído 2026-08-26 (pedido explícito
// del usuario, comparando un Word real contra un PDF real: "ajusta un poco
// el encabezado ya que esta un poco pequeño, guiate por el pdf" — y luego
// "de igual forma para el formato de Word que saca desde los procesos
// judiciales").
//
// Primer intento (recortar el membrete en 2 pedazos — franja superior para
// el Header, franja dorada inferior para el Footer, cada uno centrado e
// INLINE dentro de su propio párrafo) quedó descartado: el usuario mandó la
// plantilla .docx REAL que ya usa el despacho para sus cartas
// ("Membrete Lexara.docx", pedido explícito: "si le metes el formato al
// proyecto te queda mas facil asi") — y esa plantilla NO recorta nada: pega
// el membrete COMPLETO (el mismo PNG que membreteLexara, sin tocar) como una
// imagen FLOTANTE de tamaño página completa, anclada al Header pero
// posicionada `relativeFrom: 'page'` y `behindDocument: true` — exactamente
// el mismo truco que ya usan los PDF (`doc.addImage(..., 0, 0, pageWidth,
// pageHeight, ...)` en informesPDF.js). Así el logo arriba Y la franja
// dorada abajo salen de la MISMA imagen/inserción, sin recortes ni cálculos
// de alto — más simple y más fiel al PDF que el primer intento.
import membreteLexara from '../assets/Membrete Lexara.png';

// Tamaño de página A4 (210×297mm) a 96dpi — tamaño por defecto de `docx`
// cuando no se fija `pgSz` explícito (confirmado inspeccionando el .docx
// real generado por esta app). Si algún documento nuevo llegara a fijar su
// propio `pgSz` distinto, estos 2 valores tendrían que pasarse aparte.
export const ANCHO_PAGINA_PX = 794;
export const ALTO_PAGINA_PX = 1123;

// Mismo criterio que CONTENIDO_Y_INICIAL/CONTENIDO_Y_MAXIMO de los PDF (ver
// informesPDF.js) — cuánto espacio dejar libre arriba (logo) y abajo (franja
// dorada) del membrete completo antes de que el cuerpo del texto pueda
// empezar/tenga que terminar.
export const MARGEN_SUPERIOR_MEMBRETE_MM = 76;
export const MARGEN_INFERIOR_MEMBRETE_MM = 297 - 268;

async function bytesDelMembrete(){
  const res = await fetch(membreteLexara);
  return new Uint8Array(await res.arrayBuffer());
}

// Arma el <Header> de docx con el membrete completo como imagen flotante de
// página — listo para `sections[0].headers.default`. Recibe las clases de
// `docx` ya importadas por quien llama, para no repetir el import dinámico
// de la librería en cada archivo.
export async function crearHeaderMembreteWord({ Header, ImageRun, Paragraph, HorizontalPositionAlign, HorizontalPositionRelativeFrom, VerticalPositionAlign, VerticalPositionRelativeFrom, TextWrappingType }){
  const data = await bytesDelMembrete();
  const header = new Header({ children: [
    new Paragraph({ children: [
      new ImageRun({
        type: 'png',
        data,
        transformation: { width: ANCHO_PAGINA_PX, height: ALTO_PAGINA_PX },
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
          verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: VerticalPositionAlign.TOP },
          behindDocument: true,
          wrap: { type: TextWrappingType.NONE },
        },
      }),
    ]}),
  ]});
  return header;
}
