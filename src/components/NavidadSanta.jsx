import { useEffect } from 'react';
import '../../navidad/navidad.css';
import '../../navidad/navidad.js';
import logoNavidad from '../../navidad/logo-navidad.png';

// Papá Noel con su trineo halando el logo de Lexara al entrar (2026-11-13). La animación vive en navidad/navidad.js (la misma de las demás secciones).
export default function NavidadSanta(){
  useEffect(() => {
    const t = setTimeout(() => { if(window.LexaraNavidad) window.LexaraNavidad.volar({ logo: logoNavidad }); }, 700);
    return () => clearTimeout(t);
  }, []);
  return null;
}
