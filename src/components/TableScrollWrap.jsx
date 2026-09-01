import { useEffect, useRef, useState } from 'react';

// Envoltorio de tabla con scroll horizontal ARRIBA (además del de abajo, que
// ya trae el `.table-wrap` normal) y scroll vertical con encabezado fijo —
// pedido explícito del usuario 2026-09-01 para Tutelas (2044 registros,
// tabla ancha): antes había que bajar hasta el final de la tabla para
// encontrar la barra de desplazamiento lateral, y bajar toda la página para
// ver más filas. Las dos barras horizontales quedan sincronizadas (mover una
// mueve la otra). `maxHeight` es opcional — por defecto un alto razonable
// para no tener que hacer scroll de toda la página.
export default function TableScrollWrap({ children, maxHeight = '70vh' }){
  const topRef = useRef(null);
  const bottomRef = useRef(null);
  const [anchoContenido, setAnchoContenido] = useState(0);
  const sincronizando = useRef(false);

  useEffect(() => {
    function medir(){
      if(bottomRef.current) setAnchoContenido(bottomRef.current.scrollWidth);
    }
    medir();
    const obs = new ResizeObserver(medir);
    if(bottomRef.current) obs.observe(bottomRef.current);
    window.addEventListener('resize', medir);
    return () => { obs.disconnect(); window.removeEventListener('resize', medir); };
  }, [children]);

  function onScrollTop(){
    if(sincronizando.current) return;
    sincronizando.current = true;
    bottomRef.current.scrollLeft = topRef.current.scrollLeft;
    sincronizando.current = false;
  }
  function onScrollBottom(){
    if(sincronizando.current) return;
    sincronizando.current = true;
    topRef.current.scrollLeft = bottomRef.current.scrollLeft;
    sincronizando.current = false;
  }

  return (
    <div>
      <div ref={topRef} onScroll={onScrollTop} style={{overflowX:'auto', overflowY:'hidden', height:14}}>
        <div style={{width: anchoContenido, height:1}} />
      </div>
      <div ref={bottomRef} onScroll={onScrollBottom} className="table-wrap" style={{maxHeight, overflowY:'auto'}}>
        {children}
      </div>
    </div>
  );
}
