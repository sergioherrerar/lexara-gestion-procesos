import { useState, useEffect, useRef } from 'react';
import { ITEMS } from '../../menu-sitio/items.mjs';
import logoMenu from '../assets/Logo verde OScuro.png';
import '../../menu-sitio/menu-sitio.css';

// Menú principal de www.lexaraabogados.com, igual que en el inicio de cada sección (2026-11-13). Mismo marcado y mismos estilos que las páginas estáticas
// (menu-sitio/menu-sitio.css); los enlaces salen de menu-sitio/items.mjs. `activo`: clave de la opción de esta sección (aquí «portal-lexara»).
export default function SiteMenu({ activo = 'portal-lexara' }){
  const [abierto, setAbierto] = useState(false);
  const [subAbierto, setSubAbierto] = useState(false);
  const barra = useRef(null);

  useEffect(() => {
    const fuera = ev => { if(barra.current && !barra.current.contains(ev.target)){ setSubAbierto(false); setAbierto(false); } };
    const tecla = ev => { if(ev.key === 'Escape'){ setSubAbierto(false); setAbierto(false); } };
    const ancho = () => { if(window.innerWidth > 980) setAbierto(false); };
    document.addEventListener('click', fuera); document.addEventListener('keydown', tecla); window.addEventListener('resize', ancho);
    return () => { document.removeEventListener('click', fuera); document.removeEventListener('keydown', tecla); window.removeEventListener('resize', ancho); };
  }, []);

  return (
    <header className={'msitio' + (abierto ? ' abierto' : '')} id="menu-sitio" ref={barra}>
      <div className="msitio-in">
        <a className="msitio-logo" href={ITEMS[0].url} aria-label="Lexara Abogados — ir al inicio"><img src={logoMenu} alt="Lexara Abogados" /></a>
        <nav className="msitio-nav" id="msitio-nav" aria-label="Menú principal de Lexara Abogados">
          <ul>
            {ITEMS.map(it => it.sub ? (
              <li key={it.clave} className={'tiene-sub' + (subAbierto ? ' sub-abierto' : '')}>
                <a href={it.url} className={'msitio-sub-btn' + (it.clave === activo ? ' activo' : '')} aria-haspopup="true" aria-expanded={subAbierto}
                   onClick={e => { e.preventDefault(); setSubAbierto(v => !v); }}>
                  {it.etiqueta}
                  <svg className="msitio-flecha" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 4.2 6 8l4-3.8" /></svg>
                </a>
                <ul className="msitio-sub">
                  {it.sub.map(s => <li key={s.url}><a href={s.url}>{s.etiqueta}</a></li>)}
                </ul>
              </li>
            ) : (
              <li key={it.clave}><a href={it.url} className={it.clave === activo ? 'activo' : undefined} aria-current={it.clave === activo ? 'page' : undefined}>{it.etiqueta}</a></li>
            ))}
          </ul>
        </nav>
        <button type="button" className="msitio-burger" aria-label={abierto ? 'Cerrar el menú' : 'Abrir el menú'} aria-expanded={abierto} aria-controls="msitio-nav"
                onClick={() => { setAbierto(v => !v); setSubAbierto(false); }}>
          <span /><span /><span />
        </button>
      </div>
    </header>
  );
}
