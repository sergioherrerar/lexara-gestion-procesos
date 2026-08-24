import { stripHtml, parseMonto, desistimientosForProceso } from './graph';

// Exportación HTML del panel "Análisis de procesos por Entidad" del
// Dashboard (pedido explícito del usuario 2026-08-22: "que quedara en buen
// formato dinámico... que exporte una entidad completa"). A diferencia del
// Excel/Word/PDF (estáticos una vez descargados), este archivo .html es
// autocontenido y de verdad interactivo: los 6 filtros y los gráficos
// siguen funcionando abriéndolo directo en el navegador, sin conexión a la
// app ni a SharePoint — los datos de la Entidad elegida quedan embebidos
// adentro como JSON.
//
// Duplica a propósito los helpers campoX/opcionesConConteo de
// DashboardView.jsx (no se puede importar un componente React dentro de un
// <script> plano embebido en un string) — si se agrega un campo nuevo al
// panel de Dashboard, replicar el cambio aquí también.

const PALETA = ['#004941', '#ef7d00', '#52bbb5', '#a3281c', '#1d5fa3', '#8a6410', '#6b5115', '#5c6b68'];

function campoGlosa(p){ return stripHtml(p.GlosaDemandada || p.OrigenTipoGlosa) || "Sin dato"; }
function campoNaturaleza(p){ return stripHtml(p.NaturalezaProceso || p.TipoAccion) || "Sin dato"; }
function campoSubclasificacion(p){ return stripHtml(p.Subclasificacion || p.TipoProceso) || "Sin dato"; }
function campoAdmitida(p){ return stripHtml(p.Admitida) || "Sin dato"; }
function campoPrueba(p){ return stripHtml(p.PruebaPericial) || "Sin dato"; }
function campoEtapa(p){ return stripHtml(p.EtapaProcesal) || "Sin dato"; }

function escapeJsonParaScript(json){
  // Evita que un "</script>" dentro de un valor de texto real corte el
  // bloque <script> a la mitad (mitigación estándar al embeber JSON en HTML).
  return json.replace(/<\/script/gi, '<\\/script');
}

export function generarDashboardEntidadHTML(procesos, desistimientos, entidad){
  const procesosEntidad = entidad === 'todas'
    ? procesos
    : procesos.filter(p => (stripHtml(p.Entidad) || "Sin entidad") === entidad);

  const filas = procesosEntidad.map(p => {
    const propios = desistimientosForProceso(desistimientos, p);
    const d = propios.map(des => {
      const crudo = stripHtml(des.Aprobacion) || "Sin dato";
      const estado = crudo === "Sin dato" ? crudo : crudo.charAt(0).toUpperCase() + crudo.slice(1).toLowerCase();
      return { estado, valor: parseMonto(des.DesistimientoValor) };
    });
    return {
      glosa: campoGlosa(p),
      naturaleza: campoNaturaleza(p),
      subclasificacion: campoSubclasificacion(p),
      admitida: campoAdmitida(p),
      pruebaPericial: campoPrueba(p),
      etapa: campoEtapa(p),
      valorCartera: parseMonto(p.ValorCarteraActual || p.ValorActualDemanda),
      d,
    };
  });

  const titulo = entidad === 'todas' ? 'Todas las entidades' : entidad;
  const fechaLarga = new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'long', year:'numeric' });

  const html = construirHTML(filas, titulo, fechaLarga);
  descargarHTML(html, titulo);
}

