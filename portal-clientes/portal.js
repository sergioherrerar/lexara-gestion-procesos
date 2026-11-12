// Portal de clientes — página (2026-11-11). Todo lo que se muestra viene de api.php, que ya entrega solo lo que le corresponde a cada cliente.
(function(){
  'use strict';
  var $ = function(id){ return document.getElementById(id); };
  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var estado = { equipo: false, opciones: [], como: '', clientes: [], elegido: 'todos', grupo: false, panel: 'procesos', procesos: [], tutelas: [], cargado: {}, demo: false, correo: '' };

  function api(accion, cuerpo, query){
    var url = 'api.php?a=' + accion + (query || '');
    var opciones = cuerpo ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Portal': '1' }, body: JSON.stringify(cuerpo), credentials: 'same-origin' }
                          : { credentials: 'same-origin' };
    return fetch(url, opciones).then(function(r){ return r.json().catch(function(){ return { error: 'Respuesta no válida.' }; }).then(function(j){ j._estado = r.status; return j; }); });
  }
  function el(tag, clase, texto){ var e = document.createElement(tag); if(clase) e.className = clase; if(texto != null) e.textContent = texto; return e; }
  function mostrar(vista){ $('vista-login').hidden = vista !== 'login'; $('vista-app').hidden = vista !== 'app'; }
  function errorLogin(t){ var e = $('login-error'); e.textContent = t || ''; e.hidden = !t; }
  function errorApp(t){ var e = $('app-error'); e.textContent = t || ''; e.hidden = !t; }
  function fechaCorta(iso){ var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function nombreMes(ym){ var m = /^(\d{4})-(\d{2})/.exec(ym || ''); return m ? MESES[Number(m[2]) - 1] + ' ' + m[1] : ym; }
  function sinTildes(t){ return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function consulta(){ return '&cliente=' + encodeURIComponent(estado.elegido) + (estado.equipo ? '&como=' + encodeURIComponent(estado.como) : ''); }
  function manejarError(j){
    if(j._estado === 401){ mostrar('login'); errorLogin('Su sesión venció. Ingrese de nuevo.'); return true; }
    if(!j.ok){ errorApp(j.error || 'No pudimos cargar la información.'); return true; }
    return false;
  }

  // ---------- ingreso ----------
  $('form-correo').addEventListener('submit', function(ev){
    ev.preventDefault(); errorLogin('');
    var correo = $('correo').value.trim();
    $('btn-pedir').disabled = true;
    api('solicitar', { correo: correo }).then(function(j){
      $('btn-pedir').disabled = false;
      if(!j.ok){ errorLogin(j.error || 'No pudimos enviar el código.'); return; }
      estado.correo = correo;
      $('msg-codigo').textContent = j.mensaje;
      var d = $('codigo-demo');
      if(j.codigo_demo){ d.textContent = 'Modo demo: su código es ' + j.codigo_demo; d.hidden = false; } else { d.hidden = true; }
      $('form-correo').hidden = true; $('form-codigo').hidden = false; $('login-ayuda').hidden = true;
      $('codigo').value = ''; $('codigo').focus();
    }).catch(function(){ $('btn-pedir').disabled = false; errorLogin('No hay conexión. Intente de nuevo.'); });
  });
  $('form-codigo').addEventListener('submit', function(ev){
    ev.preventDefault(); errorLogin('');
    $('btn-entrar').disabled = true;
    api('verificar', { correo: estado.correo, codigo: $('codigo').value }).then(function(j){
      $('btn-entrar').disabled = false;
      if(!j.ok){ errorLogin(j.error || 'Código incorrecto.'); return; }
      iniciar();
    }).catch(function(){ $('btn-entrar').disabled = false; errorLogin('No hay conexión. Intente de nuevo.'); });
  });
  $('btn-otro').addEventListener('click', function(){
    errorLogin(''); $('form-codigo').hidden = true; $('form-correo').hidden = false; $('login-ayuda').hidden = false; $('correo').focus();
  });
  $('btn-salir').addEventListener('click', function(){ api('salir', {}).then(function(){ location.reload(); }); });

  // ---------- estructura ----------
  function iniciar(){
    api('sesion', null, estado.como ? '&como=' + encodeURIComponent(estado.como) : '').then(function(s){
      if(!s.ok){ mostrar('login'); if(s._estado >= 500) errorLogin(s.error || 'El portal no está disponible en este momento.'); return; }
      estado.demo = !!s.demo; estado.equipo = !!s.equipo; estado.opciones = s.opciones || []; estado.clientes = s.clientes || []; estado.grupo = !!s.grupo;
      estado.como = s.como || ''; estado.elegido = 'todos'; estado.panel = 'procesos'; estado.cargado = {};
      $('aviso-demo').hidden = !estado.demo; $('aviso-demo2').hidden = !estado.demo;
      $('usuario').textContent = s.nombre || s.correo;
      mostrar('app');
      if(estado.equipo && !estado.como){ vistaElegirCliente(); return; }
      vistaCliente();
    }).catch(function(){ mostrar('login'); });
  }
  // ---------- equipo Lexara: ver el portal como un cliente ----------
  function nombreOpcionActual(){ var o = estado.opciones.filter(function(x){ return x.id === estado.como; })[0]; return o ? o.nombre : ''; }
  function vistaElegirCliente(){
    try{ sessionStorage.removeItem('lexara-como'); }catch(e){}
    estado.como = '';
    $('franja-equipo').hidden = true; $('selector').hidden = true; $('pestanas').hidden = true; cerrarMenu();
    ['procesos', 'resumen', 'tutelas'].forEach(function(p){ $('panel-' + p).hidden = true; });
    $('panel-equipo').hidden = false; $('titulo').textContent = 'Equipo Lexara'; errorApp('');
    pintarClientes();
  }
  function pintarClientes(){
    var q = sinTildes($('buscar-cliente').value.trim());
    var lista = estado.opciones.filter(function(o){ return !q || sinTildes(o.nombre).indexOf(q) >= 0; });
    var cont = $('rejilla-clientes'); cont.textContent = '';
    lista.forEach(function(o){
      var b = el('button', 'tarjeta-cliente' + (o.grupo ? ' grupo' : ''));
      b.type = 'button';
      b.appendChild(el('span', 'tc-nombre', o.nombre));
      b.appendChild(el('span', 'tc-tipo', o.grupo ? 'Grupo · varios clientes, resumen y tutelas' : 'Cliente'));
      b.addEventListener('click', function(){ elegirCliente(o.id); });
      cont.appendChild(b);
    });
    $('conteo-clientes').textContent = lista.length + (lista.length === 1 ? ' opción' : ' opciones');
  }
  function elegirCliente(id){
    try{ sessionStorage.setItem('lexara-como', id); }catch(e){}
    estado.como = id; iniciar();
  }
  $('buscar-cliente').addEventListener('input', pintarClientes);
  $('btn-cambiar').addEventListener('click', vistaElegirCliente);
  function vistaCliente(){
    $('panel-equipo').hidden = true;
    var f = $('franja-equipo');
    if(estado.equipo){ $('franja-texto').textContent = 'Vista del equipo Lexara · está viendo el portal como «' + nombreOpcionActual() + '»'; f.hidden = false; } else { f.hidden = true; }
    $('titulo').textContent = estado.equipo ? nombreOpcionActual() : (estado.clientes.length === 1 ? 'Procesos de ' + estado.clientes[0] : (estado.grupo ? 'Grupo Colmédica' : 'Sus procesos'));
    mostrarMenu(); armarSelector(); marcarPestana(); cargarPanel();
  }

  function armarSelector(){
    var cont = $('selector'), sel = $('sel-cliente');
    if(estado.clientes.length < 2){ cont.hidden = true; estado.elegido = 'todos'; return; }
    cont.hidden = false; sel.textContent = '';
    ['todos'].concat(estado.clientes).forEach(function(c){
      var o = el('option', null, c === 'todos' ? 'Todos los clientes' : c); o.value = c; sel.appendChild(o);
    });
    sel.value = estado.elegido;
  }
  $('sel-cliente').addEventListener('change', function(){ estado.elegido = this.value; estado.cargado = {}; cargarPanel(); });
  // menú lateral: «Resumen» y «Tutelas» solo para el grupo; en celular el menú se abre con ☰
  function mostrarMenu(){
    $('pestanas').hidden = false;
    [].forEach.call(document.querySelectorAll('#pestanas [data-solo-grupo]'), function(b){ b.hidden = !estado.grupo; });
  }
  function cerrarMenu(){ $('vista-app').classList.remove('menu-abierto'); $('btn-menu').setAttribute('aria-expanded', 'false'); }
  $('btn-menu').addEventListener('click', function(){ var abierto = $('vista-app').classList.toggle('menu-abierto'); this.setAttribute('aria-expanded', String(abierto)); });
  $('velo').addEventListener('click', cerrarMenu);
  function marcarPestana(){
    [].forEach.call(document.querySelectorAll('#pestanas button'), function(b){ b.setAttribute('aria-selected', String(b.getAttribute('data-panel') === estado.panel)); });
    ['procesos', 'resumen', 'tutelas'].forEach(function(p){ $('panel-' + p).hidden = p !== estado.panel; });
  }
  [].forEach.call(document.querySelectorAll('#pestanas button'), function(b){
    b.addEventListener('click', function(){ estado.panel = b.getAttribute('data-panel'); marcarPestana(); cargarPanel(); cerrarMenu(); });
  });
  function cargarPanel(){
    errorApp('');
    if(estado.cargado[estado.panel]) return;
    if(estado.panel === 'procesos') cargarProcesos();
    else if(estado.panel === 'resumen') cargarResumen();
    else cargarTutelas();
  }

  // ---------- reportes: los informes REALES de la app (Excel y PDF con membrete y firma), cargados solo cuando se piden ----------
  var cargandoExport = null;
  function cargarExportar(){
    if(window.PortalExport) return Promise.resolve(window.PortalExport);
    if(!cargandoExport){
      cargandoExport = new Promise(function(resolve, reject){
        var s = document.createElement('script'); s.src = 'exportar.js?v=20261111j';
        s.onload = function(){ window.PortalExport ? resolve(window.PortalExport) : reject(new Error('El generador de reportes no cargó bien.')); };
        s.onerror = function(){ cargandoExport = null; reject(new Error('No se pudo cargar el generador de reportes. Revise su conexión e intente de nuevo.')); };
        document.head.appendChild(s);
      });
    }
    return cargandoExport;
  }
  // Ejecuta un reporte mostrando «Generando…» en el botón y avisando si algo falla.
  function ejecutar(btn, tarea){
    var texto = btn.textContent; btn.disabled = true; btn.textContent = 'Generando…'; errorApp('');
    cargarExportar().then(tarea).catch(function(err){ console.error(err); errorApp('No se pudo generar el reporte: ' + (err && err.message ? err.message : err)); })
      .then(function(){ btn.disabled = false; btn.textContent = texto; });
  }
  function boton(clase, texto, titulo, onClick){
    var b = el('button', 'btn-informe ' + clase, texto); b.type = 'button'; if(titulo) b.title = titulo;
    b.addEventListener('click', function(ev){ ev.stopPropagation(); onClick(b); });
    return b;
  }
  // La Entidad (elige el formato del informe: Grupo Colmédica, Aliansalud, Famisanar, SOS o el genérico de Lexara) y el nombre que sale en el archivo y en la carta.
  function entidadDe(lista){
    var set = {}; lista.forEach(function(p){ set[p.Entidad || ''] = true; });
    var k = Object.keys(set); return k.length === 1 ? k[0] : '';
  }
  function nombreDe(lista){
    if(estado.grupo && estado.elegido === 'todos') return 'Grupo Colmédica';
    if(estado.elegido !== 'todos') return estado.elegido;
    var c = {}; lista.forEach(function(p){ c[p.Cliente || ''] = true; });
    var k = Object.keys(c); return k.length === 1 ? k[0] : (estado.clientes.length === 1 ? estado.clientes[0] : 'Clientes');
  }

  // ---------- color: «semáforo» del último estado, igual al de la app (menos de 6 meses verde, menos de 12 ámbar, más rojo) ----------
  function semaforo(p){
    if(/termin/i.test(p.EstadoVT || '')) return { c: 'gris', t: 'Proceso terminado' };
    var f = p.FechaUltimoEstado; if(!f) return { c: 'gris', t: 'Sin fecha de estado' };
    var dias = Math.floor((Date.now() - new Date(f + 'T00:00:00').getTime()) / 86400000);
    if(isNaN(dias)) return { c: 'gris', t: 'Sin fecha de estado' };
    var meses = dias / 30.44, mm = Math.floor(meses);
    var t = dias < 1 ? 'Actualizado hoy' : dias < 31 ? 'Actualizado hace ' + dias + ' día' + (dias === 1 ? '' : 's') : 'Actualizado hace ' + mm + ' mes' + (mm === 1 ? '' : 'es');
    return { c: meses < 6 ? 'verde' : meses < 12 ? 'ambar' : 'rojo', t: t };
  }
  var PALETA = ['#52bbb5', '#ef7d00', '#fbbc33', '#2f7fb8', '#7a5fb5', '#1f7a4d', '#c4458a', '#6b8f3a'];
  var dinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

  // ---------- procesos ----------
  function cargarProcesos(){
    $('cargando').hidden = false; $('lista').textContent = ''; $('vacio').hidden = true;
    api('procesos', null, consulta()).then(function(j){
      $('cargando').hidden = true;
      if(manejarError(j)) return;
      estado.procesos = j.procesos || []; estado.cargado.procesos = true; pintarProcesos();
    }).catch(function(){ $('cargando').hidden = true; errorApp('No hay conexión. Intente de nuevo.'); });
  }
  function fila(dt, dd){
    if(!dd) return null;
    var f = document.createDocumentFragment();
    f.appendChild(el('dt', null, dt)); f.appendChild(el('dd', null, dd)); return f;
  }
  // «Ver más»: trazabilidad (fechas del proceso), histórico y, si los tiene, la tabla de desistimientos.
  function panelMas(p){
    var cont = el('div', 'p-mas');
    var sec = el('section', 'mas-sec'); sec.appendChild(el('h4', null, 'Trazabilidad'));
    var rejilla = el('div', 'tiles');
    [['Fecha de admisión', fechaCorta(p.FechaAdmision)], ['Fecha de contestación', fechaCorta(p.FechaContestacion)], ['Fecha instancia', fechaCorta(p.FechaInstancia)],
     ['Reforma de demanda', fechaCorta(p.FechaReformaDemanda)], ['Posible terminación', fechaCorta(p.FechaTerminacion)], ['Radicación del proceso', fechaCorta(p.RadicacionProceso)],
     ['Admitida', p.Admitida], ['Prueba pericial', p.PruebaPericial], ['Origen / tipo glosa', p.OrigenTipoGlosa], ['No. completo', p.NoCompleto], ['Apoderado', p.Apoderado], ['Tipo de acción', p.TipoAccion]
    ].forEach(function(par){ var t = el('div', 'tile'); t.appendChild(el('span', 'tile-l', par[0])); t.appendChild(el('span', 'tile-v', par[1] || '—')); rejilla.appendChild(t); });
    sec.appendChild(rejilla); cont.appendChild(sec);
    if(p.Historico){
      var h = el('section', 'mas-sec'); h.appendChild(el('h4', null, 'Histórico')); h.appendChild(el('div', 'historico', p.Historico)); cont.appendChild(h);
    }
    var des = p.Desistimientos || [];
    if(des.length){
      var d = el('section', 'mas-sec'); d.appendChild(el('h4', null, 'Desistimientos (' + des.length + ')'));
      var caja = el('div', 'tabla-caja'); var tabla = el('table', 'tabla');
      var cab = el('tr'); ['Fecha de radicación', 'Aprobación', 'Fecha de aprobación', 'Valor', 'Observaciones'].forEach(function(c, i){ var th = el('th', i === 3 ? 'num' : null, c); cab.appendChild(th); });
      var th = el('thead'); th.appendChild(cab); tabla.appendChild(th);
      var tb = el('tbody');
      des.forEach(function(x){
        var tr = el('tr');
        tr.appendChild(el('td', null, fechaCorta(x.FechaRadicacion) || '—'));
        var ap = el('td'); var a = (x.Aprobacion || '').toLowerCase();
        ap.appendChild(el('span', 'insignia ' + (/aprob/.test(a) ? 'ok' : /rechaz|negad/.test(a) ? 'mal' : 'pend'), x.Aprobacion || 'Sin decisión')); tr.appendChild(ap);
        tr.appendChild(el('td', null, fechaCorta(x.FechaAprobacion) || '—'));
        tr.appendChild(el('td', 'num', x.Valor ? dinero.format(x.Valor) : '—'));
        tr.appendChild(el('td', null, x.Observaciones || '—'));
        tb.appendChild(tr);
      });
      tabla.appendChild(tb); caja.appendChild(tabla); d.appendChild(caja); cont.appendChild(d);
    }
    return cont;
  }
  function tarjetaProceso(p){
    var art = el('article', 'proceso'); var s = semaforo(p);
    var cab = el('header', 'p-cab ' + s.c);
    var tit = el('div'); tit.appendChild(el('div', 'rad', p.Radicado || 'Sin radicado')); tit.appendChild(el('div', 'cli', p.Cliente || ''));
    cab.appendChild(tit);
    var der = el('div', 'p-cab-der');
    if(p.EtapaProcesal) der.appendChild(el('span', 'etapa', p.EtapaProcesal));
    der.appendChild(el('span', 'sem ' + s.c, s.t));
    cab.appendChild(der);
    var cuerpo = el('div', 'p-cuerpo');
    var dl = el('dl');
    [['Juzgado', p.Despacho], ['Demandante', p.Demandante], ['Demandado', p.Demandado], ['Tipo', p.TipoProceso], ['Instancia', p.Instancia]].forEach(function(par){ var f = fila(par[0], par[1]); if(f) dl.appendChild(f); });
    var est = el('div', 'p-estado');
    est.appendChild(el('span', 'fecha', p.FechaUltimoEstado ? 'Último estado · ' + fechaCorta(p.FechaUltimoEstado) : 'Último estado'));
    var texto = p.Estado || 'Sin novedades registradas.';
    est.appendChild(el('div', 'estado', texto.length > 600 ? texto.slice(0, 600).replace(/\s+\S*$/, '') + '…' : texto));
    cuerpo.appendChild(dl); cuerpo.appendChild(est);
    // pie: reportes de ESTE proceso (a la izquierda) y «Ver más» (a la derecha)
    var pie = el('footer', 'p-pie');
    var izq = el('div', 'p-pie-izq');
    izq.appendChild(boton('pdf', 'Ficha PDF', 'Ficha de este proceso en PDF', function(b){ ejecutar(b, function(X){ return X.ficha(p); }); }));
    izq.appendChild(boton('excel', 'Excel', 'Este proceso en Excel (formato de Informes)', function(b){ ejecutar(b, function(X){ return X.procesos('excel', p.Entidad, p.Cliente + ' ' + p.Radicado, [p]); }); }));
    var nDes = (p.Desistimientos || []).length;
    var mas = el('button', 'btn-mas', 'Ver más' + (nDes ? ' · ' + nDes + ' desistimiento' + (nDes === 1 ? '' : 's') : '') + ' ▾');
    mas.type = 'button'; mas.setAttribute('aria-expanded', 'false');
    var panel = null;
    mas.addEventListener('click', function(){
      var abierto = mas.getAttribute('aria-expanded') === 'true';
      if(!panel){ panel = panelMas(p); art.appendChild(panel); }
      panel.hidden = abierto; mas.setAttribute('aria-expanded', String(!abierto));
      mas.textContent = (abierto ? 'Ver más' : 'Ver menos') + (nDes ? ' · ' + nDes + ' desistimiento' + (nDes === 1 ? '' : 's') : '') + (abierto ? ' ▾' : ' ▴');
    });
    pie.appendChild(izq); pie.appendChild(mas);
    art.appendChild(cab); art.appendChild(cuerpo); art.appendChild(pie);
    return art;
  }
  function procesosFiltrados(){
    var q = sinTildes($('buscar').value.trim());
    return estado.procesos.filter(function(p){
      return !q || sinTildes([p.Radicado, p.Despacho, p.Demandante, p.Demandado, p.Cliente, p.EtapaProcesal, p.Estado, p.NoCompleto].join(' ')).indexOf(q) >= 0;
    });
  }
  function pintarProcesos(){
    var lista = procesosFiltrados();
    var cont = $('lista'); cont.textContent = '';
    lista.forEach(function(p){ cont.appendChild(tarjetaProceso(p)); });
    $('vacio').hidden = lista.length > 0;
    $('conteo').textContent = lista.length + (lista.length === 1 ? ' proceso' : ' procesos');
    $('btn-procesos-excel').disabled = $('btn-procesos-pdf').disabled = !lista.length;
  }
  $('buscar').addEventListener('input', pintarProcesos);
  $('btn-procesos-excel').addEventListener('click', function(){ var b = this, l = procesosFiltrados(); ejecutar(b, function(X){ return X.procesos('excel', entidadDe(l), nombreDe(l), l); }); });
  $('btn-procesos-pdf').addEventListener('click', function(){ var b = this, l = procesosFiltrados(); ejecutar(b, function(X){ return X.procesos('pdf', entidadDe(l), nombreDe(l), l); }); });

  // ---------- resumen estadístico (barras de colores) ----------
  function tarjeta(valor, etiqueta, extra){
    var t = el('div', 'kpi' + (extra ? ' ' + extra : ''));
    t.appendChild(el('div', 'kpi-n', String(valor))); t.appendChild(el('div', 'kpi-l', etiqueta)); return t;
  }
  function barras(titulo, datos, formato){
    var caja = el('section', 'grafico');
    caja.appendChild(el('h3', null, titulo));
    if(!datos || !datos.length){ caja.appendChild(el('p', 'suave', 'Sin datos.')); return caja; }
    var max = Math.max.apply(null, datos.map(function(d){ return d.cantidad; })) || 1;
    var ul = el('ul', 'barras');
    datos.forEach(function(d, i){
      var li = el('li');
      li.appendChild(el('span', 'barra-nombre', formato ? formato(d) : d.nombre));
      var pista = el('span', 'barra-pista'); var rel = el('span', 'barra-relleno'); rel.style.width = Math.max(3, Math.round(d.cantidad * 100 / max)) + '%'; rel.style.background = PALETA[i % PALETA.length]; pista.appendChild(rel);
      li.appendChild(pista); li.appendChild(el('span', 'barra-n', String(d.cantidad)));
      ul.appendChild(li);
    });
    caja.appendChild(ul); return caja;
  }
  function cargarResumen(){
    $('cargando-resumen').hidden = false; $('resumen').textContent = '';
    api('resumen', null, consulta()).then(function(j){
      $('cargando-resumen').hidden = true;
      if(manejarError(j)) return;
      estado.cargado.resumen = true;
      var r = j.resumen || {}, p = r.procesos || {}, t = r.tutelas || {};
      var cont = $('resumen'); cont.textContent = '';
      var kpis = el('div', 'kpis');
      kpis.appendChild(tarjeta(p.total || 0, 'Procesos', 'azul'));
      kpis.appendChild(tarjeta(t.total || 0, 'Tutelas', 'turquesa'));
      kpis.appendChild(tarjeta(t.enviadas || 0, 'Contestaciones enviadas', 'ok'));
      kpis.appendChild(tarjeta(t.porEnviar || 0, 'Por enviar', 'pend'));
      cont.appendChild(kpis);
      var rejilla = el('div', 'graficos');
      rejilla.appendChild(barras('Tutelas por mes (vencimiento)', t.porMes, function(d){ return nombreMes(d.mes); }));
      rejilla.appendChild(barras('Tutelas por cliente', t.porCliente));
      rejilla.appendChild(barras('Tutelas por tipo de respuesta', t.porTipo));
      rejilla.appendChild(barras('Tutelas por entidad', t.porEntidad));
      rejilla.appendChild(barras('Procesos por cliente', p.porCliente));
      rejilla.appendChild(barras('Procesos por etapa procesal', p.porEtapa));
      rejilla.appendChild(barras('Procesos por tipo', p.porTipo));
      cont.appendChild(rejilla);
    }).catch(function(){ $('cargando-resumen').hidden = true; errorApp('No hay conexión. Intente de nuevo.'); });
  }

  // ---------- tutelas: por mes y por rango «desde – hasta» (fecha de vencimiento) ----------
  function cargarTutelas(){
    $('cargando-tutelas').hidden = false; $('lista-tutelas').textContent = ''; $('vacio-tutelas').hidden = true;
    api('tutelas', null, consulta()).then(function(j){
      $('cargando-tutelas').hidden = true;
      if(manejarError(j)) return;
      estado.tutelas = j.tutelas || []; estado.cargado.tutelas = true;
      var meses = {}; estado.tutelas.forEach(function(x){ var m = (x.FechaVencimiento || '').slice(0, 7); if(m) meses[m] = true; });
      var sel = $('filtro-mes'); var actual = sel.value; sel.textContent = ''; sel.appendChild(Object.assign(el('option', null, 'Todos los meses'), { value: '' }));
      Object.keys(meses).sort().reverse().forEach(function(m){ sel.appendChild(Object.assign(el('option', null, nombreMes(m)), { value: m })); });
      sel.value = meses[actual] ? actual : '';
      pintarTutelas();
    }).catch(function(){ $('cargando-tutelas').hidden = true; errorApp('No hay conexión. Intente de nuevo.'); });
  }
  function tutelasFiltradas(){
    var q = sinTildes($('buscar-tutelas').value.trim()), envio = $('filtro-envio').value, mes = $('filtro-mes').value, desde = $('desde-tutelas').value, hasta = $('hasta-tutelas').value;
    return estado.tutelas.filter(function(x){
      var v = x.FechaVencimiento || '';
      if(envio === 'enviada' && !x.Contestada) return false;
      if(envio === 'pendiente' && x.Contestada) return false;
      if(mes && v.slice(0, 7) !== mes) return false;
      if(desde && (!v || v < desde)) return false;
      if(hasta && (!v || v > hasta)) return false;
      return !q || sinTildes([x.NoTutela, x.Juzgado, x.Usuario, x.Entidad, x.Cliente, x.TipoRespuesta, x.Ciudad].join(' ')).indexOf(q) >= 0;
    });
  }
  function descripcionRango(){
    var mes = $('filtro-mes').value, desde = $('desde-tutelas').value, hasta = $('hasta-tutelas').value, partes = [];
    if(mes) partes.push('en ' + nombreMes(mes));
    if(desde || hasta) partes.push((desde ? 'desde ' + fechaCorta(desde) : '') + (desde && hasta ? ' ' : '') + (hasta ? 'hasta ' + fechaCorta(hasta) : ''));
    return partes.length ? 'con vencimiento ' + partes.join(', ') : '';
  }
  function nombreTutelas(){ return estado.elegido !== 'todos' ? estado.elegido : (estado.grupo ? 'Grupo Colmédica' : (estado.clientes[0] || 'Clientes')); }
  function valoresEntidad(){
    if(estado.valores) return Promise.resolve(estado.valores);
    return api('valores', null, consulta()).then(function(j){ estado.valores = j.ok ? (j.valores || []) : []; return estado.valores; });
  }
  function exportarTutelas(tipo, lista, rango){
    var nombre = nombreTutelas();
    return cargarExportar().then(function(X){
      if(tipo === 'excel') return valoresEntidad().then(function(v){ return X.tutelasExcel(lista, v, ('Tutelas ' + nombre + (rango ? ' - ' + rango.replace(/^con vencimiento (en )?/, '') : '') + '.xlsx').replace(/[\/\\?%*:|"<>]/g, '-')); });
      return X.tutelasPDF(lista, nombre, rango);
    });
  }
  function tarjetaTutela(x){
    var tipo = sinTildes(x.TipoRespuesta || '');
    var art = el('article', 'proceso tutela');
    var cab = el('header', 'p-cab ' + (x.Contestada ? 'verde' : 'ambar'));
    var tit = el('div'); tit.appendChild(el('div', 'rad', 'Tutela ' + (x.NoTutela || 'sin número'))); tit.appendChild(el('div', 'cli', x.Cliente || ''));
    cab.appendChild(tit);
    var der = el('div', 'p-cab-der');
    if(x.TipoRespuesta) der.appendChild(el('span', 'etapa tipo-' + (/impug/.test(tipo) ? 'impug' : /^tutela/.test(tipo) ? 'tutela' : 'otras'), x.TipoRespuesta));
    der.appendChild(el('span', 'insignia ' + (x.Contestada ? 'ok' : 'pend'), x.Contestada ? 'Contestación enviada' : 'Por enviar'));
    cab.appendChild(der);
    var cuerpo = el('div', 'p-cuerpo');
    var dl = el('dl');
    [['Accionante', x.Usuario], ['Entidad', x.Entidad], ['Juzgado', x.Juzgado], ['Ciudad', [x.Ciudad, x.Departamento].filter(Boolean).join(', ')], ['Prestación', x.Prestacion], ['Tema', x.Tema]].forEach(function(par){ var f = fila(par[0], par[1]); if(f) dl.appendChild(f); });
    var est = el('div', 'p-estado');
    est.appendChild(el('span', 'fecha', 'Fechas'));
    var fl = el('dl');
    [['Notificación', fechaCorta(x.FechaNotificacion)], ['Vencimiento', fechaCorta(x.FechaVencimiento)], ['Enviada', x.Contestada ? fechaCorta(x.FechaContestacion) : '']].forEach(function(par){ var f = fila(par[0], par[1]); if(f) fl.appendChild(f); });
    est.appendChild(fl);
    cuerpo.appendChild(dl); cuerpo.appendChild(est);
    var pie = el('footer', 'p-pie'); var izq = el('div', 'p-pie-izq');
    izq.appendChild(boton('pdf', 'PDF', 'Esta tutela en PDF', function(b){ ejecutar(b, function(){ return exportarTutelas('pdf', [x], 'correspondiente a la tutela ' + (x.NoTutela || '')); }); }));
    izq.appendChild(boton('excel', 'Excel', 'Esta tutela en Excel', function(b){ ejecutar(b, function(){ return exportarTutelas('excel', [x], 'Tutela ' + (x.NoTutela || '')); }); }));
    pie.appendChild(izq);
    art.appendChild(cab); art.appendChild(cuerpo); art.appendChild(pie);
    return art;
  }
  function pintarTutelas(){
    var lista = tutelasFiltradas();
    var cont = $('lista-tutelas'); cont.textContent = '';
    lista.forEach(function(x){ cont.appendChild(tarjetaTutela(x)); });
    $('vacio-tutelas').hidden = lista.length > 0;
    $('conteo-tutelas').textContent = lista.length + (lista.length === 1 ? ' tutela' : ' tutelas');
    $('btn-tutelas-excel').disabled = $('btn-tutelas-pdf').disabled = !lista.length;
  }
  ['buscar-tutelas'].forEach(function(id){ $(id).addEventListener('input', pintarTutelas); });
  ['filtro-envio', 'filtro-mes', 'desde-tutelas', 'hasta-tutelas'].forEach(function(id){ $(id).addEventListener('change', pintarTutelas); });
  $('btn-limpiar-tutelas').addEventListener('click', function(){
    $('buscar-tutelas').value = ''; $('filtro-envio').value = ''; $('filtro-mes').value = ''; $('desde-tutelas').value = ''; $('hasta-tutelas').value = ''; pintarTutelas();
  });
  $('btn-tutelas-excel').addEventListener('click', function(){ var l = tutelasFiltradas(), r = descripcionRango(); ejecutar(this, function(){ return exportarTutelas('excel', l, r); }); });
  $('btn-tutelas-pdf').addEventListener('click', function(){ var l = tutelasFiltradas(), r = descripcionRango(); ejecutar(this, function(){ return exportarTutelas('pdf', l, r); }); });
  // al cambiar de cliente o de «ver como», los valores de entidad se vuelven a pedir
  $('sel-cliente').addEventListener('change', function(){ estado.valores = null; });

  try{ estado.como = sessionStorage.getItem('lexara-como') || ''; }catch(e){ estado.como = ''; }
  iniciar();
})();
