// Lexara al Día — sección de publicaciones. Lee data/sitio.json y data/publicaciones.json y arma la página (filtros por tipo, red social, búsqueda y orden).
(function(){
  'use strict';
  var $ = function(id){ return document.getElementById(id); };
  var TIPOS = [
    { id: 'video', nombre: 'Videos', singular: 'Video' },
    { id: 'reel', nombre: 'Reels', singular: 'Reel' },
    { id: 'podcast', nombre: 'Podcast', singular: 'Podcast' },
    { id: 'noticia', nombre: 'Noticias', singular: 'Noticia' },
    { id: 'publicacion', nombre: 'Publicaciones', singular: 'Publicación' },
  ];
  var REDES = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', spotify: 'Spotify', youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X', web: 'Sitio web' };
  var DEGRADADOS = { video: ['#1b5f8a', '#52bbb5'], reel: ['#a3306f', '#ef7d00'], podcast: ['#14753f', '#52bbb5'], noticia: ['#c46300', '#fbbc33'], publicacion: ['#5a3f96', '#52bbb5'] };
  var estado = { sitio: {}, todas: [], tipo: '', red: '', texto: '', orden: 'reciente' };

  function el(tag, clase, texto){ var e = document.createElement(tag); if(clase) e.className = clase; if(texto != null) e.textContent = texto; return e; }
  function sinTildes(t){ return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function fechaLarga(iso){
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); if(!m) return '';
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function tipoDe(id){ return TIPOS.filter(function(t){ return t.id === id; })[0] || TIPOS[3]; }
  // Solo se abren direcciones http(s): una publicación mal escrita nunca ejecuta código.
  function urlSegura(u){ return /^https?:\/\//i.test(u || '') ? u : ''; }
  function idSpotify(u){ var m = /open\.spotify\.com\/(?:intl-[a-z]+\/)?(episode|show)\/(\w+)/.exec(u || ''); return m ? { tipo: m[1], id: m[2] } : null; }
  function idTikTok(u){ var m = /tiktok\.com\/.*\/video\/(\d+)/.exec(u || ''); return m ? m[1] : ''; }
  function idYoutube(u){
    var m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(u || ''); return m ? m[1] : '';
  }
  function miniaturaDe(p){
    if(p.miniatura) return p.miniatura;
    var yt = idYoutube(p.url); return yt ? 'https://img.youtube.com/vi/' + yt + '/hqdefault.jpg' : '';
  }
  var SVG = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    video: '<svg class="icono-tipo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>',
    reel: '<svg class="icono-tipo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 9l5 3-5 3z"/></svg>',
    podcast: '<svg class="icono-tipo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/></svg>',
    noticia: '<svg class="icono-tipo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h13a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2z"/><path d="M19 9h2v8a2 2 0 0 1-2 2"/><path d="M8 9h7M8 13h7M8 16h4"/></svg>',
    publicacion: '<svg class="icono-tipo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>',
  };
  function conSvg(contenedor, svg){ contenedor.insertAdjacentHTML('beforeend', svg); }   // los SVG son constantes de este archivo, nunca datos de las publicaciones

  // ---------- medio (miniatura / degradado + icono) ----------
  function medioDe(p, abrir){
    var url = urlSegura(p.url), mini = miniaturaDe(p), esVideo = p.tipo === 'video' || p.tipo === 'reel' || p.tipo === 'podcast';
    var m = el(url || esVideo ? 'button' : 'div', 'medio' + (p.tipo === 'reel' ? ' vertical' : ''));
    if(m.tagName === 'BUTTON'){ m.type = 'button'; m.setAttribute('aria-label', 'Abrir: ' + p.titulo); m.addEventListener('click', function(){ abrir(p); }); }
    if(mini){ m.style.backgroundImage = 'url("' + mini.replace(/"/g, '%22') + '")'; }
    else { m.classList.add('sin-miniatura'); var d = DEGRADADOS[p.tipo] || DEGRADADOS.publicacion; m.style.setProperty('--c1', d[0]); m.style.setProperty('--c2', d[1]); conSvg(m, SVG[p.tipo] || SVG.publicacion); }
    if(esVideo){ var pl = el('span', 'play'); conSvg(pl, SVG.play); m.appendChild(pl); }
    var ins = el('span', 'insignia-tipo t-' + p.tipo, tipoDe(p.tipo).singular); m.appendChild(ins);
    return m;
  }
  function chipRed(p){ var r = el(urlSegura(p.url) ? 'a' : 'span', 'red ' + (REDES[p.red] ? p.red : 'web'), REDES[p.red] || 'Sitio web'); if(r.tagName === 'A'){ r.href = urlSegura(p.url); r.target = '_blank'; r.rel = 'noopener noreferrer'; } return r; }
  function boton(p){
    var url = urlSegura(p.url);
    var b = el(url ? 'a' : 'span', 'boton' + (url ? '' : ' apagado'), url ? 'Ver en ' + (REDES[p.red] || 'el sitio') + ' ↗' : 'Enlace próximamente');
    if(url){ b.href = url; b.target = '_blank'; b.rel = 'noopener noreferrer'; }
    return b;
  }

  // ---------- reproductor ----------
  function abrir(p){
    var yt = idYoutube(p.url), sp = idSpotify(p.url), tt = idTikTok(p.url);
    if(!yt && !sp && !tt){ var u = urlSegura(p.url); if(u) window.open(u, '_blank', 'noopener'); return; }   // fuera de YouTube y Spotify se abre la red social
    var cont = $('modal-video'); cont.textContent = ''; cont.className = 'modal-video' + (sp ? ' audio' : tt ? ' vertical' : '');
    var f = document.createElement('iframe');
    if(tt){ f.src = 'https://www.tiktok.com/player/v1/' + tt + '?autoplay=1&description=1'; f.allow = 'autoplay; fullscreen; encrypted-media'; }
    else if(sp){ f.src = 'https://open.spotify.com/embed/' + sp.tipo + '/' + sp.id + '?utm_source=generator'; f.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'; }
    else { f.src = 'https://www.youtube-nocookie.com/embed/' + yt + '?autoplay=1&rel=0'; f.allow = 'autoplay; encrypted-media; picture-in-picture'; }
    f.title = p.titulo; f.allowFullscreen = true;
    cont.appendChild(f); $('modal').hidden = false; $('modal-cerrar').focus();
  }
  function cerrar(){ $('modal').hidden = true; $('modal-video').textContent = ''; }
  $('modal-cerrar').addEventListener('click', cerrar);
  $('modal').addEventListener('click', function(ev){ if(ev.target === this) cerrar(); });
  document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape' && !$('modal').hidden) cerrar(); });

  function tambienEn(p){
    var lista = (p.tambien || []).filter(function(t){ return urlSegura(t.url); });
    if(!lista.length) return null;
    var c = el('div', 'tambien'); c.appendChild(el('span', null, 'También en'));
    lista.forEach(function(t){ var a = el('a', 'red ' + (REDES[t.red] ? t.red : 'web'), REDES[t.red] || 'Sitio web'); a.href = urlSegura(t.url); a.target = '_blank'; a.rel = 'noopener noreferrer'; c.appendChild(a); });
    return c;
  }
  // ---------- tarjetas ----------
  function tarjeta(p){
    var art = el('article', 'tarjeta');
    art.appendChild(medioDe(p, abrir));
    var c = el('div', 'cuerpo');
    var meta = el('div', 'meta'); meta.appendChild(el('span', null, fechaLarga(p.fecha))); meta.appendChild(chipRed(p)); c.appendChild(meta);
    c.appendChild(el('h3', null, p.titulo));
    if(p.descripcion) c.appendChild(el('p', null, p.descripcion));
    var tb = tambienEn(p); if(tb) c.appendChild(tb);
    if((p.etiquetas || []).length){ var et = el('div', 'etiquetas'); p.etiquetas.forEach(function(t){ et.appendChild(el('span', 'etiqueta', t)); }); c.appendChild(et); }
    var ver = el('div', 'ver'); ver.appendChild(boton(p)); c.appendChild(ver);
    art.appendChild(c); return art;
  }
  function pintarDestacada(){
    var cont = $('destacada'); cont.textContent = '';
    var d = estado.todas.filter(function(p){ return p.destacada; }).sort(function(a, b){ return (b.fecha || '').localeCompare(a.fecha || ''); })[0];
    if(!d){ cont.hidden = true; return; }
    cont.hidden = false;
    cont.appendChild(medioDe(d, abrir));
    var c = el('div', 'cuerpo');
    c.appendChild(el('span', 'rotulo', 'PUBLICACIÓN DESTACADA'));
    c.appendChild(el('h2', null, d.titulo));
    var meta = el('div', 'meta'); meta.appendChild(el('span', null, fechaLarga(d.fecha))); meta.appendChild(chipRed(d)); c.appendChild(meta);
    if(d.descripcion) c.appendChild(el('p', null, d.descripcion));
    var tbd = tambienEn(d); if(tbd) c.appendChild(tbd);
    c.appendChild(boton(d));
    cont.appendChild(c);
  }

  // ---------- filtros ----------
  function filtradas(){
    var q = sinTildes(estado.texto.trim());
    var l = estado.todas.filter(function(p){
      if(estado.tipo && p.tipo !== estado.tipo) return false;
      if(estado.red && p.red !== estado.red) return false;
      return !q || sinTildes([p.titulo, p.descripcion, (p.etiquetas || []).join(' ')].join(' ')).indexOf(q) >= 0;
    });
    l.sort(function(a, b){ var c = (b.fecha || '').localeCompare(a.fecha || ''); return estado.orden === 'antigua' ? -c : c; });
    return l;
  }
  function pintar(){
    var l = filtradas(), cont = $('rejilla'); cont.textContent = '';
    l.forEach(function(p){ cont.appendChild(tarjeta(p)); });
    $('vacio').hidden = l.length > 0;
    $('conteo').textContent = l.length + (l.length === 1 ? ' publicación' : ' publicaciones');
  }
  function pintarTipos(){
    var cont = $('tipos'); cont.textContent = '';
    [{ id: '', nombre: 'Todo' }].concat(TIPOS).forEach(function(t){
      var n = estado.todas.filter(function(p){ return !t.id || p.tipo === t.id; }).length;
      if(t.id && !n) return;   // no se muestra un tipo sin contenido
      var b = el('button', null, t.nombre); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(estado.tipo === t.id));
      b.appendChild(el('span', 'n', String(n)));
      b.addEventListener('click', function(){ estado.tipo = t.id; pintarTipos(); pintar(); });
      cont.appendChild(b);
    });
  }
  function pintarCabecera(){
    var s = estado.sitio;
    if(s.nombre){ $('titulo-sitio').textContent = s.nombre; document.title = s.nombre + ' — MD Abogados'; }
    $('lema-sitio').textContent = s.lema || '';
    if(urlSegura(s.inicioUrl)){ $('enlace-inicio').href = s.inicioUrl; }
    var cifras = $('cifras'); cifras.textContent = '';
    TIPOS.forEach(function(t){
      var n = estado.todas.filter(function(p){ return p.tipo === t.id; }).length; if(!n) return;
      var c = el('div', 'cifra'); c.appendChild(el('dt', null, t.nombre)); c.appendChild(el('dd', null, String(n))); cifras.appendChild(c);
    });
    var redes = $('redes'); redes.textContent = '';
    (s.redes || []).forEach(function(r){
      var u = urlSegura(r.url); if(!u) return;
      var a = el('a', 'red grande ' + r.id, r.nombre); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; redes.appendChild(a);
    });
    if(!redes.children.length) redes.hidden = true;
    var sel = $('filtro-red'); var usadas = {};
    estado.todas.forEach(function(p){ if(p.red) usadas[p.red] = true; });
    Object.keys(usadas).forEach(function(r){ var o = el('option', null, REDES[r] || r); o.value = r; sel.appendChild(o); });
    $('aviso-ejemplo').hidden = !estado.todas.some(function(p){ return p.ejemplo; });
  }

  $('buscar').addEventListener('input', function(){ estado.texto = this.value; pintar(); });
  $('filtro-red').addEventListener('change', function(){ estado.red = this.value; pintar(); });
  $('orden').addEventListener('change', function(){ estado.orden = this.value; pintar(); });

  // ---------- campanita de publicaciones nuevas ----------
  // Es «nueva» la publicación que esta persona todavía no ha visto en este navegador (se recuerda en localStorage; no se envía nada a ningún servidor).
  // Primera visita: solo cuentan como nuevas las de los últimos 7 días, para no avisar de todo el historial.
  var CLAVE_VISTAS = 'lexaraAlDia.vistas.v1';
  function idDe(p){ return p.id || p.url || p.titulo; }
  function leerVistas(){ try{ var v = JSON.parse(localStorage.getItem(CLAVE_VISTAS)); return Array.isArray(v) ? v : null; }catch(e){ return null; } }
  function guardarVistas(ids){ try{ localStorage.setItem(CLAVE_VISTAS, JSON.stringify(ids)); }catch(e){} }
  var campana = { nuevas: [], vistas: [] };
  function porFechaDesc(a, b){ return String(b.fecha).localeCompare(String(a.fecha)); }
  function marcarVistas(){
    var ids = estado.todas.map(idDe);   // solo se recuerdan las que siguen publicadas (la lista es de las 10 últimas)
    guardarVistas(ids); campana.vistas = ids; campana.nuevas = []; pintarCampana();
  }
  function cerrarCampana(marcar){
    var pn = $('campana-panel'); if(pn.hidden) return;
    pn.hidden = true; $('campana-btn').setAttribute('aria-expanded', 'false');
    if(marcar) marcarVistas();
  }
  function pintarCampana(){
    var n = campana.nuevas.length, num = $('campana-num');
    num.hidden = !n; num.textContent = n > 9 ? '9+' : String(n);
    $('campana-btn').classList.toggle('con-nuevas', n > 0);
    $('campana-btn').setAttribute('aria-label', n ? n + (n === 1 ? ' publicación nueva' : ' publicaciones nuevas') : 'Publicaciones nuevas: estás al día');
    var pn = $('campana-panel'); pn.textContent = '';
    pn.appendChild(el('p', 'campana-titulo', n ? 'Publicaciones nuevas' : 'Estás al día'));
    if(!n){ pn.appendChild(el('p', 'campana-vacio', 'No hay videos ni publicaciones nuevas desde tu última visita. Cuando salga uno, aquí te avisamos.')); return; }
    var ul = el('ul', 'campana-lista');
    campana.nuevas.forEach(function(p){
      var li = el('li'); var b = el('button', 'campana-item'); b.type = 'button';
      var mini = el('span', 'campana-mini'); var m = miniaturaDe(p); if(m) mini.style.backgroundImage = 'url("' + m.replace(/"/g, '%22') + '")'; else { var d = DEGRADADOS[p.tipo] || DEGRADADOS.publicacion; mini.style.background = 'linear-gradient(135deg,' + d[0] + ',' + d[1] + ')'; }
      var tx = el('span', 'campana-texto');
      tx.appendChild(el('strong', null, p.titulo));
      tx.appendChild(el('small', null, tipoDe(p.tipo).singular + ' · ' + (REDES[p.red] || 'Sitio web') + ' · ' + fechaLarga(p.fecha)));
      b.appendChild(mini); b.appendChild(tx);
      b.addEventListener('click', function(){
        campana.vistas.push(idDe(p)); guardarVistas(campana.vistas);
        campana.nuevas = campana.nuevas.filter(function(x){ return x !== p; });
        cerrarCampana(false); pintarCampana(); abrir(p);
      });
      li.appendChild(b); ul.appendChild(li);
    });
    pn.appendChild(ul);
    var t = el('button', 'campana-todo', 'Marcar todas como vistas'); t.type = 'button';
    t.addEventListener('click', function(){ cerrarCampana(true); });
    pn.appendChild(t);
  }
  function iniciarCampana(){
    var vistas = leerVistas();
    if(!vistas){   // primera visita (o el navegador no guarda datos): solo los últimos 7 días
      var corte = new Date(); corte.setDate(corte.getDate() - 7);
      var c = corte.getFullYear() + '-' + ('0' + (corte.getMonth() + 1)).slice(-2) + '-' + ('0' + corte.getDate()).slice(-2);
      vistas = estado.todas.filter(function(p){ return String(p.fecha) < c; }).map(idDe);
    }
    campana.vistas = vistas;
    campana.nuevas = estado.todas.filter(function(p){ return !p.ejemplo && vistas.indexOf(idDe(p)) < 0; }).sort(porFechaDesc);
    $('campana').hidden = false; pintarCampana();
    $('campana-btn').addEventListener('click', function(ev){
      ev.stopPropagation();
      var pn = $('campana-panel');
      if(pn.hidden){ pn.hidden = false; this.setAttribute('aria-expanded', 'true'); } else cerrarCampana(true);
    });
    document.addEventListener('click', function(ev){ if(!$('campana').contains(ev.target)) cerrarCampana(true); });
    document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape' && !$('campana-panel').hidden){ cerrarCampana(true); $('campana-btn').focus(); } });
  }

  // ---------- carga ----------
  function leer(url){ return fetch(url, { cache: 'no-cache' }).then(function(r){ if(!r.ok) throw new Error('No se pudo leer ' + url + ' (' + r.status + ')'); return r.json(); }); }
  Promise.all([leer('data/sitio.json'), leer('data/publicaciones.json')]).then(function(r){
    estado.sitio = r[0] || {};
    estado.todas = (r[1] || []).filter(function(p){ return p && p.titulo; });
    $('cargando').hidden = true;
    pintarCabecera(); pintarDestacada(); pintarTipos(); pintar(); iniciarCampana();
  }).catch(function(err){
    console.error(err);
    $('cargando').hidden = true;
    var e = $('error'); e.hidden = false;
    e.textContent = 'No se pudieron cargar las publicaciones. Si abrió el archivo directamente desde su computador, ábralo desde el sitio web o con un servidor local.';
  });
})();
