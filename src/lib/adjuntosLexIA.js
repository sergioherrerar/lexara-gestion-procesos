// Selección de los adjuntos que se le mandan a LexIA para "Extraer con LexIA"
// (2026-10-06, error real reportado por el usuario: "Error de la API de
// Claude (código 400): prompt is too long: 1055993 tokens > 1000000
// maximum"; luego, revisión pedida por el usuario de "todo lo que puede
// generar errores"). Antes se mandaban TODOS los PDF/imágenes del correo, y
// cualquiera de estos casos hacía que la API rechazara TODA la solicitud
// (no solo ese archivo) y la extracción entera fallara:
//  - un PDF/anexo larguísimo (pasa el límite de 1.000.000 de tokens; además
//    cada página se cobra, ~2.000-3.000 tokens);
//  - una imagen en un formato que la API no acepta (solo JPEG/PNG/GIF/WebP —
//    un TIFF/BMP/HEIC de un escáner o un celular la tumbaba) o de más de 5 MB;
//  - un PDF dañado;
//  - un correo cuyos adjuntos pesan más de lo que el servidor/API reciben;
//  - un PDF real que Outlook marcó como "application/octet-stream" (el robot
//    lo ignoraba en silencio y LexIA nunca lo leía).
// Los datos que se extraen (accionante, juzgado, fechas, qué solicita,
// vinculados…) están en el escrito de tutela y el auto del juzgado, no en los
// anexos largos — así que se manda primero lo más probable, dentro de unos
// topes, y lo que no cabe se omite y se avisa (sigue disponible completo
// en la carpeta de la tutela en OneDrive, que guarda TODO sin topes).

// Tope de páginas por PDF y en total (una imagen cuenta como 1 página).
export const PAGINAS_MAX_POR_PDF = 60;
export const PAGINAS_MAX_TOTAL = 80;
// Límites de peso (la API acepta 5 MB por imagen y 32 MB por solicitud; el
// servidor de cPanel además tiene su propio tope de POST, por eso el total es
// más conservador).
const BYTES_MAX_IMAGEN = 5 * 1024 * 1024;
const BYTES_MAX_PDF = 25 * 1024 * 1024;
const CARACTERES_BASE64_MAX_TOTAL = 20_000_000;

const IMAGENES_SOPORTADAS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const EXTENSION_A_TIPO = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
// Extensiones de documentos que el usuario esperaría que LexIA leyera pero no
// puede — se avisan al omitirlas (el resto, p.ej. firmas .p7s o .ics, se
// ignora en silencio).
const EXTENSIONES_DOCUMENTO_NO_SOPORTADO = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', 'txt', 'rtf', 'odt', 'tif', 'tiff', 'bmp', 'heic', 'heif'];

// Nombres de archivo que casi seguro son el documento principal vs. anexos.
const RE_PRINCIPAL = /tutela|escrito|demanda|acci[oó]n|auto|admi[st]|avoca|oficio|notifica|requerimiento|fallo|sentencia/i;
const RE_ANEXO = /historia|anexo|prueba|c[eé]dula|folio|soporte|epicrisis|laboratorio|f[oó]rmula|orden.?m[eé]dica|imagen|foto/i;

function prioridadPorNombre(nombre){
  const n = String(nombre || "");
  // "Correo original.pdf" es la impresión del cuerpo del correo (2 páginas): lo más útil y barato
  // para responder, siempre va primero (reportado 2026-10-05: en Pregúntame quedaba fuera por el tope
  // de páginas porque otros PDF ya habían llenado el cupo).
  if(/^correo original\.pdf$/i.test(n.trim())) return -1;
  if(RE_PRINCIPAL.test(n)) return 0;
  if(RE_ANEXO.test(n)) return 2;
  return 1;
}

function extensionDe(nombre){
  const m = /\.([a-z0-9]+)$/i.exec(String(nombre || "").trim());
  return m ? m[1].toLowerCase() : "";
}

