// Papá Noel en su trineo cruzando la pantalla de izquierda a derecha y halando el logo de Lexara Abogados (2026-11-13, pedido del usuario: «apenas ingresen»).
// Una sola copia para las 4 secciones (Portal Clientes, Portal Lexara, Lexara al Día y Redes Sociales): `node menu-sitio/generar.mjs` la reparte a las páginas estáticas
// y la app la usa desde src/components/NavidadSanta.jsx. Es solo decoración: no recibe clics, no tapa nada, se retira sola y respeta «reducir movimiento».
// Uso: LexaraNavidad.volar({ logo: 'ruta-del-logo.png' }). Prueba: agregar ?navidad=1 a la dirección para verlo otra vez en la misma sesión.
(function(){
  'use strict';
  if(window.LexaraNavidad) return;

  // Ilustración propia en SVG (viewBox 680×300, mira hacia la derecha): Papá Noel sentado en un trineo rojo con adornos dorados, con un regalo y un bastón de caramelo,
  // sosteniendo las riendas de dos renos que saltan con collares rojos y campana. (Estilo de caricatura con contorno; dibujado desde cero para este proyecto.)
  var CONT = '#6e3a16', PIEL = '#f7cfa8', ROJO = '#e4202a', ROJO_OSC = '#a8121b', ORO = '#f2b21a';
  var RENO = function(nariz){
    return '<g class="nv-cuerpo">' +
      // patas traseras (extendidas atrás) y delanteras (adelante), con contorno
      '<path d="M-36 14 Q-60 34 -94 40" stroke="' + CONT + '" stroke-width="17" fill="none" stroke-linecap="round"/><path d="M-36 14 Q-60 34 -94 40" stroke="#c98446" stroke-width="12" fill="none" stroke-linecap="round"/>' +
      '<path d="M-22 18 Q-40 50 -64 66" stroke="' + CONT + '" stroke-width="17" fill="none" stroke-linecap="round"/><path d="M-22 18 Q-40 50 -64 66" stroke="#c98446" stroke-width="12" fill="none" stroke-linecap="round"/>' +
      '<path d="M34 16 Q62 32 90 22" stroke="' + CONT + '" stroke-width="17" fill="none" stroke-linecap="round"/><path d="M34 16 Q62 32 90 22" stroke="#d99655" stroke-width="12" fill="none" stroke-linecap="round"/>' +
      '<path d="M46 10 Q78 6 100 -8" stroke="' + CONT + '" stroke-width="17" fill="none" stroke-linecap="round"/><path d="M46 10 Q78 6 100 -8" stroke="#d99655" stroke-width="12" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="-96" cy="40" rx="6" ry="5" fill="#3a2410"/><ellipse cx="-66" cy="67" rx="6" ry="5" fill="#3a2410"/><ellipse cx="93" cy="22" rx="6" ry="5" fill="#3a2410"/><ellipse cx="103" cy="-8" rx="6" ry="5" fill="#3a2410"/>' +
      // cola, cuerpo, panza y manchas
      '<path d="M-54 -10 Q-76 -26 -66 -40 Q-50 -30 -50 -8 Z" fill="#d99655" stroke="' + CONT + '" stroke-width="3" stroke-linejoin="round"/>' +
      '<ellipse cx="0" cy="0" rx="58" ry="27" fill="url(#nv-reno)" stroke="' + CONT + '" stroke-width="3.5"/><ellipse cx="2" cy="15" rx="42" ry="10" fill="url(#nv-panza)"/>' +
      '<circle cx="-30" cy="-8" r="3.2" fill="#fff" opacity=".85"/><circle cx="-14" cy="-16" r="3.2" fill="#fff" opacity=".85"/><circle cx="8" cy="-10" r="3.2" fill="#fff" opacity=".85"/><circle cx="24" cy="-16" r="3" fill="#fff" opacity=".85"/><circle cx="-4" cy="2" r="3" fill="#fff" opacity=".85"/><circle cx="-34" cy="6" r="3" fill="#fff" opacity=".85"/>' +
      '<path d="M-52 14 Q2 42 54 14 Q2 32 -52 14 Z" fill="#6a3c18" opacity=".32"/><path d="M-42 -21 Q0 -34 42 -23" stroke="#fff" stroke-opacity=".42" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      // arnés con puntos dorados
      '<path d="M10 -26 Q22 0 10 27" stroke="' + ROJO + '" stroke-width="10" fill="none"/><circle cx="14" cy="-14" r="2" fill="' + ORO + '"/><circle cx="17" cy="0" r="2" fill="' + ORO + '"/><circle cx="14" cy="14" r="2" fill="' + ORO + '"/>' +
      // cuello, cabeza, hocico, oreja
      '<path d="M44 -14 Q62 -32 72 -52" stroke="' + CONT + '" stroke-width="31" fill="none" stroke-linecap="round"/><path d="M44 -14 Q62 -32 72 -52" stroke="#d99655" stroke-width="26" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="86" cy="-58" rx="21" ry="15" fill="url(#nv-reno)" stroke="' + CONT + '" stroke-width="3.5" transform="rotate(22 86 -58)"/>' +
      '<ellipse cx="103" cy="-48" rx="12" ry="8.5" fill="url(#nv-panza)" stroke="' + CONT + '" stroke-width="3" transform="rotate(22 103 -48)"/>' +
      '<circle cx="111" cy="-46" r="4.4" fill="' + (nariz ? '#ff2b2b' : '#2b1a0c') + '"/>' +
      '<ellipse cx="88" cy="-64" rx="4" ry="5" fill="#1b1b1b"/><circle cx="89.4" cy="-65.6" r="1.4" fill="#fff"/>' +
      '<path d="M70 -66 Q60 -86 70 -92 Q82 -84 80 -68 Z" fill="#d99655" stroke="' + CONT + '" stroke-width="3" stroke-linejoin="round"/><path d="M71 -70 Q66 -82 71 -87 Q77 -82 76 -71 Z" fill="#f4a9b8"/>' +
      // astas
      '<path d="M82 -72 Q74 -104 82 -134 M79 -104 Q62 -112 58 -128 M81 -118 Q98 -122 104 -140 M80 -88 Q98 -96 110 -92" stroke="' + CONT + '" stroke-width="4.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      // collar rojo con puntos y campana
      '<path d="M52 -26 Q68 -22 76 -42" stroke="' + ROJO + '" stroke-width="10" fill="none"/><circle cx="58" cy="-26" r="2" fill="' + ORO + '"/><circle cx="66" cy="-27" r="2" fill="' + ORO + '"/><circle cx="73" cy="-34" r="2" fill="' + ORO + '"/>' +
      '<path d="M62 -18 Q62 -4 74 -4 Q84 -4 80 -18 Z" fill="' + ORO + '" stroke="#a8740a" stroke-width="2.5" transform="translate(-4 4)"/>' +
    '</g>';
  };
  var TRINEO =
    '<svg class="nv-trineo" viewBox="0 0 680 300" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="nv-rojo" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0" stop-color="#ff5d62"/><stop offset=".5" stop-color="#e4202a"/><stop offset="1" stop-color="#a50f18"/></linearGradient>' +
        '<radialGradient id="nv-trin" cx=".3" cy=".25" r=".95"><stop offset="0" stop-color="#ff6b70"/><stop offset=".5" stop-color="#e4202a"/><stop offset="1" stop-color="#8f0d15"/></radialGradient>' +
        '<radialGradient id="nv-piel" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#ffe6cf"/><stop offset=".6" stop-color="#f7cfa8"/><stop offset="1" stop-color="#e3a77f"/></radialGradient>' +
        '<linearGradient id="nv-blanco" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9dfe6"/></linearGradient>' +
        '<linearGradient id="nv-reno" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#f0bc7c"/><stop offset=".55" stop-color="#d99655"/><stop offset="1" stop-color="#b06d36"/></linearGradient>' +
        '<linearGradient id="nv-panza" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe3b9"/><stop offset="1" stop-color="#eebf86"/></linearGradient>' +
        '<linearGradient id="nv-oro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe58a"/><stop offset=".5" stop-color="#f2b21a"/><stop offset="1" stop-color="#c98a0b"/></linearGradient>' +
      '</defs>' +
      // cuerda del cartel hasta la parte de atrás del trineo
      '<path d="M0 196 Q28 208 70 186" stroke="#6e3a16" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      // corredera dorada
      '<path d="M78 274 H302 Q316 274 316 262" stroke="#a8740a" stroke-width="13" fill="none" stroke-linecap="round"/><path d="M78 274 H302 Q316 274 316 262" stroke="' + ORO + '" stroke-width="8" fill="none" stroke-linecap="round"/>' +
      '<path d="M130 268 V246 M228 268 V246" stroke="#a8740a" stroke-width="11" stroke-linecap="round"/><path d="M130 268 V246 M228 268 V246" stroke="' + ORO + '" stroke-width="6" stroke-linecap="round"/>' +
      // regalo y bastón de caramelo
      '<path d="M82 168 V112 Q82 92 100 94" stroke="' + CONT + '" stroke-width="13" fill="none" stroke-linecap="round"/><path d="M82 168 V112 Q82 92 100 94" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M82 168 V112 Q82 92 100 94" stroke="' + ROJO + '" stroke-width="8" fill="none" stroke-dasharray="7 9" stroke-linecap="butt"/>' +
      '<rect x="100" y="108" width="60" height="66" rx="3" fill="#bb4a45" stroke="' + CONT + '" stroke-width="3.5"/><path d="M122 108 V174 M100 138 H160" stroke="#2a4d55" stroke-width="5"/>' +
      '<path d="M104 112 V168" stroke="#fff" stroke-opacity=".22" stroke-width="5"/><circle cx="112" cy="122" r="1.6" fill="#fff"/><circle cx="140" cy="124" r="1.6" fill="#fff"/><circle cx="112" cy="156" r="1.6" fill="#fff"/><circle cx="144" cy="154" r="1.6" fill="#fff"/><circle cx="146" cy="140" r="1.6" fill="#fff"/>' +
      '<path d="M124 108 Q110 90 100 98 Q106 110 124 108 Z M124 108 Q138 90 150 98 Q142 110 124 108 Z" fill="#2a4d55" stroke="' + CONT + '" stroke-width="2.5" stroke-linejoin="round"/>' +
      // Papá Noel: pantalón y bota, torso, cinturón
      '<path d="M196 214 Q226 206 262 214 L270 238 Q232 246 204 238 Z" fill="url(#nv-rojo)" stroke="' + CONT + '" stroke-width="3.5" stroke-linejoin="round"/><path d="M264 212 Q276 226 270 242" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round"/>' +
      '<path d="M262 242 Q284 244 290 258 L268 262 Q256 256 258 244 Z" fill="#1d1613" stroke="#0e0a08" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M178 126 Q160 168 172 214 L262 216 Q282 160 252 124 Z" fill="url(#nv-rojo)" stroke="' + CONT + '" stroke-width="3.5" stroke-linejoin="round"/>' +
      '<path d="M238 132 Q270 170 262 214 L236 214 Q250 170 228 134 Z" fill="#6a0c12" opacity=".26"/><path d="M186 140 Q180 162 184 186" stroke="#fff" stroke-opacity=".3" stroke-width="6" fill="none" stroke-linecap="round"/>' +
      '<path d="M206 130 Q214 176 208 214" stroke="#fff" stroke-width="12" fill="none" stroke-linecap="round" opacity=".95"/><path d="M180 206 Q220 222 262 206" stroke="#fff" stroke-width="11" fill="none" stroke-linecap="round"/>' +
      '<path d="M174 186 Q220 200 268 184" stroke="#4a2511" stroke-width="13" fill="none"/><rect x="204" y="174" width="24" height="22" rx="3" fill="' + ORO + '" stroke="#8a5a0a" stroke-width="2.5"/><rect x="211" y="180" width="10" height="10" rx="1.5" fill="#7a4a10"/>' +
      // brazo adelante con riendas
      '<path d="M242 138 Q268 140 292 122" stroke="' + CONT + '" stroke-width="22" fill="none" stroke-linecap="round"/><path d="M242 138 Q268 140 292 122" stroke="' + ROJO + '" stroke-width="17" fill="none" stroke-linecap="round"/>' +
      '<path d="M286 124 L294 116" stroke="#fff" stroke-width="12" stroke-linecap="round"/><circle cx="303" cy="116" r="9" fill="' + PIEL + '" stroke="' + CONT + '" stroke-width="3"/>' +
      // riendas hacia los renos
      '<path d="M310 114 Q420 118 604 96" stroke="#6e3a16" stroke-width="2.4" fill="none"/><path d="M310 118 Q400 190 520 170" stroke="#6e3a16" stroke-width="2.4" fill="none"/>' +
      // cuerpo del trineo
      '<path d="M66 176 Q50 164 64 156 Q92 152 138 176 Q196 204 246 188 Q272 178 288 150 Q316 162 308 202 Q296 254 196 262 Q96 268 78 214 Q70 196 66 176 Z" fill="url(#nv-trin)" stroke="#7a1414" stroke-width="3.5" stroke-linejoin="round"/>' +
      '<path d="M86 176 Q130 188 188 204" stroke="#fff" stroke-opacity=".36" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M84 232 Q190 270 300 222 Q288 256 196 262 Q108 266 84 232 Z" fill="#5c0a10" opacity=".34"/>' +
      '<path d="M96 222 Q122 206 146 224 Q164 238 188 220 Q206 206 228 226 M114 244 Q134 236 152 246 M232 204 Q250 196 262 210" stroke="' + ORO + '" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M66 176 Q50 164 64 156 Q92 152 138 176 Q196 204 246 188 Q272 178 288 150" stroke="#a8740a" stroke-width="14" fill="none" stroke-linecap="round"/><path d="M66 176 Q50 164 64 156 Q92 152 138 176 Q196 204 246 188 Q272 178 288 150" stroke="' + ORO + '" stroke-width="9" fill="none" stroke-linecap="round"/>' +
      // cabeza de Papá Noel (por encima del borde del trineo no; va sobre el torso)
      '<path d="M196 100 Q192 144 222 154 Q252 144 248 100 Q236 122 222 120 Q208 122 196 100 Z" fill="url(#nv-blanco)" stroke="#c9c9c9" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<circle cx="222" cy="98" r="27" fill="url(#nv-piel)" stroke="' + CONT + '" stroke-width="3.5"/>' +
      '<path d="M198 114 Q222 142 246 114 Q232 132 222 132 Q212 132 198 114 Z" fill="url(#nv-blanco)" stroke="#c9c9c9" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M206 112 Q214 104 222 112 Q230 104 238 112 Q230 122 222 118 Q214 122 206 112 Z" fill="url(#nv-blanco)" stroke="#c9c9c9" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<ellipse cx="212" cy="95" rx="4.4" ry="5.6" fill="#1b1b1b"/><ellipse cx="232" cy="95" rx="4.4" ry="5.6" fill="#1b1b1b"/><circle cx="213.4" cy="93" r="1.5" fill="#fff"/><circle cx="233.4" cy="93" r="1.5" fill="#fff"/>' +
      '<path d="M206 84 Q212 80 218 84 M228 84 Q234 80 240 84" stroke="#e8e8e8" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="222" cy="104" rx="5.5" ry="4.5" fill="#f2a58e"/><circle cx="203" cy="106" r="5" fill="#f58f80" opacity=".6"/><circle cx="241" cy="106" r="5" fill="#f58f80" opacity=".6"/>' +
      '<path d="M214 118 Q222 128 230 118 Q222 122 214 118 Z" fill="#7a1414"/><path d="M200 86 Q204 74 214 70" stroke="#fff" stroke-opacity=".45" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      // gorro inclinado hacia atrás con pompón y ribete blanco
      '<path d="M246 80 Q244 34 200 30 Q168 30 150 52 Q176 52 196 66 Z" fill="url(#nv-rojo)" stroke="' + CONT + '" stroke-width="3.5" stroke-linejoin="round"/>' +
      '<path d="M194 76 Q214 58 248 80 Q252 92 242 92 Q220 72 198 92 Q188 90 194 76 Z" fill="url(#nv-blanco)" stroke="#c9c9c9" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<circle cx="148" cy="54" r="11" fill="url(#nv-blanco)" stroke="#c9c9c9" stroke-width="2.5"/>' +
      // renos (el de atrás primero)
      '<g class="nv-reno nv-reno-2"><g transform="translate(580 138) rotate(-14) scale(.95)">' + RENO(false) + '</g></g>' +
      '<g class="nv-reno"><g transform="translate(440 214) rotate(-7) scale(1)">' + RENO(false) + '</g></g>' +
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
