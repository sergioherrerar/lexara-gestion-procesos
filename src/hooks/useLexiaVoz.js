import { useCallback, useEffect, useRef, useState } from 'react';

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

// Bug real y muy documentado de Chrome/Edge: si se llama speak() ANTES de
// que el navegador termine de cargar su lista de voces (getVoices()
// arranca vacía y se llena después, de forma asíncrona, con el evento
// "voiceschanged"), la primera utterance queda MUDA — no suena nada, pero
// tampoco disparan ni onstart ni onerror ni onend, así que por fuera se ve
// exactamente como si "no hiciera nada": ni falla, ni avisa, ni el estado
// de hablando/pausada queda mal (de hecho queda bien, solo que sin sonido
// real detrás). Esto encaja con reportes repetidos de "no pausa ni
// silencia" que no se lograban reproducir por fuera: el problema real
// puede ser que nunca sonó nada desde el principio, no que pausar/
// continuar/silenciar fallen en sí. Se espera a que las voces carguen (con
// un tope de 1s por si el navegador nunca dispara el evento) antes de la
// PRIMERA lectura, y de paso se le asigna una voz en español explícita en
// vez de confiar solo en el `lang` de la utterance.
let vocesListas = null;
function esperarVoces(){
  if(vocesListas) return vocesListas;
  vocesListas = new Promise(resolve => {
    if(!('speechSynthesis' in window)){ resolve([]); return; }
    const yaCargadas = window.speechSynthesis.getVoices();
    if(yaCargadas.length){ resolve(yaCargadas); return; }
    const onChange = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onChange);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', onChange);
    // Si el navegador nunca dispara el evento (pasa en algunos), no se
    // queda esperando para siempre — sigue con lo que haya (puede ser
    // vacío, y aun así funciona con el `lang` de la utterance como respaldo).
    setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', onChange);
      resolve(window.speechSynthesis.getVoices());
    }, 1000);
  });
  return vocesListas;
}

// "Se cambió la voz por la de un hombre, ponla que siempre dé mujer"
// (2026-09-29, pedido explícito del usuario) — la Web Speech API no expone
// un campo de género real por voz, así que se elige por el NOMBRE de la
// voz instalada (Windows/Edge/Chrome ponen nombres propios reales, no
// "masculino"/"femenino"). Se prefiere una con nombre de mujer conocido;
// si no hay ninguna así, se evita al menos una con nombre de hombre
// conocido antes de caer en cualquier voz en español a secas.
const NOMBRES_VOZ_FEMENINA = ['sabina','helena','laura','elvira','lucia','lucía','raquel','monica','mónica','paulina','marisol','esperanza','pilar','carmen','isabela','isabel','camila','valentina','julieta','conchita','female','mujer'];
const NOMBRES_VOZ_MASCULINA = ['pablo','jorge','diego','enrique','alvaro','álvaro','carlos','raul','raúl','miguel','juan','andres','andrés','fernando','ricardo','male','hombre'];
function elegirVozFemenina(voces){
  const hispanas = voces.filter(v => (v.lang||'').toLowerCase().startsWith('es'));
  const nombreIncluye = (v, lista) => lista.some(p => (v.name||'').toLowerCase().includes(p));
  return hispanas.find(v => nombreIncluye(v, NOMBRES_VOZ_FEMENINA))
    || hispanas.find(v => !nombreIncluye(v, NOMBRES_VOZ_MASCULINA))
    || hispanas[0];
}

