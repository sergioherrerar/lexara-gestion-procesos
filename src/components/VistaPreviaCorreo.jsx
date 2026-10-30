// Vista previa de un correo (HTML) dentro de un cuadro aislado. Todas las ventanas de correo (felicitaciones, novedades de nómina, gastos, pagos por realizar, solicitudes
// de factura/orden y Órdenes Colmédica) la usan.
//
// Bug real (2026-10-30, reporte del usuario con una captura de «Pagos por realizar»): la vista previa salía en BLANCO. El contenido cambia apenas se abre la ventana (primero
// sin la imagen de la firma y, cuando termina de cargar, con ella): al cambiar el `srcDoc` de un mismo <iframe> con `sandbox` el navegador se quedaba con el cuadro vacío.
// Con una `key` que depende del contenido, React crea un cuadro NUEVO por cada versión del correo y siempre se dibuja.
function huella(texto){
  let h = 5381;
  for(let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return h + ':' + texto.length;
}

export default function VistaPreviaCorreo({ html, titulo, style }){
  const contenido = html || '';
  return <iframe key={huella(contenido)} title={titulo} className="felicitacion-vista" srcDoc={contenido} sandbox="" style={style} />;
}
