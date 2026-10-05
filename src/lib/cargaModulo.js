// Carga diferida (React.lazy) que sobrevive a una publicación nueva.
//
// Cada publicación cambia los nombres de los archivos del portal (llevan un
// código que cambia en cada build). Una pestaña que quedó abierta desde antes
// sigue apuntando a los nombres viejos, que ya no existen: al abrir un módulo
// de carga diferida (Informes, Administración, Leer correo…) salía "Algo salió
// mal — Failed to fetch dynamically imported module" (reportado por el usuario
// 2026-10-05, justo después de publicar). Ahora, si falla esa carga, la página
// se recarga UNA vez sola (trae la versión nueva) en vez de mostrar el error;
// si vuelve a fallar tras recargar, sí se muestra el error normal.
const CLAVE = 'lexara-recarga-por-version-nueva';

export function cargarModulo(importar){
  return () => importar().catch(err => {
    try{
      if(!sessionStorage.getItem(CLAVE)){
        sessionStorage.setItem(CLAVE, '1');
        window.location.reload();
        // Promesa que nunca se resuelve: la página se está recargando.
        return new Promise(() => {});
      }
    }catch{ /* sin sessionStorage: se muestra el error normal */ }
    throw err;
  });
}

// Se llama cuando la app ya cargó bien: así la próxima publicación vuelve a
// poder recargar sola una vez.
export function marcarCargaCorrecta(){
  setTimeout(() => { try{ sessionStorage.removeItem(CLAVE); }catch{ /* nada */ } }, 15000);
}