export function useLexiaVoz(){
  // Siempre activa (2026-10-05, pedido explícito del usuario: se quitaron
  // los botones de volumen/pausar — LexIA solo dice el saludo al entrar).
  // Ya no se lee la preferencia guardada: quien la hubiera silenciado antes
  // se quedaría sin saludo y sin forma de volver a activarla.
  const [activada, setActivadaState] = useState(true);
  const [hablando, setHablando] = useState(false);
  const [pausada, setPausada] = useState(false);
  // Refs (no re-render) para la cola de frases y el punto donde va —
  // `detenido` marca si debe seguir encadenando frases al terminar una.
  const colaRef = useRef([]);
  const indiceRef = useRef(0);
  const detenidoRef = useRef(true);
  const vozRef = useRef(null);
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

  // Cuarto intento del bug "no pausa ni silencia" (2026-09-29) — los 3
  // anteriores quedaron verificados por STATE (hablando/pausada), nunca
  // por sonido real (no hay forma de "escuchar" en un navegador de
  // prueba). El intento anterior esperaba a que cargaran las voces DENTRO
  // de decir(), con un await antes de speak() — pero varios navegadores
  // (Safari sobre todo, Chrome en ciertas configuraciones) BLOQUEAN
  // speak() en silencio si no se llama de forma completamente síncrona,
  // en la misma pila de ejecución del clic real del usuario: un await de
  // por medio (aunque sea rapidísimo) puede perder esa marca de "gesto
  // real" y dejar la lectura muda sin avisar nada — exactamente el mismo
  // síntoma de siempre. Ahora las voces se precargan solas apenas se monta
  // este hook (en segundo plano, sin bloquear nada), y decir() vuelve a
  // ser 100% síncrono, llamando a speak() en el mismo instante del clic.
  useEffect(() => {
    esperarVoces().then(voces => {
      if(vozRef.current === null) vozRef.current = elegirVozFemenina(voces) || undefined;
    });
  }, []);

  const setActivada = useCallback((valor) => {
    setActivadaState(prev => {
      const next = typeof valor === 'function' ? valor(prev) : valor;
      console.log('[LexIA voz] setActivada:', prev, '->', next);
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
    // Voz explícita en español (ver esperarVoces arriba) — de respaldo,
    // si por algo no se encontró ninguna, se deja que el navegador
    // elija sola por el `lang` de arriba, como ya hacía antes.
    if(vozRef.current) u.voice = vozRef.current;
    // Registro de diagnóstico (2026-09-29, pedido explícito del usuario:
    // "escala de una forma contundente el error") — 4 intentos de arreglo
    // ya verificados por STATE (hablando/pausada cambian bien), pero nunca
    // por sonido real (no hay forma de "escuchar" desde un navegador de
    // prueba automatizado). Con esto, si sigue sin sonar en la máquina
    // real del usuario, la consola del navegador (F12) va a decir
    // exactamente en qué paso se cae — si nunca aparece "[LexIA voz]
    // speak() llamado", el problema es previo a la síntesis de voz misma
    // (no llega la orden); si aparece eso pero nunca "onstart", el
    // navegador está descartando la utterance en silencio.
    u.onstart = () => console.log('[LexIA voz] empezó a hablar:', cola[indice].slice(0,40));
    u.onend = () => {
      console.log('[LexIA voz] onend (generacion', generacion, 'actual', generacionRef.current, 'detenido', detenidoRef.current, ')');
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
    u.onerror = (e) => {
      console.log('[LexIA voz] onerror:', e.error, '(generacion', generacion, 'actual', generacionRef.current, 'detenido', detenidoRef.current, ')');
      if(generacion !== generacionRef.current) return;
      if(detenidoRef.current) return;
      setHablando(false); setPausada(false);
    };
    console.log('[LexIA voz] speak() llamado, voz elegida:', vozRef.current ? vozRef.current.name : '(ninguna — usa el lang de la utterance)', 'frase:', cola[indice].slice(0,40));
    window.speechSynthesis.speak(u);
  }, []);

  const decir = useCallback((texto) => {
    if(!activada){ console.log('[LexIA voz] decir() no hizo nada: la voz está silenciada.'); return; }
    if(!texto){ console.log('[LexIA voz] decir() no hizo nada: no llegó texto para leer.'); return; }
    if(!('speechSynthesis' in window)){ console.log('[LexIA voz] decir() no hizo nada: este navegador no tiene speechSynthesis.'); return; }
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
    }catch(err){ console.error('[LexIA voz] decir() lanzó un error:', err); }
  }, [activada, hablarDesde]);

  const pausar = useCallback(() => {
    if(!('speechSynthesis' in window)){ console.log('[LexIA voz] pausar() no hizo nada: este navegador no tiene speechSynthesis.'); return; }
    console.log('[LexIA voz] pausar() llamado.');
    detenidoRef.current = true;
    window.speechSynthesis.cancel();
    setPausada(true);
  }, []);

  const continuar = useCallback(() => {
    if(!('speechSynthesis' in window)){ console.log('[LexIA voz] continuar() no hizo nada: este navegador no tiene speechSynthesis.'); return; }
    console.log('[LexIA voz] continuar() llamado, desde el indice', indiceRef.current);
    detenidoRef.current = false;
    setPausada(false);
    hablarDesde(indiceRef.current, generacionRef.current);
  }, [hablarDesde]);

  return { activada, setActivada, decir, hablando, pausada, pausar, continuar };
}
