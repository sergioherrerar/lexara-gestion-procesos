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
  // Botones de redes del encabezado (2026-11-13): tarjetas con relieve 3D. Los íconos son los oficiales de cada red (24×24), constantes de este archivo.
  var ICONOS_RED = {"instagram":"M12 7.3A4.7 4.7 0 1 0 12 16.7 4.7 4.7 0 0 0 12 7.3zm0 7.75A3.05 3.05 0 1 1 12 8.95a3.05 3.05 0 0 1 0 6.1zM16.95 6.1a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM12 2.2c-2.67 0-3 .01-4.05.06-1.05.05-1.77.22-2.4.46a4.85 4.85 0 0 0-1.75 1.14A4.85 4.85 0 0 0 2.66 5.6c-.24.63-.41 1.35-.46 2.4C2.15 9.05 2.14 9.38 2.14 12s.01 2.95.06 4c.05 1.05.22 1.77.46 2.4.25.66.6 1.22 1.14 1.76.54.55 1.1.89 1.76 1.14.63.24 1.35.41 2.4.46 1.05.05 1.38.06 4.04.06s2.99-.01 4.04-.06c1.05-.05 1.77-.22 2.4-.46a5.05 5.05 0 0 0 2.9-2.9c.24-.63.41-1.35.46-2.4.05-1.05.06-1.38.06-4.04s-.01-2.99-.06-4.04c-.05-1.05-.22-1.77-.46-2.4a4.85 4.85 0 0 0-1.14-1.76 4.85 4.85 0 0 0-1.76-1.14c-.63-.24-1.35-.41-2.4-.46C14.99 2.21 14.66 2.2 12 2.2zm0 1.8c2.62 0 2.93.01 3.96.06.96.04 1.48.2 1.83.34.46.18.79.4 1.13.74.34.34.56.67.74 1.13.14.35.3.87.34 1.83.05 1.03.06 1.34.06 3.96s-.01 2.93-.06 3.96c-.04.96-.2 1.48-.34 1.83-.18.46-.4.79-.74 1.13-.34.34-.67.56-1.13.74-.35.14-.87.3-1.83.34-1.03.05-1.34.06-3.96.06s-2.93-.01-3.96-.06c-.96-.04-1.48-.2-1.83-.34a3.05 3.05 0 0 1-1.13-.74 3.05 3.05 0 0 1-.74-1.13c-.14-.35-.3-.87-.34-1.83C4.01 14.93 4 14.62 4 12s.01-2.93.06-3.96c.04-.96.2-1.48.34-1.83.18-.46.4-.79.74-1.13.34-.34.67-.56 1.13-.74.35-.14.87-.3 1.83-.34C9.07 4.01 9.38 4 12 4z","facebook":"M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.69.24 2.69.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z","tiktok":"M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z","spotify":"M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21zm4.8 15.15a.65.65 0 0 1-.9.22c-2.45-1.5-5.55-1.84-9.18-1-.35.08-.69-.14-.77-.49a.64.64 0 0 1 .48-.77c3.98-.91 7.4-.52 10.15 1.17.3.18.4.58.22.87zm1.28-2.85a.8.8 0 0 1-1.1.26c-2.8-1.72-7.08-2.22-10.4-1.21a.8.8 0 0 1-.46-1.53c3.8-1.15 8.5-.6 11.7 1.38.38.23.5.72.26 1.1zm.11-2.96c-3.36-2-8.9-2.18-12.1-1.2a.96.96 0 1 1-.56-1.84c3.68-1.12 9.8-.9 13.67 1.4a.96.96 0 0 1-1 1.64z","youtube":"M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2C.5 9.1.5 12 .5 12s0 2.9.5 4.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-4.8.5-4.8s0-2.9-.5-4.8zM9.8 15.1V8.9l5.8 3.1-5.8 3.1z","linkedin":"M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"};
  var RED_3D = {
    instagram: { n: 'Instagram', s: '', a: 'Reels y publicaciones' },
    facebook: { n: 'Facebook', s: '', a: 'Noticias y novedades' },
    tiktok: { n: 'TikTok', s: '', a: 'Videos cortos' },
    spotify: { n: 'Spotify', s: 'Café Laboral', a: 'Podcast Café Laboral' },
    youtube: { n: 'YouTube', s: 'Café Laboral', a: 'Episodios de Café Laboral' },
    linkedin: { n: 'LinkedIn', s: '', a: 'Red profesional' },
  };
  function iconoRed(id){
    var d = ICONOS_RED[id]; if(!d) return '';
    if(id === 'tiktok') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path transform="translate(-.7 -.7)" fill="#25F4EE" d="' + d + '"/><path transform="translate(.7 .7)" fill="#FE2C55" d="' + d + '"/><path fill="#fff" d="' + d + '"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  function conSvg(contenedor, svg){ contenedor.insertAdjacentHTML('beforeend', svg); }   // los SVG son constantes de este archivo, nunca datos de las publicaciones

  // ---------- medio (miniatura / degradado + icono) ----------
  // Cada video se ve dentro de un dispositivo (2026-11-13, pedido del usuario): los reels y publicaciones de Instagram/TikTok en un CELULAR y los videos de YouTube en un TELEVISOR.
  function dispositivoDe(p){
    if(p.tipo === 'reel' || p.red === 'instagram' || p.red === 'tiktok') return 'celular';
    if(p.red === 'youtube' || p.tipo === 'video') return 'tv';
    return '';
  }
  function medioDe(p, abrir){
    var url = urlSegura(p.url), mini = miniaturaDe(p), esVideo = p.tipo === 'video' || p.tipo === 'reel' || p.tipo === 'podcast', disp = dispositivoDe(p);
    var m = el(url || esVideo ? 'button' : 'div', 'medio' + (disp ? ' con-' + disp : (p.tipo === 'reel' ? ' vertical' : '')));
    if(m.tagName === 'BUTTON'){ m.type = 'button'; m.setAttribute('aria-label', 'Abrir: ' + p.titulo); m.addEventListener('click', function(){ abrir(p); }); }
    var pantalla = m;   // donde va la imagen: el propio recuadro, o la pantalla del celular / televisor
    if(disp){
      pantalla = el('span', 'pantalla-d');
      var cont = el('span', disp === 'celular' ? 'celular' : 'tv');
      if(disp === 'celular'){ cont.appendChild(pantalla); }
      else { var marco = el('span', 'tv-marco'); marco.appendChild(pantalla); cont.appendChild(marco); cont.appendChild(el('span', 'tv-cuello')); cont.appendChild(el('span', 'tv-base')); }
      m.appendChild(cont);
    }
    if(mini){ pantalla.style.backgroundImage = 'url("' + mini.replace(/"/g, '%22') + '")'; }
    else { pantalla.classList.add('sin-miniatura'); var d = DEGRADADOS[p.tipo] || DEGRADADOS.publicacion; pantalla.style.setProperty('--c1', d[0]); pantalla.style.setProperty('--c2', d[1]); conSvg(pantalla, SVG[p.tipo] || SVG.publicacion); }
    if(esVideo){ var pl = el('span', 'play'); conSvg(pl, SVG.play); pantalla.appendChild(pl); }
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
      var info = RED_3D[r.id];
      if(!info){ var g = el('a', 'red grande ' + r.id, r.nombre); g.href = u; g.target = '_blank'; g.rel = 'noopener noreferrer'; redes.appendChild(g); return; }
      var a = el('a', 'red-3d ' + r.id); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.setAttribute('aria-label', info.n + ': ' + info.a + ' (se abre en una pestaña nueva)');
      var ico = el('span', 'r3d-ico'); ico.insertAdjacentHTML('beforeend', iconoRed(r.id));   // SVG constante de este archivo, nunca datos de las publicaciones
      var tx = el('span', 'r3d-txt'); tx.appendChild(el('strong', null, info.n)); if(info.s) tx.appendChild(el('small', null, info.s));
      a.appendChild(ico); a.appendChild(tx); a.appendChild(el('span', 'r3d-flecha', '↗'));
      redes.appendChild(a);
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
