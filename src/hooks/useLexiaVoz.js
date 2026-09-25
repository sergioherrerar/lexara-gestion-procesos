import { useCallback, useEffect, useRef, useState } from 'react';

// Voz de LexIA (2026-09-24, pedido explícito del usuario: "podemos darle
// voz y que lea lo que envía") — usa la síntesis de voz nativa del
// navegador (Web Speech API, gratis, sin clave ni servicio nuevo, funciona
// en computador y celular). La preferencia de encendido/apagado queda en
// localStorage para no tener que volver a apagarla cada vez que se abre la
// ventana.
//
// 2026-09-25, pedido explícito del usuario ("coloca un botón de stop y uno
// play para parar o continuar con la lectura") — se agregan `hablando`/
// `pausada` (para poder mostrar/activar los botones correctos) y
// `pausar()`/`continuar()`, además del `decir()` de siempre. Se apoya en
// speechSynthesis.pause()/resume() (nativo del navegador, no hace falta
// guardar el texto a mano) y en los eventos de la utterance para saber en
// qué estado quedó.
const LEXIA_VOZ_KEY = 'lexia-voz-activada';

export function useLexiaVoz(){
  const [activada, setActivada] = useState(() => {
    try{ const v = localStorage.getItem(LEXIA_VOZ_KEY); return v === null ? true : v === '1'; }
    catch{ return true; }
  });
  const [hablando, setHablando] = useState(false);
  const [pausada, setPausada] = useState(false);
  const utteranceRef = useRef(null);

  useEffect(() => {
    try{ localStorage.setItem(LEXIA_VOZ_KEY, activada ? '1' : '0'); }catch{}
    if(!activada && 'speechSynthesis' in window){
      window.speechSynthesis.cancel();
      setHablando(false);
      setPausada(false);
    }
  }, [activada]);

  const decir = useCallback((texto) => {
    if(!activada || !texto || !('speechSynthesis' in window)) return;
    try{
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = 'es-CO';
      u.rate = 1.03;
      u.onstart = () => { setHablando(true); setPausada(false); };
      u.onend = () => { setHablando(false); setPausada(false); };
      u.onerror = () => { setHablando(false); setPausada(false); };
      u.onpause = () => setPausada(true);
      u.onresume = () => setPausada(false);
      utteranceRef.current = u;
      window.speechSynthesis.speak(u);
    }catch{ /* Web Speech no disponible en este navegador — no es crítico, sigue solo sin voz. */ }
  }, [activada]);

  const pausar = useCallback(() => {
    if('speechSynthesis' in window) window.speechSynthesis.pause();
  }, []);

  const continuar = useCallback(() => {
    if('speechSynthesis' in window) window.speechSynthesis.resume();
  }, []);

  return { activada, setActivada, decir, hablando, pausada, pausar, continuar };
}
