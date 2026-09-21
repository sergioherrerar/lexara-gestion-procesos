import { useState } from 'react';
import BarChart from './BarChart';
import PieChart, { StatRing } from './PieChart';
import { ProportionBar, RankedProgressList } from './DashboardCharts';
import ChecklistFilter from './ChecklistFilter';
import { stripHtml, groupCount, parseMonto, fmtMonto, desistimientosForProceso, mensajeError } from '../lib/graph';
import { generarDashboardEntidadHTML } from '../lib/exportarDashboardHTML';
import { generarDashboardEntidadWord } from '../lib/exportarDashboardWord';
import IconButton from './IconButton';

function IconFolder(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>;
}
function IconAlert(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9L2.5 18a1.5 1.5 0 001.3 2.2h16.4a1.5 1.5 0 001.3-2.2L13.7 3.9a1.5 1.5 0 00-2.6 0z"/></svg>;
}

// Naturaleza del Proceso/Subclasificación/Glosa demandada comparten la MISMA
// columna real de SharePoint que TipoAccion/TipoProceso/OrigenTipoGlosa (ver
// config.js — son alias pensados para calcar el formato de exportación de
// SOS) — algunos procesos solo tienen uno de los dos nombres semánticos
// puesto, así que se lee con respaldo al otro para no perder datos.
function campoGlosa(p){ return stripHtml(p.GlosaDemandada || p.OrigenTipoGlosa) || "Sin dato"; }
function campoNaturaleza(p){ return stripHtml(p.NaturalezaProceso || p.TipoAccion) || "Sin dato"; }
function campoSubclasificacion(p){ return stripHtml(p.Subclasificacion || p.TipoProceso) || "Sin dato"; }
function campoAdmitida(p){ return stripHtml(p.Admitida) || "Sin dato"; }
function campoPrueba(p){ return stripHtml(p.PruebaPericial) || "Sin dato"; }
function campoEtapa(p){ return stripHtml(p.EtapaProcesal) || "Sin dato"; }

function opcionesConConteo(lista, campoFn){
  const mapa = new Map();
  lista.forEach(p => { const v = campoFn(p); mapa.set(v, (mapa.get(v)||0)+1); });
  return Array.from(mapa.entries()).map(([value,count]) => ({value,count})).sort((a,b)=>b.count-a.count);
}

const FILTROS_VACIOS = { glosa: new Set(), naturaleza: new Set(), admitida: new Set(), subclasificacion: new Set(), pruebaPericial: new Set(), etapa: new Set() };

