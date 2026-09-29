import { useCallback, useRef, useState } from 'react';

// Voz de LexIA (2026-09-24, pedido explícito del usuario: "podemos darle
// voz y que lea lo que envía") — usa la síntesis de voz nativa del
// navegador (Web Speech API, gratis, sin clave ni servicio nuevo, funciona
// en computador y celular). La preferencia de encendido/apagado queda en
// localStorage para no tener que volver a apagarla cada vez que se abre la
// ventana.
//
// 2026-09-25, pedido explícito del usuario ("un botón de stop y uno play
// para parar o continuar con la lectura") — bug real reportado ("al darle
// clic no hace ninguna acción"): speechSynthesis.pause()/resume() nativos
// son famosos por fallar (sobre todo resume() en Chrome, un bug viejo y
// nunca arreglado del todo). En vez de depender de eso, el texto se parte
// en frases y se van leyendo UNA POR UNA con utterances chiquitas propias:
// "pausar" simplemente corta la frase actual (se repite completa al
// continuar, no se pierde nada de contenido) y "continuar" sigue leyendo
// las frases que faltan. Nunca se usa pause()/resume() del navegador.
const LEXIA_VOZ_KEY = 'lexia-voz-activada';

export function useLexiaVoz(){
  const [activada, setActivadaState] = useState(() => {
    try{ const v = localStorage.getItem(LEXIA_VOZ_KEY); return v === null ? true : v === '1'; }
    catch{ return true; }
  });
  const [hablando, setHablando] = useState(false);
  const [pausada, setPausada] = useState(false);
  // Refs (no re-render) para la cola de frases y el punto donde va —
  // `detenido` marca si debe seguir encadenando frases al terminar una.
  const colaRef = useRef([]);
  const indiceRef = useRef(0);
  const detenidoRef = useRef(true);
  // Bug real reportado 2026-09-29, DESPUÉS de un primer intento de arreglo
  // (el guard de `detenidoRef` en onerror/onend, que sigue haciendo falta
  // pero no bastaba solo): si se llama decir()/pausar()/continuar() varias
  // veces seguidas (ej. el saludo del botón "LexIA" Y la precarga de fondo
  // casi al mismo tiempo), el onerror/onend de una frase VIEJA puede
  // disparar DESPUÉS de que ya se arrancó una lectura nueva — para ese
  // momento `detenidoRef.current` ya volvió a quedar en `false` (por la
  // lectura nueva), así que el guard de arriba ya no lo detiene, y ese
  // evento viejo pisa el estado de la lectura actual sin venir a cuento.
  // `generacionRef` marca de qué "tanda" de lectura es cada utterance —
  // decir() la cambia (lectura nueva de cero), pausar()/continuar() NO
  // (siguen la misma tanda) — así cualquier evento de una tanda ya
  // reemplazada se ignora, sin importar cuándo llegue.
  const generacionRef = useRef(0);

  const setActivada = useCallback((valor) => {
    setActivadaState(prev => {
      const next = typeof valor === 'function' ? valor(prev) : valor;
      try{ localStorage.setItem(LEXIA_VOZ_KEY, next ? '1' : '0'); }catch{}
      if(!next && 'speechSynthesis' in window){
        detenidoRef.current = true;
        generacionRef.current++;
        window.speechSynthesis.cancel();
        setHablando(false);
        setPausada(false);
      }
      return next;
    });
  }, []);

  const hablarDesde = useCallback((indice, generacion) => {
    if(generacion !== generacionRef.current) return; // tanda ya reemplazada
    const cola = colaRef.current;
    if(indice >= cola.length){
      setHablando(false);
      setPausada(false);
      return;
    }
    indiceRef.current = indice;
    const u = new SpeechSynthesisUtterance(cola[indice]);
    u.lang = 'es-CO';
    u.rate = 1.03;
    u.onend = () => {
      if(generacion !== generacionRef.current) return;
      if(detenidoRef.current) return; // se pausó/canceló mientras leía esta frase
      hablarDesde(indice + 1, generacion);
    };
    // Al llamar speechSynthesis.cancel() para pausar/silenciar/hablar de
    // nuevo, el navegador dispara onerror (no onend) en la frase que se
    // interrumpió — sin este guard, ese onerror pisaba el pausada:true que
    // pausar() ACABABA de poner, y el botón de pausa desaparecía de
    // inmediato en vez de convertirse en el de continuar. Mismo guard que
    // ya usa onend arriba, más el de generación (ver nota de arriba).
    u.onerror = () => {
      if(generacion !== generacionRef.current) return;
      if(detenidoRef.current) return;
      setHablando(false); setPausada(false);
    };
    window.speechSynthesis.speak(u);
  }, []);

  const decir = useCallback((texto) => {
    if(!activada || !texto || !('speechSynthesis' in window)) return;
    try{
      detenidoRef.current = true;
      window.speechSynthesis.cancel();
      // Frases por punto/signo de cierre — trozos cortos y confiables en
      // vez de mandar el texto completo como una sola utterance larga.
      const trozos = texto.split(/(?<=[.!?])\s+/).map(t => t.trim()).filter(Boolean);
      colaRef.current = trozos.length ? trozos : [texto];
      detenidoRef.current = false;
      generacionRef.current++; // lectura nueva de cero — arranca su propia tanda
      setPausada(false);
      setHablando(true);
      hablarDesde(0, generacionRef.current);
    }catch{ /* Web Speech no disponible en este navegador — no es crítico, sigue solo sin voz. */ }
  }, [activada, hablarDesde]);

  const pausar = useCallback(() => {
    if(!('speechSynthesis' in window)) return;
    detenidoRef.current = true;
    window.speechSynthesis.cancel();
    setPausada(true);
  }, []);

  const continuar = useCallback(() => {
    if(!('speechSynthesis' in window)) return;
    detenidoRef.current = false;
    setPausada(false);
    hablarDesde(indiceRef.current, generacionRef.current);
  }, [hablarDesde]);

  return { activada, setActivada, decir, hablando, pausada, pausar, continuar };
}
