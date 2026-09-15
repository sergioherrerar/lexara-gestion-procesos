// Genera un PDF directo (sin el cuadro de impresión del navegador) a partir
// de un nodo del DOM ya armado con su diseño final — usado por el botón
// "Guardar en PDF" de Facturas/Órdenes de compra. Pedido explícito del
// usuario 2026-09-15: antes ese botón abría el diálogo de impresión
// (window.print — el usuario elegía "Guardar como PDF" a mano); ahora crea
// el archivo y lo manda directo a Descargas.
//
// "Fotografía" el nodo con html2canvas (ese nodo, ".print-sheet" — ver
// styles.css — vive SIEMPRE renderizado con su diseño final, solo sacado de
// la pantalla con position:fixed, no display:none, que le impediría a
// html2canvas medirlo) y esa imagen se pega en una sola página de jsPDF del
// mismo tamaño (A4, 210×297mm — igual que el diseño del membrete). Nota
// 2026-09-15: se llama a html2canvas MANUALMENTE en vez de usar el método
// jsPDF.html() (que lo hace por dentro) — ese método calculaba mal la
// escala en la práctica y generaba archivos de más de 30MB, rotos; llamando
// html2canvas directo y pegando la imagen ya del tamaño correcto (el nodo
// siempre mide 210×297mm reales) el archivo sale del tamaño normal.
export async function generarPdfDesdeNodo(nodoId, nombreArchivo){
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const nodo = document.getElementById(nodoId);
  if(!nodo) throw new Error(`No se encontró el contenido a convertir en PDF ("${nodoId}").`);
  const canvas = await html2canvas(nodo, { scale:2, useCORS:false, backgroundColor:'#ffffff' });
  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  // Protegido contra modificaciones — mismo criterio que el resto de PDF del
  // portal (ver prepararDocumentoPDF en informesPDF.js, pedido explícito del
  // usuario 2026-08-22, recordado 2026-09-15 para que aplique también acá):
  // se puede abrir e imprimir sin contraseña, pero editarlo requiere la
  // contraseña de propietario, que no se entrega a nadie.
  const doc = new jsPDF({
    unit:'mm', format:'a4',
    encryption: {
      userPassword: '',
      ownerPassword: 'LexaraMD-2026-NoEditar',
      userPermissions: ['print', 'copy'],
    },
  });
  doc.addImage(imgData, 'JPEG', 0, 0, 210, 297);
  doc.save(nombreArchivo.toLowerCase().endsWith('.pdf') ? nombreArchivo : `${nombreArchivo}.pdf`);
}

// Espera a que una imagen (membrete/QR) termine de cargar antes de
// rasterizar — si no, sale en blanco en el PDF (la carrera entre la carga de
// la imagen y la captura; html2canvas no espera imágenes que aún no
// dispararon su evento load). Mismo criterio que ya usaban FacturaDrawer/
// OrdenCompraDrawer con window.print().
export function precargarImagen(src){
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}
