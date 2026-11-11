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
      if(!s.ok){ mostrar('login'); return; }
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
  function pintarProcesos(){
    var q = sinTildes($('buscar').value.trim());
    var lista = estado.procesos.filter(function(p){
      return !q || sinTildes([p.Radicado, p.Despacho, p.Demandante, p.Demandado, p.Cliente, p.EtapaProcesal, p.Estado].join(' ')).indexOf(q) >= 0;
    });
    var cont = $('lista'); cont.textContent = '';
    lista.forEach(function(p){
      var art = el('article', 'proceso');
      var cab = el('header', 'p-cab');
      var tit = el('div'); tit.appendChild(el('div', 'rad', p.Radicado || 'Sin radicado')); tit.appendChild(el('div', 'cli', p.Cliente || ''));
      cab.appendChild(tit);
      if(p.EtapaProcesal) cab.appendChild(el('span', 'etapa', p.EtapaProcesal));
      var cuerpo = el('div', 'p-cuerpo');
      var dl = el('dl');
      [['Juzgado', p.Despacho], ['Demandante', p.Demandante], ['Demandado', p.Demandado], ['Tipo', p.TipoProceso], ['Instancia', p.Instancia]].forEach(function(par){ var f = fila(par[0], par[1]); if(f) dl.appendChild(f); });
      var est = el('div', 'p-estado');
      est.appendChild(el('span', 'fecha', p.FechaUltimoEstado ? 'Último estado · ' + fechaCorta(p.FechaUltimoEstado) : 'Último estado'));
      est.appendChild(el('div', 'estado', p.Estado || 'Sin novedades registradas.'));
      cuerpo.appendChild(dl); cuerpo.appendChild(est);
      art.appendChild(cab); art.appendChild(cuerpo);
      cont.appendChild(art);
    });
    $('vacio').hidden = lista.length > 0;
    $('conteo').textContent = lista.length + (lista.length === 1 ? ' proceso' : ' procesos');
  }
  $('buscar').addEventListener('input', pintarProcesos);

  // ---------- resumen estadístico ----------
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
    datos.forEach(function(d){
      var li = el('li');
      li.appendChild(el('span', 'barra-nombre', formato ? formato(d) : d.nombre));
      var pista = el('span', 'barra-pista'); var rel = el('span', 'barra-relleno'); rel.style.width = Math.max(3, Math.round(d.cantidad * 100 / max)) + '%'; pista.appendChild(rel);
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
      kpis.appendChild(tarjeta(p.total || 0, 'Procesos'));
      kpis.appendChild(tarjeta(t.total || 0, 'Tutelas'));
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

  // ---------- tutelas ----------
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
  function pintarTutelas(){
    var q = sinTildes($('buscar-tutelas').value.trim()), envio = $('filtro-envio').value, mes = $('filtro-mes').value;
    var lista = estado.tutelas.filter(function(x){
      if(envio === 'enviada' && !x.Contestada) return false;
      if(envio === 'pendiente' && x.Contestada) return false;
      if(mes && (x.FechaVencimiento || '').slice(0, 7) !== mes) return false;
      return !q || sinTildes([x.NoTutela, x.Juzgado, x.Usuario, x.Entidad, x.Cliente, x.TipoRespuesta, x.Ciudad].join(' ')).indexOf(q) >= 0;
    });
    var cont = $('lista-tutelas'); cont.textContent = '';
    lista.forEach(function(x){
      var art = el('article', 'proceso tutela');
      var cab = el('header', 'p-cab');
      var tit = el('div'); tit.appendChild(el('div', 'rad', 'Tutela ' + (x.NoTutela || 'sin número'))); tit.appendChild(el('div', 'cli', x.Cliente || ''));
      cab.appendChild(tit);
      cab.appendChild(el('span', 'insignia ' + (x.Contestada ? 'ok' : 'pend'), x.Contestada ? 'Contestación enviada' : 'Por enviar'));
      var cuerpo = el('div', 'p-cuerpo');
      var dl = el('dl');
      [['Accionante', x.Usuario], ['Entidad', x.Entidad], ['Juzgado', x.Juzgado], ['Ciudad', [x.Ciudad, x.Departamento].filter(Boolean).join(', ')], ['Tipo', x.TipoRespuesta]].forEach(function(par){ var f = fila(par[0], par[1]); if(f) dl.appendChild(f); });
      var est = el('div', 'p-estado');
      est.appendChild(el('span', 'fecha', 'Fechas'));
      var fl = el('dl'); fl.className = 'fechas';
      [['Notificación', fechaCorta(x.FechaNotificacion)], ['Vencimiento', fechaCorta(x.FechaVencimiento)], ['Enviada', x.Contestada ? fechaCorta(x.FechaContestacion) : '']].forEach(function(par){ var f = fila(par[0], par[1]); if(f) fl.appendChild(f); });
      est.appendChild(fl);
      cuerpo.appendChild(dl); cuerpo.appendChild(est);
      art.appendChild(cab); art.appendChild(cuerpo);
      cont.appendChild(art);
    });
    $('vacio-tutelas').hidden = lista.length > 0;
    $('conteo-tutelas').textContent = lista.length + (lista.length === 1 ? ' tutela' : ' tutelas');
  }
  ['buscar-tutelas'].forEach(function(id){ $(id).addEventListener('input', pintarTutelas); });
  ['filtro-envio', 'filtro-mes'].forEach(function(id){ $(id).addEventListener('change', pintarTutelas); });

  try{ estado.como = sessionStorage.getItem('lexara-como') || ''; }catch(e){ estado.como = ''; }
  iniciar();
})();
