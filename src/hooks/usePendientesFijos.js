import { useState, useEffect, useRef, useCallback } from 'react';
import { listarEnviadosPorCategoria } from '../lib/graph';
import { CATEGORIAS_FIJAS, leerHechas, guardarHecha } from '../lib/pendientesFijosMes';

// Pendientes fijos de cada mes de Soporte (ver pendientesFijosMes.js): revisa «Elementos enviados» de Soporte por cada categoría (para quitar solos los que ya se enviaron)
// y guarda los «Hecho» manuales. `activo`: solo se consulta si la persona es Soporte y hay sesión real. Se revisa al abrir la campana, como máximo cada 5 minutos.
const BUZON_SOPORTE = 'soporte@lexaraabogados.com';
const ESPERA_MS = 5 * 60 * 1000;

export default function usePendientesFijos(activo){
  const [enviados, setEnviados] = useState({});
  const [hechas, setHechas] = useState(() => leerHechas());
  const [revisado, setRevisado] = useState(false);
  const ultima = useRef(0);

  const revisar = useCallback(async (forzar) => {
    if(!activo) return;
    if(!forzar && Date.now() - ultima.current < ESPERA_MS) return;
    ultima.current = Date.now();
    const nuevo = {};
    // De a una: la API de Graph limita las consultas simultáneas sobre un mismo buzón. Si una categoría falla, las demás se revisan igual (el «Hecho» manual queda como respaldo).
    for(const cat of CATEGORIAS_FIJAS){
      try{ nuevo[cat] = await listarEnviadosPorCategoria(cat, BUZON_SOPORTE); }
      catch(err){ console.error('Pendientes fijos: no se pudo revisar Enviados de «' + cat + '»', err); }
    }
    setEnviados(nuevo);
    setRevisado(true);
  }, [activo]);

  useEffect(() => { revisar(false); }, [revisar]);

  const marcarHecha = useCallback((clave, fecha) => setHechas(guardarHecha(clave, fecha)), []);
  return { enviados, hechas, revisado, revisar, marcarHecha };
}
