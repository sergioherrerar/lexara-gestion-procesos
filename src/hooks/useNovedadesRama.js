import { useState, useEffect, useCallback, useMemo } from 'react';
import { procesosParaRevisar, revisarRama, novedadesGuardadas, marcarRamaVista } from '../lib/novedadesRama';

// Novedades de la Rama Judicial para la campana: revisa una vez al día (unos segundos después de cargar los procesos) y expone la lista.
export function useNovedadesRama({ procesos, nombre, liveMode, url, todos = false }){
  const lista = useMemo(() => (liveMode && nombre ? procesosParaRevisar(procesos, nombre, todos) : []), [procesos, nombre, liveMode, todos]);
  const [novedades, setNovedades] = useState([]);
  const [revisando, setRevisando] = useState(false);
  const habilitado = !!(liveMode && nombre && url);
  const cantidad = lista.length;

  useEffect(() => {
    if(!habilitado || !cantidad){ setNovedades([]); return undefined; }
    setNovedades(novedadesGuardadas(nombre, lista));
    let cancelado = false;
    const t = setTimeout(async () => {
      try{
        setRevisando(true);
        const r = await revisarRama({ url, lista, usuario: nombre });
        if(!cancelado) setNovedades(r);
      }catch(e){ console.warn('Novedades de la Rama:', e); }
      finally{ if(!cancelado) setRevisando(false); }
    }, 6000);
    return () => { cancelado = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habilitado, cantidad, nombre, url]);

  const marcarVista = useCallback((radicado, fecha) => {
    marcarRamaVista(nombre, radicado, fecha);
    setNovedades(prev => prev.filter(n => n.radicado !== radicado));
  }, [nombre]);

  const revisarAhora = useCallback(async () => {
    if(!habilitado) return;
    setRevisando(true);
    try{ setNovedades(await revisarRama({ url, lista, usuario: nombre, forzar: true })); }catch(e){ console.warn(e); }
    finally{ setRevisando(false); }
  }, [habilitado, url, lista, nombre]);

  return { novedades, revisando, marcarVista, revisarAhora };
}
