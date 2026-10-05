// Selección de los adjuntos que se le mandan a LexIA para "Extraer con LexIA"
// (2026-10-06, error real reportado por el usuario: "Error de la API de
// Claude (código 400): prompt is too long: 1055993 tokens > 1000000
// maximum"). Antes se mandaban TODOS los PDF/imágenes del correo — un solo
// adjunto largo (una historia clínica de cientos de folios, por ejemplo)
// bastaba para pasarse del límite de la API, y además cada página se cobra
// (~2.000-3.000 tokens). Los datos que se extraen (accionante, juzgado,
// fechas, qué solicita, vinculados…) están en el escrito de tutela y el auto
// del juzgado, no en los anexos largos — así que se manda primero lo más
// probable, con un tope de páginas, y lo que no cabe se omite y se avisa
// (sigue disponible con el botón "Extraer adjuntos", que guarda TODO en
// OneDrive sin tope).

// Tope de páginas por PDF y en total (una imagen cuenta como 1 página).
export const PAGINAS_MAX_POR_PDF = 60;
export const PAGINAS_MAX_TOTAL = 80;

// Nombres de archivo que casi seguro son el documento principal vs. anexos.
const RE_PRINCIPAL = /tutela|escrito|demanda|acci[oó]n|auto|admi[st]|avoca|oficio|notifica|requerimiento|fallo|sentencia/i;
const RE_ANEXO = /historia|anexo|prueba|c[eé]dula|folio|soporte|epicrisis|laboratorio|f[oó]rmula|orden.?m[eé]dica|imagen|foto/i;

function prioridadPorNombre(nombre){
  const n = String(nombre || "");
  if(RE_PRINCIPAL.test(n)) return 0;
  if(RE_ANEXO.test(n)) return 2;
  return 1;
}

function base64ABytes(base64){
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for(let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

let pdfjsListo = null;
async function cargarPdfjs(){
  if(!pdfjsListo){
    pdfjsListo = (async () => {
      const pdfjsLib = await import('pdfjs-dist');
      const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjsLib;
    })();
  }
  return pdfjsListo;
}

// Páginas reales del PDF; si no se puede abrir (p.ej. protegido con
// contraseña — el robot sí sabe desprotegerlo), se estima por el tamaño
// (~50 KB por página) para no dejarlo fuera a ciegas.
async function paginasDePdf(base64){
  try{
    const pdfjsLib = await cargarPdfjs();
    const pdf = await pdfjsLib.getDocument({ data: base64ABytes(base64) }).promise;
    const n = pdf.numPages;
    pdf.destroy?.();
    return { paginas: n, estimada: false };
  }catch{
    return { paginas: Math.max(1, Math.round((base64.length * 0.75) / 50000)), estimada: true };
  }
}

/**
 * Devuelve `{ seleccionados, omitidos }`: `seleccionados` son los adjuntos
 * (PDF/imagen) que caben en el presupuesto de páginas, primero los que por
 * su nombre parecen el documento principal; `omitidos` lista, con motivo,
 * los que se dejaron por ser demasiado largos o por no caber.
 */
export async function seleccionarAdjuntosParaLexIA(adjuntos){
  const candidatos = [];
  for(const [orden, a] of (adjuntos || []).entries()){
    const tipo = String(a.tipo || "");
    const esImagen = tipo.startsWith('image/');
    const esPdf = tipo === 'application/pdf';
    if(!a.base64 || !(esImagen || esPdf)) continue; // el robot ignora Excel/Word/etc.
    const { paginas, estimada } = esPdf ? await paginasDePdf(a.base64) : { paginas: 1, estimada: false };
    candidatos.push({ a, orden, paginas, estimada, prioridad: prioridadPorNombre(a.nombre) });
  }
  candidatos.sort((x, y) => x.prioridad - y.prioridad || x.orden - y.orden);

  const seleccionados = [];
  const omitidos = [];
  let usadas = 0;
  for(const c of candidatos){
    const etiqueta = `${c.estimada ? "≈" : ""}${c.paginas} pág.`;
    if(c.paginas > PAGINAS_MAX_POR_PDF){
      omitidos.push({ nombre: c.a.nombre, motivo: `muy largo (${etiqueta})` });
    } else if(usadas + c.paginas > PAGINAS_MAX_TOTAL){
      omitidos.push({ nombre: c.a.nombre, motivo: `no cabe en el límite total (${etiqueta})` });
    } else {
      seleccionados.push(c.a);
      usadas += c.paginas;
    }
  }
  return { seleccionados, omitidos };
}
