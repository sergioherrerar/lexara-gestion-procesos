import { useCallback, useEffect, useState } from 'react';

// Voz de LexIA (2026-09-24, pedido explícito del usuario: "podemos darle
// voz y que lea lo que envía") — usa la síntesis de voz nativa del
// navegador (Web Speech API, gratis, sin clave ni servicio nuevo, funciona
// en computador y celular). La preferencia de encendido/apagado queda en
// localStorage para no tener que volver a apagarla cada vez que se abre la
// ventana.
const LEXIA_VOZ_KEY = 'lexia-voz-activada';

export function useLexiaVoz(){
  const [activada, setActivada] = useState(() => {
    try{ const v = localStorage.getItem(LEXIA_VOZ_KEY); return v === null ? true : v === '1'; }
    catch{ return true; }
  });

  useEffect(() => {
    try{ localStorage.setItem(LEXIA_VOZ_KEY, activada ? '1' : '0'); }catch{}
    if(!activada && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, [activada]);

  const decir = useCallback((texto) => {
    if(!activada || !texto || !('speechSynthesis' in window)) return;
    try{
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = 'es-CO';
      u.rate = 1.03;
      window.speechSynthesis.speak(u);
    }catch{ /* Web Speech no disponible en este navegador — no es crítico, sigue solo sin voz. */ }
  }, [activada]);

  return { activada, setActivada, decir };
}