function descargarHTML(html, titulo){
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const hoy = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `Analisis de procesos - ${titulo} - ${hoy}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function construirHTML(filas, titulo, fechaLarga){
  const dataJson = escapeJsonParaScript(JSON.stringify(filas));
  const paletaJson = JSON.stringify(PALETA);

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Inter:wght@400;500;600;700&display=swap');
    :root{
      --verde-oscuro:#004941; --verde-oscuro-2:#003630; --verde-claro:#52bbb5;
      --naranja:#ef7d00; --gris:#d0d0d0; --gris-claro:#f4f4f2; --gris-linea:#e4e4e1;
      --texto:#1c2624; --texto-suave:#5c6b68;
      --font-display:'Fraunces', Georgia, serif; --font-body:'Inter', Arial, sans-serif; --font-mono:'Inter', monospace;
      --radius:12px; --shadow:0 1px 3px rgba(0,20,18,.08);
    }
    *{box-sizing:border-box;}
    body{margin:0; font-family:var(--font-body); background:var(--gris-claro); color:var(--texto); -webkit-font-smoothing:antialiased;}
    .header{background:var(--verde-oscuro); background:radial-gradient(circle at 15% 20%, var(--verde-oscuro-2), var(--verde-oscuro) 65%); color:#fff; padding:26px 28px;}
    .header .marca{display:flex; align-items:center; gap:10px; margin-bottom:14px;}
    .header .marca svg{width:22px; height:22px; color:#fff;}
    .header .marca span{font-weight:700; letter-spacing:.06em; font-size:13px; text-transform:uppercase;}
    .header h1{font-family:var(--font-display); font-size:23px; font-weight:600; margin:0 0 4px;}
    .header p{margin:0; font-size:12.5px; color:rgba(255,255,255,.75);}
    .contenido{max-width:1100px; margin:0 auto; padding:24px 20px 60px;}
    .save-hint{font-size:12.5px; color:var(--texto-suave); margin:0 0 16px;}
    .clear-filters-link{font-size:12px; color:var(--verde-oscuro); cursor:pointer; text-decoration:underline; background:none; border:none; padding:0; font-weight:600; font-family:inherit;}
    .panel-grid{display:grid; grid-template-columns:repeat(2,1fr); gap:16px;}
    .panel{background:#fff; border:1px solid var(--gris-linea); border-radius:var(--radius); box-shadow:var(--shadow); overflow:hidden;}
    .panel-head{padding:16px 20px; border-bottom:1px solid var(--gris-linea);}
    .panel-head h3{font-family:var(--font-display); font-size:16px; font-weight:600; margin:0; color:var(--verde-oscuro);}
    .panel-body{padding:6px 0;}
    .checklist-filter-grid{display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:14px; margin-bottom:16px;}
    .checklist-filter{background:#fff; border:1px solid var(--gris-linea); border-radius:10px; overflow:hidden; display:flex; flex-direction:column;}
    .checklist-filter-head{display:flex; align-items:center; justify-content:space-between; gap:8px; padding:9px 12px; background:var(--gris-claro); border-bottom:1px solid var(--gris-linea); font-size:12px; font-weight:700; color:var(--verde-oscuro); text-transform:uppercase; letter-spacing:.02em;}
    .checklist-filter-clear{border:none; background:none; color:var(--texto-suave); cursor:pointer; font-size:13px; padding:0; line-height:1;}
    .checklist-filter-clear:hover{color:#a3281c;}
    .checklist-filter-body{max-height:150px; overflow-y:auto; padding:4px 0;}
    .checklist-filter-row{display:flex; align-items:center; gap:8px; padding:5px 12px; font-size:12.5px; color:var(--texto); cursor:pointer;}
    .checklist-filter-row:hover{background:var(--gris-claro);}
    .checklist-filter-row input{flex-shrink:0; accent-color:var(--verde-oscuro); cursor:pointer;}
    .checklist-filter-label{flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .checklist-filter-count{color:var(--texto-suave); font-family:var(--font-mono); font-size:11px; flex-shrink:0;}
    .checklist-filter-empty{padding:14px 12px; font-size:12px; color:var(--texto-suave); text-align:center;}
    .bar-chart{padding:14px 20px 18px;}
    .bar-row{display:flex; align-items:center; gap:10px; padding:7px 0;}
    .bar-row .bar-label{width:38%; flex-shrink:0; font-size:12.5px; color:var(--texto); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .bar-row .bar-track{flex:1; background:var(--gris-claro); border-radius:5px; height:16px; overflow:hidden;}
    .bar-row .bar-fill{height:100%; border-radius:5px; min-width:3px;}
    .bar-row .bar-value{width:26px; text-align:right; font-family:var(--font-mono); font-size:11.5px; color:var(--texto-suave); flex-shrink:0;}
    .bar-chart-more{padding:6px 20px 2px; font-size:11.5px; color:var(--texto-suave); text-align:right;}
    .pie-chart{display:flex; align-items:center; gap:16px; padding:14px 20px 18px; flex-wrap:wrap;}
    .pie-legend{display:flex; flex-direction:column; gap:6px; min-width:0; flex:1;}
    .pie-legend-row{display:flex; align-items:center; gap:7px; font-size:12.5px; color:var(--texto);}
    .pie-legend-dot{width:10px; height:10px; border-radius:50%; flex-shrink:0;}
    .pie-legend-label{flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .pie-legend-value{font-family:var(--font-mono); font-size:11.5px; color:var(--texto-suave); flex-shrink:0;}
    .stat-ring-lado{display:flex; align-items:center; gap:18px; flex-wrap:wrap; padding:20px;}
    .stat-ring-lado-text{display:flex; flex-direction:column; gap:5px; min-width:0;}
    .stat-ring-lado-small{font-size:11.5px; color:var(--texto-suave); text-transform:uppercase; letter-spacing:.02em;}
    .stat-ring-lado-big{font-size:24px; font-weight:700; color:var(--verde-oscuro); line-height:1.15;}
    .valor-por-estado-lista{margin:0 20px 18px; border-top:1px solid var(--gris-linea); padding-top:10px;}
    .valor-por-estado-row{display:flex; justify-content:space-between; gap:10px; padding:5px 0; font-size:13px;}
    .valor-por-estado-label{color:var(--texto);}
    .valor-por-estado-valor{color:var(--verde-oscuro); font-weight:600; text-align:right; font-family:var(--font-mono);}
    .empty-state-compact{padding:28px 20px; font-size:13px; text-align:center; color:var(--texto-suave);}
    footer{max-width:1100px; margin:0 auto; padding:0 20px 30px; font-size:11.5px; color:var(--texto-suave);}
    @media (max-width:700px){ .panel-grid{grid-template-columns:1fr;} }
  `;

  const scriptJs = `
    var FILAS = ${dataJson};
    var PALETA = ${paletaJson};
    var FILTROS = { glosa:new Set(), naturaleza:new Set(), admitida:new Set(), subclasificacion:new Set(), pruebaPericial:new Set(), etapa:new Set() };
    var CAMPOS_FILTRO = [
      { key:'glosa', titulo:'Glosa demandada' },
      { key:'naturaleza', titulo:'Naturaleza del Proceso' },
      { key:'admitida', titulo:'Admitida' },
      { key:'subclasificacion', titulo:'Subclasificación' },
      { key:'pruebaPericial', titulo:'Prueba Pericial' },
      { key:'etapa', titulo:'Etapa del proceso' }
    ];

    function esc(s){
      return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function fmtMonto(n){
      return new Intl.NumberFormat('es-CO', {minimumFractionDigits:2, maximumFractionDigits:2}).format(n||0);
    }
    function opcionesConConteo(lista, campo){
      var mapa = {};
      lista.forEach(function(r){ var v = r[campo]; mapa[v] = (mapa[v]||0)+1; });
      return Object.keys(mapa).map(function(k){ return {value:k, count:mapa[k]}; }).sort(function(a,b){ return b.count-a.count; });
    }
    function groupCountLocal(lista, campo){
      var mapa = {};
      lista.forEach(function(r){ var v = r[campo]; mapa[v] = (mapa[v]||0)+1; });
      return Object.keys(mapa).map(function(k){ return {label:k, value:mapa[k]}; }).sort(function(a,b){ return b.value-a.value; });
    }
    function pasaFiltros(r){
      return (!FILTROS.glosa.size || FILTROS.glosa.has(r.glosa)) &&
        (!FILTROS.naturaleza.size || FILTROS.naturaleza.has(r.naturaleza)) &&
        (!FILTROS.admitida.size || FILTROS.admitida.has(r.admitida)) &&
        (!FILTROS.subclasificacion.size || FILTROS.subclasificacion.has(r.subclasificacion)) &&
        (!FILTROS.pruebaPericial.size || FILTROS.pruebaPericial.has(r.pruebaPericial)) &&
        (!FILTROS.etapa.size || FILTROS.etapa.has(r.etapa));
    }

    function renderChecklist(campo, titulo){
      var opciones = opcionesConConteo(FILAS, campo);
      var seleccion = FILTROS[campo];
      var filas = opciones.length ? opciones.map(function(o){
        var marcado = seleccion.has(o.value) ? ' checked' : '';
        return '<label class="checklist-filter-row"><input type="checkbox" data-campo="' + campo + '" data-valor="' + esc(o.value) + '"' + marcado + '><span class="checklist-filter-label" title="' + esc(o.value) + '">' + esc(o.value) + '</span><span class="checklist-filter-count">' + o.count + '</span></label>';
      }).join('') : '<div class="checklist-filter-empty">Sin datos</div>';
      var boton = seleccion.size ? '<button type="button" class="checklist-filter-clear" data-clear="' + campo + '" title="Limpiar este filtro">\\u2715</button>' : '';
      return '<div class="checklist-filter"><div class="checklist-filter-head"><span>' + esc(titulo) + '</span>' + boton + '</div><div class="checklist-filter-body">' + filas + '</div></div>';
    }

    function renderBarChart(data, color, emptyMsg){
      if(!data.length) return '<div class="empty-state-compact">' + esc(emptyMsg) + '</div>';
      var rows = data.slice(0, 8);
      var max = Math.max.apply(null, rows.map(function(r){ return r.value; }));
      var resto = data.length - rows.length;
      var html = '<div class="bar-chart">' + rows.map(function(r){
        var ancho = Math.max(4, Math.round(r.value/max*100));
        return '<div class="bar-row"><div class="bar-label" title="' + esc(r.label) + '">' + esc(r.label) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + ancho + '%; background:' + color + '"></div></div><div class="bar-value">' + r.value + '</div></div>';
      }).join('') + '</div>';
      if(resto > 0) html += '<div class="bar-chart-more">+' + resto + ' más</div>';
      return html;
    }

    function puntoEnCirculo(cx, cy, r, anguloDeg){
      var rad = (anguloDeg * Math.PI) / 180;
      return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }
    function describirArco(cx, cy, r, anguloInicio, anguloFin){
      var inicio = puntoEnCirculo(cx, cy, r, anguloInicio);
      var fin = puntoEnCirculo(cx, cy, r, anguloFin);
      var arcoGrande = anguloFin - anguloInicio <= 180 ? 0 : 1;
      return 'M ' + cx + ' ' + cy + ' L ' + inicio.x + ' ' + inicio.y + ' A ' + r + ' ' + r + ' 0 ' + arcoGrande + ' 1 ' + fin.x + ' ' + fin.y + ' Z';
    }
    function renderPieChart(data, emptyMsg){
      var conValor = (data||[]).filter(function(d){ return d.value > 0; });
      var total = conValor.reduce(function(s,d){ return s + d.value; }, 0);
      if(!total) return '<div class="empty-state-compact">' + esc(emptyMsg) + '</div>';
      var size = 150, r = size/2, cx = r, cy = r;
      var anguloActual = -90;
      var porciones = conValor.map(function(d, i){
        var barrido = (d.value/total) * 360;
        var inicio = anguloActual, fin = anguloActual + barrido;
        anguloActual = fin;
        return { label:d.label, value:d.value, color: PALETA[i % PALETA.length], path: barrido >= 359.99 ? null : describirArco(cx, cy, r, inicio, fin) };
      });
      var svgPorciones = porciones.map(function(p){
        return p.path ? '<path d="' + p.path + '" fill="' + p.color + '"></path>' : '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + p.color + '"></circle>';
      }).join('');
      var leyenda = porciones.map(function(p){
        return '<div class="pie-legend-row"><span class="pie-legend-dot" style="background:' + p.color + '"></span><span class="pie-legend-label" title="' + esc(p.label) + '">' + esc(p.label) + '</span><span class="pie-legend-value">' + p.value + '</span></div>';
      }).join('');
      return '<div class="pie-chart"><svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">' + svgPorciones + '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r*0.58) + '" fill="#fff"></circle></svg><div class="pie-legend">' + leyenda + '</div></div>';
    }

    function renderStatRingLado(color, linea1, linea2){
      var size = 90, r = size/2;
      var anillo = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" style="flex-shrink:0"><circle cx="' + r + '" cy="' + r + '" r="' + (r-6) + '" fill="none" stroke="' + color + '" stroke-width="11" stroke-linecap="round"></circle></svg>';
      return '<div class="stat-ring-lado">' + anillo + '<div class="stat-ring-lado-text"><div class="stat-ring-lado-small">' + esc(linea1) + '</div><div class="stat-ring-lado-big">' + esc(linea2) + '</div></div></div>';
    }

    function recalcular(){
      document.getElementById('filtros-container').innerHTML = CAMPOS_FILTRO.map(function(c){ return renderChecklist(c.key, c.titulo); }).join('');

      var filtradas = FILAS.filter(pasaFiltros);
      var hayFiltros = Object.keys(FILTROS).some(function(k){ return FILTROS[k].size > 0; });
      document.getElementById('resumen-filtros').innerHTML = filtradas.length + ' de ' + FILAS.length + ' procesos' +
        (hayFiltros ? ' · <button type="button" class="clear-filters-link" id="btn-limpiar-todos">Limpiar todos los filtros</button>' : '');

      var valorCartera = filtradas.reduce(function(s,r){ return s + r.valorCartera; }, 0);
      document.getElementById('kpis-container').innerHTML =
        '<div class="panel"><div class="panel-head"><h3>Procesos filtrados</h3></div><div class="panel-body">' + renderStatRingLado('var(--verde-oscuro)', 'Cantidad de procesos', String(filtradas.length)) + '</div></div>' +
        '<div class="panel"><div class="panel-head"><h3>Valor cartera actual</h3></div><div class="panel-body">' + renderStatRingLado('var(--naranja)', 'Suma de procesos filtrados', '$ ' + fmtMonto(valorCartera)) + '</div></div>';

      var dataNaturaleza = groupCountLocal(filtradas, 'naturaleza');
      var dataAdmitida = groupCountLocal(filtradas, 'admitida');
      var dataSubclasificacion = groupCountLocal(filtradas, 'subclasificacion');
      var dataPrueba = groupCountLocal(filtradas, 'pruebaPericial');

      var desistimientosFiltrados = [];
      filtradas.forEach(function(r){ desistimientosFiltrados = desistimientosFiltrados.concat(r.d); });
      var valorDesistimientos = desistimientosFiltrados.reduce(function(s,d){ return s + d.valor; }, 0);

      // Mismo criterio que el Dashboard en vivo: un balde por PROCESO (el
      // primer desistimiento decide, si tiene más de uno) para que la suma
      // de las porciones siempre coincida con la cantidad de procesos
      // filtrados — ver [[project_dashboard_analisis_entidad]].
      var mapaEstado = {};
      filtradas.forEach(function(r){
        var estado, valor;
        if(!r.d.length){ estado = 'Sin desistimiento'; valor = 0; }
        else { estado = r.d[0].estado; valor = r.d[0].valor; }
        if(!mapaEstado[estado]) mapaEstado[estado] = { cantidad:0, valor:0 };
        mapaEstado[estado].cantidad++; mapaEstado[estado].valor += valor;
      });
      var desistimientosPorEstado = Object.keys(mapaEstado).map(function(k){ return { label:k, cantidad:mapaEstado[k].cantidad, valor:mapaEstado[k].valor }; }).sort(function(a,b){ return b.cantidad-a.cantidad; });
      var dataDesistimientosEstado = desistimientosPorEstado.map(function(d){ return { label:d.label, value:d.cantidad }; });

      var panelTotalDesistimientos;
      if(desistimientosFiltrados.length){
        var lista = desistimientosPorEstado.map(function(d){
          return '<div class="valor-por-estado-row"><span class="valor-por-estado-label">' + esc(d.label) + '</span><span class="valor-por-estado-valor">$ ' + fmtMonto(d.valor) + '</span></div>';
        }).join('');
        panelTotalDesistimientos = renderStatRingLado('var(--verde-claro)', desistimientosFiltrados.length + (desistimientosFiltrados.length===1?' desistimiento':' desistimientos'), '$ ' + fmtMonto(valorDesistimientos)) +
          '<div class="valor-por-estado-lista">' + lista + '</div>';
      } else {
        panelTotalDesistimientos = '<div class="empty-state-compact">No hay desistimientos para estos procesos.</div>';
      }

      document.getElementById('charts-container').innerHTML =
        '<div class="panel"><div class="panel-head"><h3>Naturaleza del Proceso</h3></div><div class="panel-body">' + renderBarChart(dataNaturaleza, 'var(--verde-oscuro)', 'No hay datos de Naturaleza del Proceso.') + '</div></div>' +
        '<div class="panel"><div class="panel-head"><h3>Procesos Admitidos</h3></div><div class="panel-body">' + renderPieChart(dataAdmitida, 'No hay datos de Admitida.') + '</div></div>' +
        '<div class="panel"><div class="panel-head"><h3>Subclasificación</h3></div><div class="panel-body">' + renderBarChart(dataSubclasificacion, 'var(--naranja)', 'No hay datos de Subclasificación.') + '</div></div>' +
        '<div class="panel"><div class="panel-head"><h3>Procesos con Prueba Pericial</h3></div><div class="panel-body">' + renderPieChart(dataPrueba, 'No hay datos de Prueba Pericial.') + '</div></div>' +
        '<div class="panel"><div class="panel-head"><h3>Total de desistimientos</h3></div><div class="panel-body">' + panelTotalDesistimientos + '</div></div>' +
        '<div class="panel"><div class="panel-head"><h3>Desistimientos</h3></div><div class="panel-body">' + renderPieChart(dataDesistimientosEstado, 'No hay desistimientos para estos procesos.') + '</div></div>';
    }

    document.addEventListener('change', function(e){
      var t = e.target;
      if(t.matches && t.matches('input[type=checkbox][data-campo]')){
        var campo = t.getAttribute('data-campo'), valor = t.getAttribute('data-valor');
        if(FILTROS[campo].has(valor)) FILTROS[campo]['delete'](valor); else FILTROS[campo].add(valor);
        recalcular();
      }
    });
    document.addEventListener('click', function(e){
      var t = e.target;
      if(t.id === 'btn-limpiar-todos'){
        CAMPOS_FILTRO.forEach(function(c){ FILTROS[c.key] = new Set(); });
        recalcular();
      } else if(t.matches && t.matches('[data-clear]')){
        FILTROS[t.getAttribute('data-clear')] = new Set();
        recalcular();
      }
    });

    recalcular();
  `;

  const iconoSvg = '<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 30 L50 50 L80 30" stroke="currentColor" stroke-width="14" fill="none" stroke-linecap="square"/><path d="M20 70 L50 50 L80 70" stroke="currentColor" stroke-width="14" fill="none" stroke-linecap="square"/></svg>';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Análisis de procesos — ${escapeHtmlSimple(titulo)}</title>
<style>${css}</style>
</head>
<body>
  <div class="header">
    <div class="marca">${iconoSvg}<span>MD Abogados SAS</span></div>
    <h1>Análisis de procesos — ${escapeHtmlSimple(titulo)}</h1>
    <p>Generado el ${escapeHtmlSimple(fechaLarga)} desde Lexara – Gestión de Procesos · ${filas.length} proceso${filas.length===1?'':'s'} en total</p>
  </div>
  <div class="contenido">
    <div class="checklist-filter-grid" id="filtros-container"></div>
    <p class="save-hint" id="resumen-filtros"></p>
    <div class="panel-grid" id="kpis-container"></div>
    <div class="panel-grid" id="charts-container" style="margin-top:16px"></div>
  </div>
  <footer>Archivo generado automáticamente — los filtros funcionan sin conexión, pero no reemplaza el aplicativo en vivo (los datos quedan fijos a la fecha de generación).</footer>
  <script>${scriptJs}</script>
</body>
</html>`;
}

function escapeHtmlSimple(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
