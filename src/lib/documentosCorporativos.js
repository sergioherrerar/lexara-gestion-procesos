// "Diligenciamiento Formatos Empresas" (Informes > Herramientas) — agregada
// 2026-09-11, pedido explícito del usuario: cuando un banco/cliente/EPS pide
// que MD Abogados llene su propio "formato de vinculación de proveedores",
// casi siempre hay que adjuntar los mismos documentos corporativos (Cámara
// de Comercio, RUT, certificación bancaria, etc.) — esta herramienta arma
// automático un ZIP con los que el usuario elija, en vez de ir a buscarlos
// uno por uno cada vez. Ver DOCUMENTOS_CORPORATIVOS_TIPOS/_URL en config.js
// y las funciones de carpeta compartida en graph.js.
import { descargarContenidoArchivo } from './graph';

export async function generarZipDocumentosCorporativos(documentos, nombreZip){
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for(const doc of documentos){
    const buffer = await descargarContenidoArchivo(doc.archivo);
    zip.file(doc.archivo.name, buffer);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${nombreZip}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Lectura automática de la Cámara de Comercio — pedido explícito del
// usuario 2026-09-11 ("toda la información está la carpeta... por ende
// todos los datos"): en vez de escribir Dirección/Teléfono/Correo/Actividad
// económica a mano en la ficha (y que se desactualicen), se leen del
// certificado real cada vez que se carga la lista de documentos. Se probó
// contra el certificado real de MD Abogados (25 de julio de 2026) — el PDF
// SÍ tiene texto seleccionable (no es un escaneo), así que esto funciona de
// forma confiable. Estados Financieros NO se lee así — su tabla queda muy
// revuelta al extraer el texto plano (columnas 2025/2024 se desordenan) y
// el riesgo de tomar un número equivocado es real, así que esos 3 valores
// (Activos/Pasivos/Patrimonio) se dejaron fijos en FICHA_EMPRESA_MD para
// que el usuario los actualice a mano una vez al año.
export async function extraerTextoPDF(arrayBuffer){
  const pdfjsLib = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let texto = "";
  for(let i = 1; i <= pdf.numPages; i++){
    const page = await pdf.getPage(i);
    const contenido = await page.getTextContent();
    texto += contenido.items.map(it => it.str).join(" ") + " ";
  }
  // pdfjs junta cada trozo pequeño de texto (a veces por sílaba) con espacios
  // de sobra — bug real encontrado probando contra el certificado real de MD:
  // quedaban 2-3 espacios entre palabras ("Correo   electrónico"), y como las
  // etiquetas de abajo escriben un solo espacio literal entre palabras,
  // ninguna hacía match. Se colapsan a un solo espacio ANTES de buscar nada.
  return texto.replace(/\s+/g, " ");
}

// Cada campo se busca entre su propia etiqueta y la SIGUIENTE etiqueta
// conocida del documento (no por salto de línea — pdfjs no conserva
// líneas, todo el texto de la página queda unido con espacios) — así
// funciona sin importar si el valor real ocupa 1 o varias líneas en el PDF
// original (ej. la dirección real de MD viene partida en 2 líneas:
// "Avenida Carrera 14 No. 47 - 39" + "Torre A Oficina 5").
function entreEtiquetas(texto, etiqueta, siguientes){
  const patron = new RegExp(`${etiqueta}\\s*:?\\s*([\\s\\S]+?)(?=${siguientes.join("|")}|$)`, "i");
  const m = patron.exec(texto);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

export function extraerDatosCamaraComercio(texto){
  const direccion = entreEtiquetas(texto, "Direcci[oó]n del domicilio\\s*principal", ["Municipio:", "Correo electr[oó]nico:"]);
  const municipio = entreEtiquetas(texto, "Direcci[oó]n del domicilio\\s*principal:[\\s\\S]+?Municipio", ["Correo electr[oó]nico:"]);
  const correo = entreEtiquetas(texto, "Correo electr[oó]nico", ["Tel[eé]fono comercial 1:"]);
  const telefono = entreEtiquetas(texto, "Tel[eé]fono comercial 1", ["Tel[eé]fono comercial 2:"]);
  const ciiuMatch = /Actividad principal C[oó]digo CIIU:\s*(\d+)/i.exec(texto);
  return {
    direccion: direccion ? `${direccion}${municipio ? ", " + municipio : ""}` : null,
    telefono,
    correo,
    actividadEconomica: ciiuMatch ? ciiuMatch[1] : null,
  };
}