// Pedido explícito del usuario 2026-09-22: "en el panorama general no debe
// salir nada administrativo — clientes no, facturación no". El Dashboard es
// el panorama de PROCESOS del despacho, no de la parte administrativa/
// comercial (esa vive en sus propios módulos) — se quitan esas 2 tarjetas,
// quedan solo las 2 de procesos.
export default function DashboardView({ procesos, desistimientos = [], notify }){
  const activos = procesos.filter(p => !(p.Estado||"").toLowerCase().includes('termin'));
  const tiposDistintos = new Set(procesos.map(p => stripHtml(p.TipoAccion) || "Sin dato"));

  const stats = [
    {label:"Procesos Lexara", value:activos.length, icon:<IconFolder/>, cls:'icon-teal', acento:'acento-teal', delta:`${procesos.length} en total`},
    {label:"Tipo de Acción", value:tiposDistintos.size, icon:<IconAlert/>, cls:'icon-green', acento:'acento-green', delta:"Categorías distintas"},
  ];

  const estadoData = groupCount(activos, p => p.EstadoVT);
  const tipoAccionData = groupCount(procesos, p => p.TipoAccion);

  // --- Análisis por Entidad (pedido explícito del usuario 2026-08-22) ---
  const [entidadSel, setEntidadSel] = useState('todas');
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  function toggleFiltro(campo, valor){
    setFiltros(prev => {
      const siguiente = new Set(prev[campo]);
      siguiente.has(valor) ? siguiente.delete(valor) : siguiente.add(valor);
      return { ...prev, [campo]: siguiente };
    });
  }
  function limpiarFiltro(campo){ setFiltros(prev => ({ ...prev, [campo]: new Set() })); }

  const entidades = Array.from(new Set(procesos.map(p => stripHtml(p.Entidad) || "Sin entidad"))).sort((a,b)=>a.localeCompare(b));
  const procesosPorEntidad = entidadSel === 'todas' ? procesos : procesos.filter(p => (stripHtml(p.Entidad)||"Sin entidad") === entidadSel);

  function pasaFiltros(p){
    return (!filtros.glosa.size || filtros.glosa.has(campoGlosa(p))) &&
      (!filtros.naturaleza.size || filtros.naturaleza.has(campoNaturaleza(p))) &&
      (!filtros.admitida.size || filtros.admitida.has(campoAdmitida(p))) &&
      (!filtros.subclasificacion.size || filtros.subclasificacion.has(campoSubclasificacion(p))) &&
      (!filtros.pruebaPericial.size || filtros.pruebaPericial.has(campoPrueba(p))) &&
      (!filtros.etapa.size || filtros.etapa.has(campoEtapa(p)));
  }
  const procesosFiltrados = procesosPorEntidad.filter(pasaFiltros);

  const valorCarteraActual = procesosFiltrados.reduce((sum,p) => sum + parseMonto(p.ValorCarteraActual || p.ValorActualDemanda), 0);

  const dataNaturaleza = groupCount(procesosFiltrados, campoNaturaleza);
  const dataAdmitida = groupCount(procesosFiltrados, campoAdmitida);
  const dataSubclasificacion = groupCount(procesosFiltrados, campoSubclasificacion);
  const dataPrueba = groupCount(procesosFiltrados, campoPrueba);

  // Desistimientos de los procesos que quedaron filtrados — se unen por ID
  // (ver desistimientosForProceso en graph.js), no por Contrato como el
  // resto de módulos (ver [[project_desistimientos_data_model]]).
  const desistimientosFiltrados = procesosFiltrados.flatMap(p => desistimientosForProceso(desistimientos, p));
  const valorDesistimientos = desistimientosFiltrados.reduce((sum,d) => sum + parseMonto(d.DesistimientoValor), 0);
  // "Sin desistimiento" es un balde aparte para los procesos filtrados que
  // no tienen NINGÚN desistimiento — no es un valor real del campo
  // Aprobación, se agrega a mano (con valor $0, no tiene un desistimiento
  // real detrás). Los demás baldes son los valores REALES que tenga ese
  // campo en los datos (no se adivinan/inventan nombres fijos).
  // IMPORTANTE: se cuenta un PROCESO por balde (no un desistimiento) — así
  // la suma de las porciones siempre coincide exactamente con la cantidad
  // de procesos filtrados (bug real encontrado 2026-08-22: antes, un
  // proceso con más de un desistimiento se contaba una vez por cada
  // desistimiento que tuviera, y el total del gráfico terminaba siendo
  // mayor que la cantidad real de procesos filtrados). Si un proceso tiene
  // más de un desistimiento, se usa el primero para decidir su balde (y su
  // valor, para el desglose de $ por categoría que pide el usuario).
  const desistimientosPorEstado = (() => {
    const mapa = new Map(); // estado -> {cantidad, valor}
    procesosFiltrados.forEach(p => {
      const propios = desistimientosForProceso(desistimientos, p);
      let estado, valor;
      if(!propios.length){ estado = 'Sin desistimiento'; valor = 0; }
      else {
        // Normaliza may/minúsculas (dato real: "Aprobado" y "APROBADO" en
        // el mismo campo) para que no salgan como 2 categorías separadas
        // por un simple problema de digitación.
        const crudo = stripHtml(propios[0].Aprobacion) || "Sin dato";
        estado = crudo === "Sin dato" ? crudo : crudo.charAt(0).toUpperCase() + crudo.slice(1).toLowerCase();
        valor = parseMonto(propios[0].DesistimientoValor);
      }
      const actual = mapa.get(estado) || { cantidad:0, valor:0 };
      mapa.set(estado, { cantidad: actual.cantidad+1, valor: actual.valor+valor });
    });
    return Array.from(mapa.entries()).map(([label,d]) => ({ label, cantidad:d.cantidad, valor:d.valor })).sort((a,b)=>b.cantidad-a.cantidad);
  })();

  // Exporta el panel de "Análisis de procesos por Entidad" a un .html
  // autocontenido: los datos de la Entidad elegida quedan embebidos y los 6
  // filtros/gráficos siguen funcionando de verdad al abrirlo, sin depender
  // de la app ni de internet (ver [[project_dashboard_analisis_entidad]]).
  function handleExportarHTML(){
    try{
      generarDashboardEntidadHTML(procesos, desistimientos, entidadSel);
    } catch(err){
      console.error(err);
      notify?.("No se pudo exportar el análisis: " + mensajeError(err), 'error');
    }
  }

  // Exporta el mismo panel a un .docx formal (mismo membrete/firma que las
  // cartas de Informes) con cada gráfico pegado como imagen — a diferencia
  // del HTML, este queda estático una vez descargado (pedido explícito del
  // usuario como complemento del HTML, 2026-08-24).
  const [generandoWord, setGenerandoWord] = useState(false);
  async function handleExportarWord(){
    setGenerandoWord(true);
    try{
      await generarDashboardEntidadWord(procesos, desistimientos, entidadSel);
    } catch(err){
      console.error(err);
      notify?.("No se pudo exportar el Word: " + mensajeError(err), 'error');
    } finally {
      setGenerandoWord(false);
    }
  }

  return (
    <div className="view dashboard-view">
      <div className="view-header">
        <div>
          <h1>Panorama general</h1>
          <p>Resumen en vivo de los procesos a cargo del despacho.</p>
        </div>
      </div>

      <div className="stat-grid">
        {stats.map(s => (
          <div className={"stat-card " + s.acento} key={s.label}>
            <div className="top"><span className="label">{s.label}</span><span className={"icon " + s.cls}>{s.icon}</span></div>
            <div className="value">{s.value}</div>
            <div className="delta">{s.delta}</div>
          </div>
        ))}
      </div>

      <div className="panel-grid panel-grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Procesos activos por Estado</h3></div>
          <div className="panel-body">
            <PieChart data={estadoData} centerLabel="procesos" emptyMsg="No hay datos de Estado V/T para los procesos activos." />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Tipo de Acción</h3></div>
          <div className="panel-body">
            <BarChart data={tipoAccionData} color="var(--naranja)" emptyMsg="No hay datos de Tipo de Acción." />
          </div>
        </div>
      </div>

      <div className="panel" style={{marginTop:20}}>
        <div className="panel-head">
          <h3>Análisis de procesos por Entidad</h3>
          <div style={{display:'flex', gap:8}}>
            <IconButton icon="html" variant="html" label="Descargar análisis interactivo (HTML)" onClick={handleExportarHTML} />
            <IconButton icon="word" variant="word" label="Descargar análisis en Word" spinning={generandoWord} onClick={handleExportarWord} />
          </div>
        </div>
        <div className="panel-body">
          <div className="toolbar">
            <div
              className={"filter-chip" + (entidadSel==='todas' ? " active" : "")}
              onClick={() => setEntidadSel('todas')}
              role="button" tabIndex={0}
              onKeyDown={e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); setEntidadSel('todas'); } }}
            >Todas las entidades</div>
            {entidades.map(e => (
              <div
                key={e}
                className={"filter-chip" + (entidadSel===e ? " active" : "")}
                onClick={() => setEntidadSel(e)}
                role="button" tabIndex={0}
                onKeyDown={ev => { if(ev.key==='Enter' || ev.key===' '){ ev.preventDefault(); setEntidadSel(e); } }}
              >{e}</div>
            ))}
          </div>
          <p className="save-hint" style={{margin:'0 0 14px'}}>
            {procesosFiltrados.length} de {procesosPorEntidad.length} procesos{entidadSel!=='todas' && <> de <strong>{entidadSel}</strong></>}
            {Object.values(filtros).some(s=>s.size) && <> · <button type="button" className="clear-filters-link" onClick={() => setFiltros(FILTROS_VACIOS)}>Limpiar todos los filtros</button></>}
          </p>

          <div className="checklist-filter-grid">
            <ChecklistFilter title="Glosa demandada" options={opcionesConConteo(procesosPorEntidad, campoGlosa)} selected={filtros.glosa} onToggle={v => toggleFiltro('glosa', v)} onClear={() => limpiarFiltro('glosa')} />
            <ChecklistFilter title="Naturaleza del Proceso" options={opcionesConConteo(procesosPorEntidad, campoNaturaleza)} selected={filtros.naturaleza} onToggle={v => toggleFiltro('naturaleza', v)} onClear={() => limpiarFiltro('naturaleza')} />
            <ChecklistFilter title="Admitida" options={opcionesConConteo(procesosPorEntidad, campoAdmitida)} selected={filtros.admitida} onToggle={v => toggleFiltro('admitida', v)} onClear={() => limpiarFiltro('admitida')} />
            <ChecklistFilter title="Subclasificación" options={opcionesConConteo(procesosPorEntidad, campoSubclasificacion)} selected={filtros.subclasificacion} onToggle={v => toggleFiltro('subclasificacion', v)} onClear={() => limpiarFiltro('subclasificacion')} />
            <ChecklistFilter title="Prueba Pericial" options={opcionesConConteo(procesosPorEntidad, campoPrueba)} selected={filtros.pruebaPericial} onToggle={v => toggleFiltro('pruebaPericial', v)} onClear={() => limpiarFiltro('pruebaPericial')} />
            <ChecklistFilter title="Etapa del proceso" options={opcionesConConteo(procesosPorEntidad, campoEtapa)} selected={filtros.etapa} onToggle={v => toggleFiltro('etapa', v)} onClear={() => limpiarFiltro('etapa')} />
          </div>

          {/* Antes eran 2 paneles separados (uno por cada anillo) — pedido
              explícito del usuario ("aprovechamiento de espacio"): un solo
              panel con las 2 cifras lado a lado, mismo encabezado. */}
          <div className="panel" style={{marginTop:18}}>
            <div className="panel-head"><h3>Resumen de la selección</h3></div>
            <div className="panel-body" style={{padding:'20px', display:'flex', gap:32, flexWrap:'wrap'}}>
              <StatRing layout="lado" size={90} color="var(--verde-oscuro)" lines={[{text:'Cantidad de procesos'}, {text: String(procesosFiltrados.length), big:true}]} />
              <StatRing layout="lado" size={90} color="var(--naranja)" lines={[{text:'Valor cartera actual'}, {text: '$ '+fmtMonto(valorCarteraActual), big:true}]} />
            </div>
          </div>

          <div className="panel-grid panel-grid-2" style={{marginTop:18}}>
            <div className="panel">
              <div className="panel-head"><h3>Naturaleza del Proceso</h3></div>
              <div className="panel-body"><BarChart data={dataNaturaleza} color="var(--verde-oscuro)" emptyMsg="No hay datos de Naturaleza del Proceso." /></div>
            </div>
            {/* Sí/No se lee mejor como barra de proporción que como dona
                (2026-09-22, rediseño del Dashboard) — con solo 2 categorías,
                el % exacto es difícil de estimar en una dona; acá queda
                escrito. */}
            <div className="panel">
              <div className="panel-head"><h3>Procesos Admitidos</h3></div>
              <div className="panel-body"><ProportionBar data={dataAdmitida} emptyMsg="No hay datos de Admitida." /></div>
            </div>
            <div className="panel">
              <div className="panel-head"><h3>Subclasificación</h3></div>
              <div className="panel-body"><BarChart data={dataSubclasificacion} color="var(--naranja)" emptyMsg="No hay datos de Subclasificación." /></div>
            </div>
            <div className="panel">
              <div className="panel-head"><h3>Procesos con Prueba Pericial</h3></div>
              <div className="panel-body"><ProportionBar data={dataPrueba} emptyMsg="No hay datos de Prueba Pericial." /></div>
            </div>
            {/* Antes eran 2 paneles (un anillo+lista de texto plano, y una
                dona aparte) — se unen en un solo panel rankeado de mayor a
                menor $, con su propia barra de progreso por estado. */}
            <div className="panel" style={{gridColumn:'1 / -1'}}>
              <div className="panel-head">
                <h3>Desistimientos por estado</h3>
                {desistimientosFiltrados.length > 0 && (
                  <span className="save-hint">{desistimientosFiltrados.length} desistimiento{desistimientosFiltrados.length===1?'':'s'} · $ {fmtMonto(valorDesistimientos)} en total</span>
                )}
              </div>
              <div className="panel-body">
                <RankedProgressList
                  items={desistimientosPorEstado.map(d => ({ label: d.label, count: d.cantidad, value: d.valor }))}
                  emptyMsg="No hay desistimientos para estos procesos."
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
