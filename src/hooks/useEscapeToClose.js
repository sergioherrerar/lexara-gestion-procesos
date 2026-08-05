import { useEffect } from 'react';

// Cierra un drawer/modal con la tecla Escape — antes solo se podía con el
// mouse (botón X o "Cancelar"), sin ninguna salida por teclado.
export function useEscapeToClose(active, onClose){
  useEffect(() => {
    if(!active) return;
    function onKeyDown(e){ if(e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, onClose]);
}
