// «Pausa activa» — 4 juegos sencillos para desestresarse (Lexara al Día, 2026-11-13): Palabra del día, Memoria jurídica, Sopa de letras y Ahorcado de la balanza.
// Todo corre en el navegador (sin servidor, sin cuentas); el contenido sale de data/juegos.json. Solo se carga cuando alguien abre «Pausa activa».
(function(){
  'use strict';
  var DATOS = null, overlay = null, cuerpo = null, limpiar = null, titulo = null, volver = null;
  var $ = function(id){ return document.getElementById(id); };
  function el(tag, clase, texto){ var e = document.createElement(tag); if(clase) e.className = clase; if(texto != null) e.textContent = texto; return e; }
  function normaliza(t){ return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }
  function azar(n){ return Math.floor(Math.random() * n); }
  function mezclar(a){ a = a.slice(); for(var i = a.length - 1; i > 0; i--){ var j = azar(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function guardar(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function leer(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } }
  function hoyClave(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function diaNumero(){ var d = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); }
  function aviso(cont, texto, clase){ var a = el('div', 'jg-aviso' + (clase ? ' ' + clase : ''), texto); cont.appendChild(a); return a; }

  // ---------- ventana ----------
  function crear(){
    overlay = el('div', 'jg-overlay'); overlay.hidden = true; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Pausa activa: juegos');
    var caja = el('div', 'jg-caja');
    var cab = el('div', 'jg-cab');
    volver = el('button', 'jg-volver', '‹ Juegos'); volver.type = 'button'; volver.hidden = true; volver.addEventListener('click', menu);
    titulo = el('h2', 'jg-titulo', 'Pausa activa');
    var cerrarB = el('button', 'jg-cerrar', '✕'); cerrarB.type = 'button'; cerrarB.setAttribute('aria-label', 'Cerrar'); cerrarB.addEventListener('click', cerrar);
    cab.appendChild(volver); cab.appendChild(titulo); cab.appendChild(cerrarB);
    cuerpo = el('div', 'jg-cuerpo');
    caja.appendChild(cab); caja.appendChild(cuerpo); overlay.appendChild(caja);
    overlay.addEventListener('click', function(ev){ if(ev.target === overlay) cerrar(); });
    document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape' && overlay && !overlay.hidden) cerrar(); });
    document.body.appendChild(overlay);
  }
  var JUEGOS = {};   // clave -> [nombre, función]; se llena más abajo
  function ir(clave){ if(clave && JUEGOS[clave]) entrar(JUEGOS[clave][0], JUEGOS[clave][1]); else menu(); }
  function leerJson(url){ return fetch(url, { cache: 'no-cache' }).then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function abrir(clave){
    if(!overlay) crear();
    overlay.hidden = false; document.body.classList.add('jg-abierto');
    if(DATOS){ ir(clave); return; }
    cuerpo.textContent = 'Cargando…';
    // juegos.json es obligatorio; publicaciones.json (para la sopa de letras de la última publicación) es opcional
    Promise.all([leerJson('data/juegos.json'), leerJson('data/publicaciones.json').catch(function(){ return []; })])
      .then(function(r){ DATOS = r[0]; DATOS.publicaciones = r[1]; ir(clave); })
      .catch(function(){ cuerpo.textContent = 'No se pudieron cargar los juegos. Intente de nuevo en un momento.'; });
  }
  function cerrar(){ if(limpiar){ limpiar(); limpiar = null; } if(overlay) overlay.hidden = true; document.body.classList.remove('jg-abierto'); }
  function entrar(nombre, fn){
    if(limpiar){ limpiar(); limpiar = null; }
    cuerpo.textContent = ''; titulo.textContent = nombre; volver.hidden = false;
    var r = fn(cuerpo); if(typeof r === 'function') limpiar = r;
    cuerpo.scrollTop = 0;
  }
  function menu(){
    if(limpiar){ limpiar(); limpiar = null; }
    cuerpo.textContent = ''; titulo.textContent = 'Pausa activa'; volver.hidden = true;
    cuerpo.appendChild(el('p', 'jg-intro', 'Un respiro entre expedientes. Elija un juego: no hay tiempo ni puntaje que cuidar.'));
    var rej = el('div', 'jg-menu');
    [
      ['Palabra del día', 'Adivine la palabra jurídica de hoy en 6 intentos.', 'palabra'],
      ['Memoria jurídica', 'Encuentre cada término con su significado.', 'memoria'],
      ['Sopa de letras', 'Busque las palabras de la última publicación.', 'sopa'],
      ['Ahorcado de la balanza', 'Adivine el término antes de que se incline la balanza.', 'ahorcado']
    ].forEach(function(j){
      var b = el('button', 'jg-op jg-op-' + j[2]); b.type = 'button';
      b.appendChild(el('strong', null, j[0])); b.appendChild(el('span', null, j[1]));
      b.addEventListener('click', function(){ ir(j[2]); });
      rej.appendChild(b);
    });
    cuerpo.appendChild(rej);
  }

  // ---------- 1. Palabra del día (estilo Wordle) ----------
  function palabraDelDia(cont){
    var lista = DATOS.palabras, item = lista[diaNumero() % lista.length], objetivo = normaliza(item.p), clave = 'lexaraJuegos.palabra.' + hoyClave();
    var estado = leer(clave) || { intentos: [], fin: false, gano: false }, actual = '', teclas = {};
    var tablero = el('div', 'jg-tablero'), filas = [], msg = el('div', 'jg-msg'), teclado = el('div', 'jg-teclado');
    for(var r = 0; r < 6; r++){ var f = el('div', 'jg-fila'); filas.push(f); for(var c = 0; c < 5; c++) f.appendChild(el('div', 'jg-casilla')); tablero.appendChild(f); }
    function colores(intento){
      var res = ['n', 'n', 'n', 'n', 'n'], resto = {};
      for(var i = 0; i < 5; i++){ if(intento[i] === objetivo[i]) res[i] = 'v'; else resto[objetivo[i]] = (resto[objetivo[i]] || 0) + 1; }
      for(var k = 0; k < 5; k++){ if(res[k] !== 'v' && resto[intento[k]] > 0){ res[k] = 'a'; resto[intento[k]]--; } }
      return res;
    }
    function pintar(){
      teclas = {};
      estado.intentos.forEach(function(w, i){
        var col = colores(w);
        for(var k = 0; k < 5; k++){
          var cs = filas[i].children[k]; cs.textContent = w[k]; cs.className = 'jg-casilla ' + col[k];
          var rango = { v: 3, a: 2, n: 1 }, prev = teclas[w[k]]; if(!prev || rango[col[k]] > rango[prev]) teclas[w[k]] = col[k];
        }
      });
      var fi = estado.intentos.length;
      for(var j = fi; j < 6; j++) for(var q = 0; q < 5; q++){ var c2 = filas[j].children[q]; c2.className = 'jg-casilla'; c2.textContent = (j === fi && !estado.fin) ? (actual[q] || '') : ''; if(j === fi && actual[q] && !estado.fin) c2.classList.add('lleno'); }
      Array.prototype.forEach.call(teclado.querySelectorAll('button[data-t]'), function(b){ var t = b.getAttribute('data-t'); b.className = 'jg-tecla' + (b.getAttribute('data-ancha') ? ' ancha' : '') + (teclas[t] ? ' ' + teclas[t] : ''); });
    }
    function final(){
      msg.textContent = ''; msg.className = 'jg-msg';
      var caja = el('div', 'jg-fin');
      caja.appendChild(el('strong', null, estado.gano ? '¡Muy bien! La palabra era ' + objetivo + '.' : 'La palabra de hoy era ' + objetivo + '.'));
      caja.appendChild(el('p', null, item.d));
      var cp = el('button', 'jg-btn', 'Copiar mi resultado'); cp.type = 'button';
      cp.addEventListener('click', function(){
        var emoji = { v: '🟩', a: '🟨', n: '⬛' };
        var txt = 'Palabra del día · Lexara al Día ' + hoyClave().split('-').reverse().join('/') + ' ' + (estado.gano ? estado.intentos.length : 'X') + '/6\n' +
          estado.intentos.map(function(w){ return colores(w).map(function(x){ return emoji[x]; }).join(''); }).join('\n') + '\nwww.lexaraabogados.com/lexara-al-dia';
        var listo = function(){ cp.textContent = 'Copiado'; };
        if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(listo, function(){ cp.textContent = 'No se pudo copiar'; }); else cp.textContent = 'No se pudo copiar';
      });
      caja.appendChild(cp); caja.appendChild(el('small', 'jg-suave', 'Mañana habrá una palabra nueva.'));
      msg.appendChild(caja);
    }
    function enviar(){
      if(estado.fin) return;
      if(actual.length < 5){ msg.textContent = 'Escriba las 5 letras.'; msg.className = 'jg-msg'; return; }
      msg.textContent = ''; estado.intentos.push(actual);
      if(actual === objetivo){ estado.fin = true; estado.gano = true; } else if(estado.intentos.length >= 6){ estado.fin = true; estado.gano = false; }
      actual = ''; guardar(clave, estado); pintar(); if(estado.fin) final();
    }
    function tecla(t){
      if(estado.fin) return;
      if(t === 'ENTER') enviar(); else if(t === 'BORRAR') actual = actual.slice(0, -1); else if(actual.length < 5 && /^[A-ZÑ]$/.test(t)) actual += t;
      if(t !== 'ENTER'){ msg.textContent = ''; pintar(); }
    }
    ['QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM'].forEach(function(fila, i){
      var d = el('div', 'jg-teclas');
      if(i === 2){ var e = el('button', 'jg-tecla ancha', 'Enter'); e.type = 'button'; e.setAttribute('data-t', 'ENTER'); e.setAttribute('data-ancha', '1'); d.appendChild(e); }
      fila.split('').forEach(function(l){ var b = el('button', 'jg-tecla', l); b.type = 'button'; b.setAttribute('data-t', l); d.appendChild(b); });
      if(i === 2){ var bo = el('button', 'jg-tecla ancha', '⌫'); bo.type = 'button'; bo.setAttribute('data-t', 'BORRAR'); bo.setAttribute('data-ancha', '1'); bo.setAttribute('aria-label', 'Borrar'); d.appendChild(bo); }
      teclado.appendChild(d);
    });
    teclado.addEventListener('click', function(ev){ var b = ev.target.closest('button[data-t]'); if(b) tecla(b.getAttribute('data-t')); });
    function fisico(ev){
      if(ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if(ev.key === 'Enter'){ ev.preventDefault(); tecla('ENTER'); } else if(ev.key === 'Backspace'){ ev.preventDefault(); tecla('BORRAR'); } else { var k = normaliza(ev.key); if(/^[A-Z]$/.test(k) || ev.key.toLowerCase() === 'ñ') tecla(ev.key.toLowerCase() === 'ñ' ? 'Ñ' : k); }
    }
    document.addEventListener('keydown', fisico);
    cont.appendChild(el('p', 'jg-intro', 'Una palabra jurídica de 5 letras, nueva cada día. Verde: letra bien ubicada. Amarillo: está, pero en otro lugar. Gris: no está.'));
    cont.appendChild(tablero); cont.appendChild(msg); cont.appendChild(teclado);
    pintar(); if(estado.fin) final();
    return function(){ document.removeEventListener('keydown', fisico); };
  }

  // ---------- 2. Memoria jurídica ----------
  function memoria(cont){
    var pares = mezclar(DATOS.terminos.filter(function(x){ return x.t.length <= 22 && x.d.length <= 46; })).slice(0, 6), cartas = [], abiertas = [], bloqueo = false, movs = 0, hechas = 0;
    var barra = el('div', 'jg-barra'), cuenta = el('span', 'jg-suave', 'Movimientos: 0'), nuevo = el('button', 'jg-btn peq', 'Nueva partida'); nuevo.type = 'button';
    nuevo.addEventListener('click', function(){ entrar('Memoria jurídica', memoria); });
    barra.appendChild(cuenta); barra.appendChild(nuevo);
    var rej = el('div', 'jg-memoria'), msg = el('div', 'jg-msg');
    pares.forEach(function(p, i){ cartas.push({ id: i, texto: p.t, tipo: 't' }); cartas.push({ id: i, texto: p.d, tipo: 'd' }); });
    mezclar(cartas).forEach(function(c){
      var b = el('button', 'jg-carta'); b.type = 'button'; b.setAttribute('aria-label', 'Carta');
      var in1 = el('span', 'jg-carta-in'), frente = el('span', 'jg-cara frente', 'L'), dorso = el('span', 'jg-cara dorso ' + c.tipo, c.texto);
      in1.appendChild(frente); in1.appendChild(dorso); b.appendChild(in1); b._c = c;
      b.addEventListener('click', function(){
        if(bloqueo || b.classList.contains('abierta') || b.classList.contains('lista')) return;
        b.classList.add('abierta'); abiertas.push(b);
        if(abiertas.length === 2){
          movs++; cuenta.textContent = 'Movimientos: ' + movs;
          var a = abiertas[0], z = abiertas[1];
          if(a._c.id === z._c.id && a._c.tipo !== z._c.tipo){ a.classList.add('lista'); z.classList.add('lista'); abiertas = []; hechas++;
            if(hechas === pares.length){ msg.textContent = '¡Listo! Lo logró en ' + movs + ' movimientos.'; msg.className = 'jg-msg ok'; } }
          else { bloqueo = true; setTimeout(function(){ a.classList.remove('abierta'); z.classList.remove('abierta'); abiertas = []; bloqueo = false; }, 950); }
        }
      });
      rej.appendChild(b);
    });
    cont.appendChild(el('p', 'jg-intro', 'Voltee dos cartas: un término y su significado forman una pareja.'));
    cont.appendChild(barra); cont.appendChild(rej); cont.appendChild(msg);
  }

  // La última publicación (la destacada más reciente, como en la portada) y sus palabras para la sopa de letras.
  var PARASITAS = 'PARA CON LOS LAS UNA UNOS UNAS QUE ESTE ESTA ESTOS ESTAS COMO SUS DEL POR ENTRE SOBRE TAMBIEN PERO DONDE CUANDO ESTO ESE ESA ESOS ESAS PODRIA PODRIAN DESDE HASTA SEGUN SIN TODO TODA TODOS TODAS MUY MAS MENOS CADA OTRO OTRA OTROS OTRAS SER SON FUE FUERON HAY TIENE TIENEN SERA SERAN ANTES DESPUES AQUI ALLI AHORA SIEMPRE NUNCA YA NOS LES SUYA SUYO SUYOS SUYAS NUESTRO NUESTRA VIDEO VIDEOS REELS REEL MIN'.split(' ');
  function ultimaPublicacion(){
    var l = (DATOS && DATOS.publicaciones) || [];
    return l.filter(function(p){ return p && p.destacada && p.titulo; }).sort(function(a, b){ return String(b.fecha || '').localeCompare(String(a.fecha || '')); })[0] || null;
  }
  function palabrasDe(pub){
    var vistos = {}, lista = [];
    function sumar(texto){
      normaliza(texto).split(/[^A-Z]+/).forEach(function(w){
        if(w.length >= 4 && w.length <= 10 && PARASITAS.indexOf(w) < 0 && !vistos[w]){ vistos[w] = true; lista.push(w); }
      });
    }
    if(pub){ sumar(pub.titulo || ''); (pub.etiquetas || []).forEach(sumar); sumar(pub.descripcion || ''); }
    lista = lista.slice(0, 7);
    // si la publicación trae pocas palabras, se completa con términos laborales
    mezclar(DATOS.sopa.map(normaliza)).forEach(function(w){ if(lista.length < 6 && w.length <= 10 && !vistos[w]){ vistos[w] = true; lista.push(w); } });
    return lista;
  }

  // ---------- 3. Sopa de letras ----------
  function sopa(cont){
    var N = 10, DIRS = [[0, 1], [1, 0], [1, 1]], reja = [], ult = ultimaPublicacion(), objetivo = palabrasDe(ult), halladas = {}, ini = null;
    for(var i = 0; i < N; i++){ reja.push([]); for(var j = 0; j < N; j++) reja[i].push(''); }
    objetivo.forEach(function(w){
      for(var t = 0; t < 300; t++){
        var d = DIRS[azar(DIRS.length)], f = azar(N), c = azar(N), fe = f + d[0] * (w.length - 1), ce = c + d[1] * (w.length - 1);
        if(fe >= N || ce >= N) continue;
        var ok = true; for(var k = 0; k < w.length; k++){ var x = reja[f + d[0] * k][c + d[1] * k]; if(x && x !== w[k]){ ok = false; break; } }
        if(!ok) continue;
        for(var m = 0; m < w.length; m++) reja[f + d[0] * m][c + d[1] * m] = w[m];
        break;
      }
    });
    var ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for(var a = 0; a < N; a++) for(var b2 = 0; b2 < N; b2++) if(!reja[a][b2]) reja[a][b2] = ABC[azar(26)];
    var tabla = el('div', 'jg-sopa'), celdas = [], lista = el('div', 'jg-palabras'), msg = el('div', 'jg-msg'), etiquetas = {};
    tabla.style.gridTemplateColumns = 'repeat(' + N + ',1fr)';
    for(var y = 0; y < N; y++){ celdas.push([]); for(var x2 = 0; x2 < N; x2++){ var cel = el('button', 'jg-letra', reja[y][x2]); cel.type = 'button'; cel.setAttribute('data-f', y); cel.setAttribute('data-c', x2); celdas[y].push(cel); tabla.appendChild(cel); } }
    objetivo.forEach(function(w){ var s = el('span', 'jg-palabra', w); etiquetas[w] = s; lista.appendChild(s); });
    function limpiarSel(){ Array.prototype.forEach.call(tabla.querySelectorAll('.sel'), function(c){ c.classList.remove('sel'); }); ini = null; }
    tabla.addEventListener('click', function(ev){
      var cel = ev.target.closest('.jg-letra'); if(!cel) return;
      var f = +cel.getAttribute('data-f'), c = +cel.getAttribute('data-c');
      if(!ini){ ini = [f, c]; cel.classList.add('sel'); return; }
      var df = f - ini[0], dc = c - ini[1], pasos = Math.max(Math.abs(df), Math.abs(dc));
      if(pasos === 0 || !(df === 0 || dc === 0 || Math.abs(df) === Math.abs(dc))){ limpiarSel(); return; }
      var sf = Math.sign(df), sc = Math.sign(dc), txt = '', cs = [];
      for(var k = 0; k <= pasos; k++){ var cc = celdas[ini[0] + sf * k][ini[1] + sc * k]; cs.push(cc); txt += cc.textContent; }
      var rev = txt.split('').reverse().join(''), w = objetivo.filter(function(p){ return !halladas[p] && (p === txt || p === rev); })[0];
      limpiarSel();
      if(w){ halladas[w] = true; cs.forEach(function(cc){ cc.classList.add('hallada'); }); etiquetas[w].classList.add('hecha');
        if(Object.keys(halladas).length === objetivo.length){ msg.textContent = '¡Encontró todas las palabras!'; msg.className = 'jg-msg ok'; } }
    });
    var nuevo = el('button', 'jg-btn peq', 'Nueva sopa'); nuevo.type = 'button'; nuevo.addEventListener('click', function(){ entrar('Sopa de letras', sopa); });
    cont.appendChild(el('p', 'jg-intro', ult ? 'Palabras de la última publicación: «' + ult.titulo + '». Toque la primera letra y luego la última de cada palabra (en línea recta).' : 'Toque la primera letra y luego la última de una palabra (en línea recta).'));
    cont.appendChild(tabla); cont.appendChild(lista); cont.appendChild(msg); cont.appendChild(nuevo);
  }

  // ---------- 4. Ahorcado de la balanza ----------
  function ahorcado(cont){
    var item = DATOS.terminos[azar(DATOS.terminos.length)], palabra = normaliza(item.t), usadas = {}, errores = 0, MAX = 6, fin = false;
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 300 190'); svg.setAttribute('class', 'jg-balanza'); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<path d="M120 178 H180 L170 164 H130 Z" fill="#5a3f1c"/><rect x="146" y="64" width="8" height="102" rx="3" fill="#8a5a24"/><circle cx="150" cy="60" r="8" fill="#f2b21a" stroke="#a8740a" stroke-width="2"/><g id="jg-viga"></g>';
    var viga = svg.querySelector('#jg-viga'), pista = el('div', 'jg-pista'), mostrada = el('div', 'jg-palabra-oculta'), teclado = el('div', 'jg-teclado jg-letras'), msg = el('div', 'jg-msg'), vidas = el('div', 'jg-suave jg-vidas');
    function dibujar(){
      var ang = errores * 4.2 * Math.PI / 180, L = 100, cx = 150, cy = 60, ax = cx - L * Math.cos(ang), ay = cy + L * Math.sin(ang) * -1, bx = cx + L * Math.cos(ang), by = cy + L * Math.sin(ang);
      var pl = function(x, y, color){ return '<line x1="' + x + '" y1="' + y + '" x2="' + (x - 22) + '" y2="' + (y + 40) + '" stroke="#6e3a16" stroke-width="1.6"/><line x1="' + x + '" y1="' + y + '" x2="' + (x + 22) + '" y2="' + (y + 40) + '" stroke="#6e3a16" stroke-width="1.6"/><path d="M' + (x - 26) + ' ' + (y + 40) + ' H' + (x + 26) + ' Q' + (x + 22) + ' ' + (y + 54) + ' ' + x + ' ' + (y + 54) + ' Q' + (x - 22) + ' ' + (y + 54) + ' ' + (x - 26) + ' ' + (y + 40) + ' Z" fill="' + color + '" stroke="#a8740a" stroke-width="2"/>'; };
      viga.innerHTML = '<line x1="' + ax + '" y1="' + ay + '" x2="' + bx + '" y2="' + by + '" stroke="#8a5a24" stroke-width="7" stroke-linecap="round"/>' + pl(ax, ay, '#f2b21a') + pl(bx, by, errores ? '#e4202a' : '#f2b21a');
    }
    function pintar(){
      var gano = true;
      mostrada.textContent = palabra.split('').map(function(ch){ if(ch === ' ') return ' '; if(usadas[ch] || fin){ return ch; } gano = false; return '_'; }).join(' ');
      mostrada.className = 'jg-palabra-oculta' + (fin && errores >= MAX ? ' perdida' : '');
      vidas.textContent = 'Oportunidades: ' + (MAX - errores);
      Array.prototype.forEach.call(teclado.querySelectorAll('button'), function(b){ var l = b.textContent; b.disabled = !!usadas[l] || fin; b.className = 'jg-tecla' + (usadas[l] ? (palabra.indexOf(l) >= 0 ? ' v' : ' n') : ''); });
      dibujar();
      return gano;
    }
    function jugar(l){
      if(fin || usadas[l]) return; usadas[l] = true;
      if(palabra.indexOf(l) < 0) errores++;
      var gano = palabra.split('').every(function(ch){ return ch === ' ' || usadas[ch]; });
      if(gano){ fin = true; msg.textContent = '¡Equilibrada! Era «' + item.t + '».'; msg.className = 'jg-msg ok'; }
      else if(errores >= MAX){ fin = true; msg.textContent = 'La balanza se inclinó. Era «' + item.t + '».'; msg.className = 'jg-msg'; }
      pintar();
    }
    'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('').forEach(function(l){ var b = el('button', 'jg-tecla', l); b.type = 'button'; b.addEventListener('click', function(){ jugar(l); }); teclado.appendChild(b); });
    function fisico(ev){ if(ev.ctrlKey || ev.metaKey || ev.altKey) return; var k = ev.key.toLowerCase() === 'ñ' ? 'Ñ' : normaliza(ev.key); if(/^[A-ZÑ]$/.test(k)) jugar(k); }
    document.addEventListener('keydown', fisico);
    var pb = el('button', 'jg-btn peq', 'Ver pista'); pb.type = 'button'; pb.addEventListener('click', function(){ pista.textContent = 'Pista: ' + item.d; pb.hidden = true; });
    var nuevo = el('button', 'jg-btn peq', 'Otro término'); nuevo.type = 'button'; nuevo.addEventListener('click', function(){ entrar('Ahorcado de la balanza', ahorcado); });
    var acc = el('div', 'jg-barra'); acc.appendChild(pb); acc.appendChild(nuevo);
    cont.appendChild(el('p', 'jg-intro', 'Adivine el término jurídico letra por letra. Cada error inclina un poco la balanza; si acierta, queda equilibrada.'));
    cont.appendChild(svg); cont.appendChild(mostrada); cont.appendChild(vidas); cont.appendChild(pista); cont.appendChild(msg); cont.appendChild(teclado); cont.appendChild(acc);
    pintar();
    return function(){ document.removeEventListener('keydown', fisico); };
  }

  JUEGOS = { palabra: ['Palabra del día', palabraDelDia], memoria: ['Memoria jurídica', memoria], sopa: ['Sopa de letras', sopa], ahorcado: ['Ahorcado de la balanza', ahorcado] };

  // ---------- los botones de la página (junto a la última publicación) ----------
  document.addEventListener('click', function(ev){
    var b = ev.target.closest && ev.target.closest('[data-juego], [data-abrir-juegos]');
    if(b){ ev.preventDefault(); abrir(b.getAttribute('data-juego') || undefined); }
  });
  window.LexaraJuegos = { abrir: abrir };
})();
