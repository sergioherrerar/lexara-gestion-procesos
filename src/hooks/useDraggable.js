import { useRef, useState, useCallback } from 'react';

// "Leer correo (IA)"/"Entrenar IA" (2026-09-24, pedido explícito del
// usuario: "que se deje arrastrar la ventana con el clic pulsado") — mueve
// la ventana tomándola desde su encabezado. Usa Pointer Events (mouse Y
// dedo, mismo criterio de paridad PC/celular) con setPointerCapture, así el
// arrastre sigue funcionando aunque el puntero se salga del encabezado
// mientras se mueve rápido — no hace falta escuchar en todo el documento.
export function useDraggable(){
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const estado = useRef({ arrastrando: false, x0: 0, y0: 0, offX0: 0, offY0: 0 });

  const onPointerDown = useCallback((e) => {
    // No arrastrar si el clic empezó en el botón de cerrar (X).
    if(e.target.closest('.drawer-close')) return;
    estado.current = { arrastrando: true, x0: e.clientX, y0: e.clientY, offX0: offset.x, offY0: offset.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [offset]);

  const onPointerMove = useCallback((e) => {
    if(!estado.current.arrastrando) return;
    setOffset({
      x: estado.current.offX0 + (e.clientX - estado.current.x0),
      y: estado.current.offY0 + (e.clientY - estado.current.y0),
    });
  }, []);

  const onPointerUp = useCallback(() => { estado.current.arrastrando = false; }, []);

  return {
    offset,
    dragHandleProps: {
      onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp,
      style: { cursor: 'move', touchAction: 'none', userSelect: 'none' },
    },
  };
}