// Qué es de verdad este adjunto para la API: `{ tipo }` con un tipo que
// Claude acepta, o `{ noSoportado: true, extension }` si no se puede leer.
function clasificar(a){
  const declarado = String(a.tipo || "").toLowerCase().split(";")[0].trim();
  const ext = extensionDe(a.nombre);
  if(declarado === 'application/pdf') return { tipo: 'application/pdf' };
  if(declarado === 'image/jpg') return { tipo: 'image/jpeg' };
  if(IMAGENES_SOPORTADAS.includes(declarado)) return { tipo: declarado };
  // Outlook a veces marca un PDF/foto real como "octet-stream" o sin tipo.
  if((!declarado || declarado === 'application/octet-stream') && EXTENSION_A_TIPO[ext]) return { tipo: EXTENSION_A_TIPO[ext] };
  return { noSoportado: true, extension: ext, declarado };
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

// Páginas reales del PDF. Si está protegido con contraseña se estima por el
// tamaño (~50 KB por página) y se deja pasar — el robot sabe desprotegerlo
// con la cédula. Si el archivo está dañado (la API rechazaría TODA la
// solicitud por él) se marca para omitirlo. Cualquier otro fallo de lectura:
// también se estima, para no dejarlo fuera a ciegas.
async function paginasDePdf(base64){
  try{
    const pdfjsLib = await cargarPdfjs();
    const pdf = await pdfjsLib.getDocument({ data: base64ABytes(base64) }).promise;
    const n = pdf.numPages;
    pdf.destroy?.();
    return { paginas: n, estimada: false };
  }catch(err){
    if(err?.name === 'InvalidPDFException') return { paginas: 0, danado: true };
    return { paginas: Math.max(1, Math.round((base64.length * 0.75) / 50000)), estimada: true, protegido: err?.name === 'PasswordException' };
  }
}

/**
 * Devuelve `{ seleccionados, omitidos }`: `seleccionados` son los adjuntos
 * (PDF/imagen, con el `tipo` ya corregido) que caben en los topes, primero
 * los que por su nombre parecen el documento principal; `omitidos` lista,
 * con motivo, los que se dejaron fuera.
 */
export async function seleccionarAdjuntosParaLexIA(adjuntos, { paginasMaxTotal = PAGINAS_MAX_TOTAL } = {}){
  const candidatos = [];
  const omitidos = [];
  for(const [orden, a] of (adjuntos || []).entries()){
    if(!a.base64) continue;
    const c = clasificar(a);
    if(c.noSoportado){
      if(EXTENSIONES_DOCUMENTO_NO_SOPORTADO.includes(c.extension) || String(c.declarado).startsWith('image/')){
        omitidos.push({ nombre: a.nombre, motivo: `LexIA solo lee PDF e imágenes JPG/PNG/GIF/WebP (este es ${c.extension ? '.' + c.extension : c.declarado})` });
      }
      continue;
    }
    const bytes = Math.round(a.base64.length * 0.75);
    const esPdf = c.tipo === 'application/pdf';
    if(!esPdf && bytes > BYTES_MAX_IMAGEN){
      omitidos.push({ nombre: a.nombre, motivo: `la imagen pesa más de 5 MB (${(bytes / 1048576).toFixed(1)} MB)` });
      continue;
    }
    if(esPdf && bytes > BYTES_MAX_PDF){
      omitidos.push({ nombre: a.nombre, motivo: `pesa demasiado (${(bytes / 1048576).toFixed(1)} MB)` });
      continue;
    }
    const info = esPdf ? await paginasDePdf(a.base64) : { paginas: 1, estimada: false };
    if(info.danado){
      omitidos.push({ nombre: a.nombre, motivo: 'archivo PDF dañado o ilegible' });
      continue;
    }
    candidatos.push({ a: { ...a, tipo: c.tipo }, orden, paginas: info.paginas, estimada: info.estimada, prioridad: prioridadPorNombre(a.nombre) });
  }
  candidatos.sort((x, y) => x.prioridad - y.prioridad || x.orden - y.orden);

  const seleccionados = [];
  let usadas = 0;
  let caracteres = 0;
  for(const c of candidatos){
    const etiqueta = `${c.estimada ? "≈" : ""}${c.paginas} pág.`;
    if(c.paginas > PAGINAS_MAX_POR_PDF){
      omitidos.push({ nombre: c.a.nombre, motivo: `muy largo (${etiqueta})` });
    } else if(usadas + c.paginas > paginasMaxTotal){
      omitidos.push({ nombre: c.a.nombre, motivo: `no cabe en el límite total (${etiqueta})` });
    } else if(caracteres + c.a.base64.length > CARACTERES_BASE64_MAX_TOTAL){
      omitidos.push({ nombre: c.a.nombre, motivo: 'no cabe en el peso máximo del correo' });
    } else {
      seleccionados.push(c.a);
      usadas += c.paginas;
      caracteres += c.a.base64.length;
    }
  }
  return { seleccionados, omitidos };
}
