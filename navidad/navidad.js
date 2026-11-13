// Papá Noel en su trineo cruzando la pantalla de izquierda a derecha y halando el logo de Lexara Abogados (2026-11-13, pedido del usuario: «apenas ingresen»).
// Una sola copia para las 4 secciones (Portal Clientes, Portal Lexara, Lexara al Día y Redes Sociales): `node menu-sitio/generar.mjs` la reparte a las páginas estáticas
// y la app la usa desde src/components/NavidadSanta.jsx. Es solo decoración: no recibe clics, no tapa nada, se retira sola y respeta «reducir movimiento».
// Uso: LexaraNavidad.volar({ logo: 'ruta-del-logo.png' }). Prueba: agregar ?navidad=1 a la dirección para verlo otra vez en la misma sesión.
(function(){
  'use strict';
  if(window.LexaraNavidad) return;

  // Ilustración (viewBox 430×170, mira hacia la derecha): trineo con Papá Noel y dos renos (el de adelante, Rodolfo, con la nariz roja).
  var RENO = function(x, nariz){
    return '<g transform="translate(' + x + ' 0)">' +
      '<g class="nv-pata" style="animation-delay:-.05s"><path d="M24 118 L18 148" /></g><g class="nv-pata" style="animation-delay:-.3s;animation-direction:alternate-reverse"><path d="M34 120 L36 148" /></g>' +
      '<ellipse cx="54" cy="108" rx="36" ry="18" fill="#8a5a33"/><ellipse cx="54" cy="116" rx="26" ry="9" fill="#a8743f"/>' +
      '<g class="nv-pata" style="animation-delay:-.2s"><path d="M70 120 L74 148" /></g><g class="nv-pata" style="animation-delay:-.45s;animation-direction:alternate-reverse"><path d="M80 118 L90 146" /></g>' +
      '<path d="M82 96 Q100 80 104 72" stroke="#8a5a33" stroke-width="13" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="108" cy="70" rx="14" ry="11" fill="#8a5a33"/><ellipse cx="119" cy="74" rx="8" ry="6" fill="#a8743f"/>' +
      '<circle cx="104" cy="66" r="2.2" fill="#1b1b1b"/>' +
      '<path d="M100 60 Q94 44 98 34 M98 44 Q90 40 88 33 M104 58 Q108 42 116 34 M108 45 Q116 43 120 36" stroke="#5b3a1c" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
      '<circle cx="124" cy="74" r="4.6" fill="' + (nariz ? '#ff2b2b' : '#3b2a1a') + '"/>' + (nariz ? '<circle cx="124" cy="74" r="9" fill="#ff2b2b" opacity=".28"/>' : '') +
      '<path d="M18 100 Q8 96 10 88" stroke="#8a5a33" stroke-width="6" fill="none" stroke-linecap="round"/>' +
      '<path d="M40 92 Q54 86 70 94" stroke="#c8102e" stroke-width="3.5" fill="none"/>' +
      '</g>';
  };
  var TRINEO =
    '<svg class="nv-trineo" viewBox="0 0 430 170" aria-hidden="true">' +
      // corredera
      '<path d="M16 142 H172 Q198 142 198 120" stroke="#c99a2e" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M52 142 V120 M122 142 V120" stroke="#c99a2e" stroke-width="5" stroke-linecap="round"/>' +
      // saco de regalos
      '<path d="M26 86 Q8 60 40 46 Q64 50 68 84 Z" fill="#8b5a2b"/><path d="M34 50 Q46 41 60 50" stroke="#f4c542" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<rect x="14" y="62" width="20" height="18" rx="2" fill="#1f7a4d" transform="rotate(-14 24 71)"/><path d="M24 62 V80" stroke="#f4c542" stroke-width="3" transform="rotate(-14 24 71)"/>' +
      '<rect x="56" y="58" width="16" height="16" rx="2" fill="#2f7fb8" transform="rotate(12 64 66)"/><path d="M64 58 V74" stroke="#fff" stroke-width="3" transform="rotate(12 64 66)"/>' +
      // cuerpo del trineo
      '<path d="M24 120 Q18 86 52 82 H170 Q194 84 200 102 Q202 118 172 122 Z" fill="#c8102e"/><path d="M30 110 H190" stroke="#f4c542" stroke-width="4" stroke-linecap="round"/>' +
      // Papá Noel
      '<rect x="86" y="46" width="54" height="44" rx="20" fill="#d4182f"/><rect x="86" y="68" width="54" height="7" fill="#1b1b1b" opacity=".85"/><rect x="106" y="66" width="14" height="11" rx="2" fill="#f4c542"/>' +
      '<circle cx="113" cy="38" r="16" fill="#f6d2b0"/><circle cx="108" cy="36" r="2" fill="#1b1b1b"/><circle cx="119" cy="36" r="2" fill="#1b1b1b"/><circle cx="113.5" cy="41" r="3" fill="#e9a08a"/>' +
      '<path d="M96 40 Q113 72 130 40 Q122 54 113 54 Q104 54 96 40" fill="#fff"/><path d="M104 44 Q113 38 122 44" fill="#fff"/>' +
      '<path d="M96 32 Q112 2 136 20 L130 30 Q114 20 99 36 Z" fill="#d4182f"/><rect x="96" y="29" width="36" height="9" rx="4.5" fill="#fff"/><circle cx="138" cy="19" r="6.5" fill="#fff"/>' +
      '<path d="M134 56 Q158 60 178 70" stroke="#d4182f" stroke-width="11" fill="none" stroke-linecap="round"/><circle cx="181" cy="71" r="6" fill="#fff"/>' +
      '<path d="M181 71 L214 96" stroke="#7a1f1f" stroke-width="2.4" fill="none"/>' +
      // renos
      '<g class="nv-reno">' + RENO(206, false) + '</g><path d="M262 100 L296 100" stroke="#7a1f1f" stroke-width="2.4" fill="none"/><g class="nv-reno nv-reno-2">' + RENO(300, true) + '</g>' +
    '</svg>';
  var CUERDA = '<svg class="nv-cuerda" viewBox="0 0 90 40" aria-hidden="true"><path d="M0 20 Q44 38 90 16" stroke="#8b5a2b" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';

  function volar(opciones){
    opciones = opciones || {};
    if(!opciones.logo) return;
    try{ if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; }catch(e){}
    var forzar = /[?&]navidad=1\b/.test(location.search);
    try{
      var clave = 'lexaraNavidad:' + location.pathname;
      if(!forzar && sessionStorage.getItem(clave)) return;   // una vez por visita a cada página (no en cada recarga)
      sessionStorage.setItem(clave, '1');
    }catch(e){}
    if(document.querySelector('.nav-santa')) return;
    var cont = document.createElement('div');
    cont.className = 'nav-santa'; cont.setAttribute('aria-hidden', 'true');
    var dentro = document.createElement('div'); dentro.className = 'nav-santa-in';
    var cartel = document.createElement('div'); cartel.className = 'nav-cartel';
    var img = document.createElement('img'); img.alt = ''; img.src = opciones.logo; img.decoding = 'async';
    var txt = document.createElement('span'); txt.textContent = '¡Felices fiestas!';
    cartel.appendChild(img); cartel.appendChild(txt);
    dentro.appendChild(cartel);
    dentro.insertAdjacentHTML('beforeend', CUERDA + TRINEO);   // SVG constantes de este archivo
    cont.appendChild(dentro);
    cont.addEventListener('animationend', function(ev){ if(ev.animationName === 'nv-cruce' && cont.parentNode) cont.parentNode.removeChild(cont); });
    document.body.appendChild(cont);
  }
  window.LexaraNavidad = { volar: volar };

  // Páginas estáticas: el script trae data-logo y vuela solo al cargar.
  var yo = document.currentScript;
  if(yo && yo.getAttribute('data-logo')){
    var logo = yo.getAttribute('data-logo');
    var lanzar = function(){ setTimeout(function(){ volar({ logo: logo }); }, 700); };
    if(document.readyState === 'complete') lanzar(); else window.addEventListener('load', lanzar);
  }
})();
