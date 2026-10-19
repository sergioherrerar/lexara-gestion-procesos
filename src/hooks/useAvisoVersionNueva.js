import { useEffect, useRef } from 'react';

// Avisa cuando se publicó una versión NUEVA del portal y esta pestaña sigue con la vieja (2026-10-21: «Failed to fetch dynamically imported module …/jspdf.es.min-XXXX.js» al
// guardar correos). Cada publicación cambia los nombres de los archivos del portal; una pestaña abierta desde antes pide archivos que ya no existen. Cada 5 minutos y al volver a la
// pestaña se mira el índice publicado y, si apunta a otro archivo principal, se avisa que hay que recargar (Ctrl + F5).
const CADA_MS = 5 * 60 * 1000;
const archivoPrincipal = html => { const m = /assets\/index-[A-Za-z0-9_-]+\.js/.exec(html || ''); return m ? m[0] : ''; };

export function useAvisoVersionNueva(notify, activo = true){
  const avisado = useRef('');
  useEffect(() => {
    if(!activo || typeof window === 'undefined') return undefined;
    const cargado = (() => { const s = document.querySelector('script[type="module"][src*="assets/index-"]'); return s ? archivoPrincipal(s.getAttribute('src')) : ''; })();
    if(!cargado) return undefined;   // en desarrollo (vite dev) no hay archivos con código: no se revisa
    let vivo = true;
    async function revisar(){
      try{
        const url = window.location.href.split('#')[0].split('?')[0];
        const res = await fetch(url, { cache: 'no-store' });
        if(!res.ok) return;
        const publicado = archivoPrincipal(await res.text());
        if(vivo && publicado && publicado !== cargado && avisado.current !== publicado){
          avisado.current = publicado;
          notify?.('Hay una versión NUEVA del portal. Recarga la página con Ctrl + F5 para usarla; si no, algunas funciones (guardar correos, informes, PDF) pueden fallar.', 'info');
        }
      }catch(e){ /* sin conexión: se vuelve a intentar */ }
    }
    const id = setInterval(revisar, CADA_MS);
    const alVolver = () => { if(document.visibilityState === 'visible') revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    const primero = setTimeout(revisar, 20000);
    return () => { vivo = false; clearInterval(id); clearTimeout(primero); document.removeEventListener('visibilitychange', alVolver); };
  }, [activo, notify]);
}
