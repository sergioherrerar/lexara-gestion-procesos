import { useState } from 'react';
import {
  groupCount, estadoBadgeClass, fmtMonto, stripHtml, parseMonto,
  clienteForFactura, clienteForOrdenCompra, esProcesoActivo,
} from '../lib/graph';
import BarChart from './BarChart';
import IconButton, { IconTextButton } from './IconButton';
import { generarInformeClienteHTML } from '../lib/exportarInformeCliente';
import { generarInformeSOSExcel, generarInformeSOSPDF, generarDesistimientosSOSExcel } from '../lib/informeSOS';
import { generarInformeFamisanarExcel, generarInformeFamisanarPDF } from '../lib/informeFamisanar';
import { generarInformeAliansaludExcel, generarInformeAliansaludPDF } from '../lib/informeAliansalud';
import { generarInformeColmedicaExcel, generarInformeColmedicaPDF } from '../lib/informeColmedica';
import { generarInformeGrupoPDF } from '../lib/informeGrupo';
import { generarInformeLexaraExcel, generarInformeLexaraPDF } from '../lib/informeLexara';
import { generarInformeFacturasExcel, generarInformeOrdenesCompraExcel } from '../lib/informeFacturacion';
import { generarInformeTutelasPDF, abrirCorreoTutelas, enviarBorradorTutelasGraph, generarInformeTutelasExcel } from '../lib/informeTutelas';
import { generarInformeGeneralProcesosExcel } from '../lib/informeGeneral';
import { agruparPorAbogado, filtrarTutelasPorMes, generarInformeAbogadosTutelasExcel, colorDeTipoRespuesta, MESES_NOMBRES } from '../lib/informeAbogadosTutelas';
import StackedBarChart from './StackedBarChart';

// Entidades con formato de informe formal ya confirmado, y qué generador usa
// cada una — cada Entidad puede tener un formato distinto (columnas/orden
// propios, ver informeSOS.js/informeFamisanar.js) y no todas ofrecen los
// mismos informes (p.ej. Famisanar todavía no tiene Desistimientos armado).
// Solo aparecen los íconos de los informes que sí tiene esa Entidad — el
// resto de Entidades (sin entrada acá) muestra "Aún sin modelo".
// Ver [[project_informes_modulo]] / CHANGELOG.
const FORMATO_LEXARA = { excel: generarInformeLexaraExcel, pdf: generarInformeLexaraPDF };
// Coomeva/GTM/Particulares/Salud Total: pedido explícito del usuario
// 2026-08-19 ("retira los pdf de estas entidades") — se quita SOLO el botón
// de PDF (carta), el de Excel se mantiene igual.
const FORMATO_LEXARA_SOLO_EXCEL = { excel: generarInformeLexaraExcel };
const FORMATOS_POR_ENTIDAD = {
  SOS: { excel: generarInformeSOSExcel, pdf: generarInformeSOSPDF, desistimientos: generarDesistimientosSOSExcel },
  FAMISANAR: { excel: generarInformeFamisanarExcel, pdf: generarInformeFamisanarPDF },
  ALIANSALUD: { excel: generarInformeAliansaludExcel, pdf: generarInformeAliansaludPDF },
  "GRUPO COLMEDICA": { excel: generarInformeColmedicaExcel, pdf: generarInformeColmedicaPDF },
  // Entidades sin formato propio heredado — usan el formato genérico de
  // Lexara (ver informeLexara.js), confirmado por el usuario 2026-08-16.
  // Colpatria: Excel genérico de Lexara, pero el PDF usa las mismas columnas
  // que Grupo Colmédica (Número corto/Despacho/Fecha Estado/Estado) — pedido
  // explícito del usuario 2026-08-19.
  COLPATRIA: { excel: generarInformeLexaraExcel, pdf: generarInformeGrupoPDF },
  COOMEVA: FORMATO_LEXARA_SOLO_EXCEL,
  GTM: FORMATO_LEXARA_SOLO_EXCEL,
  JRCI: FORMATO_LEXARA,
  PARTICULARES: FORMATO_LEXARA_SOLO_EXCEL,
  "SALUD TOTAL": FORMATO_LEXARA_SOLO_EXCEL,
};

function entidadDeCliente(clientes, codigoClienteOrNombre, matchFn){
  return matchFn(clientes, codigoClienteOrNombre)?.Entidad || "Sin dato";
}

export default function InformesView({ procesos, clientes, facturas, ordenesCompra, desistimientos, tutelas, valoresEntidad, notify, liveMode, config, requestConfirm, corregirEntidadFaltanteTutelas }){
  const [generando, setGenerando] = useState(null); // nombre de la entidad mientras genera el Excel
  const [generandoPDF, setGenerandoPDF] = useState(null); // nombre de la entidad mientras genera el PDF
  const [generandoDesistimientos, setGenerandoDesistimientos] = useState(null);
  const [generandoFacturas, setGenerandoFacturas] = useState(false);
  const [generandoOrdenes, setGenerandoOrdenes] = useState(false);
  // Informe diario de Tutelas — el usuario elige UNA fecha (la de
  // Notificación); la de Vencimiento siempre es la de hoy al momento de
  // generar. Ver [[project_tutelas_modulo]] / informeTutelas.js.
  const [fechaInformeTutelas, setFechaInformeTutelas] = useState(() => new Date().toISOString().slice(0,10));
  const [generandoTutelasPDF, setGenerandoTutelasPDF] = useState(false);
  const [generandoCorreoTutelas, setGenerandoCorreoTutelas] = useState(false);
  const [generandoTutelasExcel, setGenerandoTutelasExcel] = useState(false);
  const [generandoGeneral, setGenerandoGeneral] = useState(false);
  // Tutelas por Abogado — pedido explícito del usuario 2026-08-27: filtra
  // por mes (fecha de Vencimiento, corte fijo el 28) y agrupa por Abogado
  // Tutela -> Tipo Respuesta, sumando Valor Abogado. Ver informeAbogadosTutelas.js.
  const hoyRef = new Date();
  const [mesAbogados, setMesAbogados] = useState(hoyRef.getMonth());
  const [anioAbogados] = useState(hoyRef.getFullYear());
  const [generandoAbogadosExcel, setGenerandoAbogadosExcel] = useState(false);
  const [corrigiendoEntidad, setCorrigiendoEntidad] = useState(false);
  // Corrección masiva puntual 2026-08-28 (ver corregirEntidadFaltanteTutelas
  // en useLexaraApp.js). 2 ajustes el mismo día:
  // 1) el aviso original solo contaba Entidad TEXTUALMENTE vacía ("") — pero
  //    en datos reales la mayoría no está vacía, tenía un valor que no
  //    coincidía con ninguna Entidad real de "Valores Entidad".
  // 2) Después de correr esa versión, quedaron ~700 tutelas en "Colmedica"
  //    (sin "GRUPO ") sin tocar — resultó que ese SÍ es un valor real
  //    distinto en la lista de origen del Lookup, así que no calificaba
  //    como "inválido". El usuario confirmó explícitamente: quiere TODAS las
  //    tutelas en "GRUPO COLMEDICA", sin excepción — así que el criterio ya
  //    no es "inválida", es simplemente "no es exactamente GRUPO COLMEDICA".
  const ENTIDAD_UNIFICADA = "GRUPO COLMEDICA";
  const tutelasEntidadInvalida = tutelas.filter(t => t.Entidad !== ENTIDAD_UNIFICADA);
  const valoresEntidadInvalidosDistintos = Array.from(new Set(tutelasEntidadInvalida.map(t => t.Entidad || "(vacío)")));
  async function handleCorregirEntidad(){
    setCorrigiendoEntidad(true);
    try{ await corregirEntidadFaltanteTutelas(); }
    finally{ setCorrigiendoEntidad(false); }
  }
  // Informe HTML por Cliente (con botón de pago) — pedido explícito del
  // usuario 2026-08-25, movido de Procesos judiciales a Informes el mismo
  // día ("mejor mueve esta sección a informes") — ver
  // [[project_informe_cliente_pagos]] / exportarInformeCliente.js.
  const [clienteInforme, setClienteInforme] = useState('');
  const clientesDistintos = Array.from(new Set(procesos.map(p => (p.Cliente||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  async function handleDescargarInformeCliente(){
    if(!clienteInforme) return;
    try{
      await generarInformeClienteHTML(procesos, clienteInforme, config?.DAVIVIENDA_PAGOS_URL);
    } catch(err){
      console.error(err);
      notify?.("No se pudo generar el informe del cliente: " + err.message, 'error');
    }
  }

  const tutelasDelMesAbogados = filtrarTutelasPorMes(tutelas, anioAbogados, mesAbogados);
  const { grupos: gruposAbogados, totalGeneral: totalGeneralAbogados } = agruparPorAbogado(tutelasDelMesAbogados, valoresEntidad);
  async function handleGenerarAbogadosExcel(){
    setGenerandoAbogadosExcel(true);
    try{ await generarInformeAbogadosTutelasExcel(tutelas, valoresEntidad, anioAbogados, mesAbogados); }
    catch(err){ console.error(err); notify?.("No se pudo generar el Excel de Tutelas por Abogado: " + err.message, 'error'); }
    finally { setGenerandoAbogadosExcel(false); }
  }

  const procesosPorEntidad = groupCount(procesos, p => p.Entidad);
  const clientesPorEntidad = groupCount(clientes, c => c.Entidad);
  const facturasPorEntidad = groupCount(facturas, f => entidadDeCliente(clientes, f, clienteForFactura));
  const ordenesPorEntidad = groupCount(ordenesCompra, o => entidadDeCliente(clientes, o, clienteForOrdenCompra));

  // Fila por Entidad de la tabla detallada — enfocada en Procesos judiciales,
  // que es donde vive el semáforo de Estado (ver [[project_procesos_extended_fields]]).
  const entidades = Array.from(new Set(procesos.map(p => p.Entidad).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const filas = entidades.map(entidad => {
    const propios = procesos.filter(p => p.Entidad === entidad);
    const activos = propios.filter(esProcesoActivo);
    // Suma "Valor actual demanda" de todos los procesos de la Entidad — usa
    // parseMonto() (igual que el resto de la app) en vez de un regex propio:
    // SharePoint devuelve este valor a veces como número crudo (1471348.75) y
    // a veces como texto formateado a la colombiana ("559.112,53"); el regex
    // anterior le quitaba los puntos a los DOS casos por igual, lo que inflaba
    // 100x los valores que ya venían como número crudo (ver el mismo bug ya
    // corregido una vez en parseMonto(), [[project_facturacion_data_model]]).
    const valorEnDisputa = propios.reduce((sum,p) => sum + parseMonto(p.ValorActualDemanda), 0);
    const semaforo = {verde:0, naranja:0, rojo:0, gris:0};
    propios.forEach(p => {
      const cls = estadoBadgeClass(p.EstadoVT, p.FechaUltimoEstado, p.Estado);
      if(cls==='badge-verde') semaforo.verde++;
      else if(cls==='badge-naranja') semaforo.naranja++;
      else if(cls==='badge-rojo') semaforo.rojo++;
      else semaforo.gris++;
    });
    return { entidad, total: propios.length, activos: activos.length, valorEnDisputa, semaforo };
  });

  // Todos los handlers de este archivo notifican el error real en vez de
  // fallar en silencio — antes, si algo adentro del generador (jsPDF/
  // ExcelJS, o un dato real con una forma inesperada) lanzaba una excepción,
  // no había ningún aviso: el botón simplemente "no hacía nada" a los ojos
  // del usuario, aunque en la consola sí quedara un error. Reportado
  // 2026-08-22 ("los informes no están sacando ninguno ni pdf excel") — no
  // se pudo reproducir en modo demo (funciona bien acá), así que esto
  // asegura que la PRÓXIMA vez que falle contra datos reales, se vea el
  // mensaje real en pantalla en vez de nada.
  // Pedido explícito del usuario 2026-08-31: "todos los informes solo deben
  // aparecer procesos activos" — antes este Excel filtraba solo por Entidad
  // (incluía también los Terminados), a diferencia del PDF de abajo que ya
  // filtraba bien desde antes. Ahora usan el mismo esProcesoActivo (graph.js).
  async function handleGenerarExcel(entidad){
    const formato = FORMATOS_POR_ENTIDAD[entidad.toUpperCase()];
    if(!formato?.excel) return;
    setGenerando(entidad);
    try{ await formato.excel(entidad, procesos.filter(p => p.Entidad === entidad && esProcesoActivo(p))); }
    catch(err){ console.error(err); notify?.("No se pudo generar el Excel de " + entidad + ": " + err.message, 'error'); }
    finally { setGenerando(null); }
  }
  // "la cantidad de procesos son todos los vigentes de SOS" — la carta en
  // PDF cuenta y lista solo los procesos NO terminados de esa Entidad. El PDF
  // se genera y descarga directo (jsPDF) — no pasa por el diálogo de
  // impresión del navegador.
  async function handleGenerarPDF(entidad){
    const formato = FORMATOS_POR_ENTIDAD[entidad.toUpperCase()];
    if(!formato?.pdf) return;
    setGenerandoPDF(entidad);
    try{
      const vigentes = procesos.filter(p => p.Entidad === entidad && esProcesoActivo(p));
      await formato.pdf(entidad, vigentes);
    } catch(err){ console.error(err); notify?.("No se pudo generar el PDF de " + entidad + ": " + err.message, 'error'); }
    finally {
      setGenerandoPDF(null);
    }
  }
  // Informe de Desistimientos — se une cada Desistimiento con su Proceso
  // (procesoForDesistimiento) y solo se incluyen los que pertenecen a esta
  // Entidad, filtrando primero los procesos propios de esa Entidad Y activos
  // (mismo pedido de arriba — antes incluía también Terminados).
  async function handleGenerarDesistimientos(entidad){
    const formato = FORMATOS_POR_ENTIDAD[entidad.toUpperCase()];
    if(!formato?.desistimientos) return;
    setGenerandoDesistimientos(entidad);
    try{ await formato.desistimientos(desistimientos, procesos.filter(p => p.Entidad === entidad && esProcesoActivo(p))); }
    catch(err){ console.error(err); notify?.("No se pudo generar los Desistimientos de " + entidad + ": " + err.message, 'error'); }
    finally { setGenerandoDesistimientos(null); }
  }
  // Excel de Facturación/Órdenes de compra completas (no por Entidad, la
  // lista tal cual está cargada) — mismo estilo institucional que los demás
  // Excel de Informes. Pedido explícito del usuario 2026-08-16.
  async function handleGenerarExcelFacturas(){
    setGenerandoFacturas(true);
    try{ await generarInformeFacturasExcel(facturas, clientes); }
    catch(err){ console.error(err); notify?.("No se pudo generar el Excel de Facturación: " + err.message, 'error'); }
    finally { setGenerandoFacturas(false); }
  }
  async function handleGenerarExcelOrdenes(){
    setGenerandoOrdenes(true);
    try{ await generarInformeOrdenesCompraExcel(ordenesCompra, clientes, facturas); }
    catch(err){ console.error(err); notify?.("No se pudo generar el Excel de Órdenes de compra: " + err.message, 'error'); }
    finally { setGenerandoOrdenes(false); }
  }

  async function handleGenerarTutelasPDF(){
    setGenerandoTutelasPDF(true);
    try{ await generarInformeTutelasPDF(tutelas, fechaInformeTutelas); }
    catch(err){ console.error(err); notify?.("No se pudo generar el PDF de Tutelas: " + err.message, 'error'); }
    finally { setGenerandoTutelasPDF(false); }
  }
  async function handleAbrirCorreoTutelas(){
    // Mientras se está creando un borrador, ignora clics repetidos — evita
    // crear 2+ borradores duplicados si se le da clic otra vez antes de que
    // termine el primero (bug real reportado 2026-08-24: al darle clic dos
    // veces seguidas, la segunda pestaña abría un enlace que Outlook ya no
    // reconocía — "es posible que este mensaje se haya movido o eliminado").
    if(generandoCorreoTutelas) return;
    setGenerandoCorreoTutelas(true);
    try{
      // Primero intenta crear el borrador DIRECTO en Outlook por Microsoft
      // Graph (tablas + PDF ya adjunto, sin pasos manuales) — necesita el
      // permiso "Mail.ReadWrite" aprobado en Azure AD Y una sesión real de
      // Microsoft 365 (nunca en modo demo — ahí no hay cuenta real, e
      // intentarlo mostraría de la nada un popup pidiendo iniciar sesión con
      // Microsoft, algo que no tiene sentido mientras se están viendo datos
      // de ejemplo). Si falla por cualquier otro motivo (permiso no aprobado
      // todavía, sin conexión, etc.), cae de vuelta al método anterior
      // (mailto + copiar tabla al portapapeles) — nunca se queda sin abrir nada.
      if(liveMode){
        try{
          const mensaje = await enviarBorradorTutelasGraph(tutelas, fechaInformeTutelas);
          // El enlace directo al correo (webLink) resultó no ser confiable
          // para esta cuenta, y tampoco bastaba con abrir la carpeta de
          // Borradores (el usuario confirmó que ni con F5 aparecía ahí) —
          // ver graph.js: ahora se crea el borrador apuntando directo a la
          // carpeta "drafts" (antes al endpoint genérico) y se confirma con
          // datos reales en qué carpeta quedó, para dejar de adivinar.
          await new Promise(r => setTimeout(r, 4000));
          if(mensaje?.carpetaBorradores) window.open(mensaje.carpetaBorradores, '_blank');
          const carpetaInfo = mensaje?.carpetaReal ? ` (quedó guardado en la carpeta "${mensaje.carpetaReal}")` : '';
          notify?.(`Se creó el borrador en Outlook con las tablas y el PDF ya adjunto${carpetaInfo} — si no lo ves en Borradores, revisa esa carpeta y avísame el nombre exacto.`, 'info');
          return;
        }catch(err){ console.error('No se pudo crear el borrador por Graph, se usa el método anterior:', err); }
      }

      try{
        const copiadoHtml = await abrirCorreoTutelas(tutelas, fechaInformeTutelas);
        if(copiadoHtml) notify?.('No se pudo crear el borrador automático todavía (puede que falte aprobar el permiso nuevo en Azure AD) — se abrió el correo por el método anterior; las tablas ya están copiadas, pégalas con Ctrl+V.', 'info');
      }
      catch(err){ console.error(err); notify?.("No se pudo abrir el correo de Tutelas: " + err.message, 'error'); }
    } finally {
      setGenerandoCorreoTutelas(false);
    }
  }
  async function handleGenerarTutelasExcel(){
    setGenerandoTutelasExcel(true);
    try{ await generarInformeTutelasExcel(tutelas, valoresEntidad); }
    catch(err){ console.error(err); notify?.("No se pudo generar el Excel de Tutelas: " + err.message, 'error'); }
    finally { setGenerandoTutelasExcel(false); }
  }
  // Excel con el mismo formato de columnas del Excel de SOS, pero de TODOS
  // los procesos (todas las Entidades, incluidos terminados) — para hacer
  // cruces. Pedido explícito del usuario 2026-08-22.
  async function handleGenerarExcelGeneral(){
    setGenerandoGeneral(true);
    try{ await generarInformeGeneralProcesosExcel(procesos); }
    catch(err){ console.error(err); notify?.("No se pudo generar el Excel general de procesos: " + err.message, 'error'); }
    finally { setGenerandoGeneral(false); }
  }

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Informes</h1>
          <p>Resumen por Entidad de Procesos, Clientes, Facturación y Órdenes de compra.</p>
        </div>
      </div>

      <div className="manuales-bar">
        <span className="manuales-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </span>
        <div className="manuales-text">
          <div className="manuales-label">Manual de usuario</div>
          <div className="manuales-sub">Guía paso a paso de los 7 módulos, con vistas del formulario real.</div>
        </div>
        <a className="btn-primary" href={`${import.meta.env.BASE_URL}manuales/manual-usuario.html`} download="Manual de usuario - Lexara.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14}}><path d="M12 3v13m0 0l-5-5m5 5l5-5M4 21h16"/></svg>
          Descargar manual completo
        </a>
      </div>

      <div className="informe-cliente-bar">
        <span className="informe-cliente-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6M9 11h6"/></svg>
        </span>
        <span className="informe-cliente-label">Informe para un cliente:</span>
        <select value={clienteInforme} onChange={e => setClienteInforme(e.target.value)}>
          <option value="">— Selecciona un cliente —</option>
          {clientesDistintos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <IconTextButton icon="html" variant="primary" onClick={handleDescargarInformeCliente} disabled={!clienteInforme}>Descargar informe del cliente</IconTextButton>
      </div>

      <div className="panel-grid panel-grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Procesos por Entidad</h3></div>
          <div className="panel-body">
            <BarChart data={procesosPorEntidad} color="var(--verde-oscuro)" emptyMsg="No hay datos de Entidad en Procesos." />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Clientes por Entidad</h3></div>
          <div className="panel-body">
            <BarChart data={clientesPorEntidad} color="var(--naranja)" emptyMsg="No hay datos de Entidad en Clientes." />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Facturación por Entidad</h3>
            <IconButton icon="excel" variant="excel" label="Descargar Excel de Facturación" spinning={generandoFacturas} onClick={handleGenerarExcelFacturas} />
          </div>
          <div className="panel-body">
            <BarChart data={facturasPorEntidad} color="var(--verde-claro)" emptyMsg="No hay facturas asociadas a una Entidad." />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Órdenes de compra por Entidad</h3>
            <IconButton icon="excel" variant="excel" label="Descargar Excel de Órdenes de compra" spinning={generandoOrdenes} onClick={handleGenerarExcelOrdenes} />
          </div>
          <div className="panel-body">
            <BarChart data={ordenesPorEntidad} color="#8a6410" emptyMsg="No hay órdenes de compra asociadas a una Entidad." />
          </div>
        </div>
      </div>

      <div className="panel" style={{marginTop:20}}>
        <div className="panel-head"><h3>Informe diario de Tutelas</h3></div>
        <div className="panel-body">
          <p style={{margin:'0 0 14px', color:'var(--texto-suave)', fontSize:13}}>
            Elige la fecha de <strong>Notificación</strong> a reportar (junta todas las Tutelas con esa fecha, sin filtrar por Entidad) — las de <strong>Vencimiento</strong> siempre son las de la fecha de hoy, al momento de generar el PDF o el correo.
          </p>
          <div style={{display:'flex', alignItems:'center', gap:14, flexWrap:'wrap'}}>
            <div className="field" style={{maxWidth:220}}>
              <label>Fecha Notificación</label>
              <input type="date" value={fechaInformeTutelas} onChange={e => setFechaInformeTutelas(e.target.value)} />
            </div>
            <div style={{display:'flex', gap:8}}>
              <IconButton icon="pdf" variant="pdf" label="Descargar PDF de Tutelas" spinning={generandoTutelasPDF} onClick={handleGenerarTutelasPDF} />
              <IconButton icon="mail" variant="mail" label="Abrir correo con este informe" spinning={generandoCorreoTutelas} onClick={handleAbrirCorreoTutelas} />
              <IconButton icon="excel" variant="excel" label="Descargar Excel con todas las Tutelas" spinning={generandoTutelasExcel} onClick={handleGenerarTutelasExcel} />
            </div>
          </div>
          <p className="save-hint" style={{marginTop:10}}>El botón de correo crea el borrador directo en tu buzón de Outlook, con las tablas y el PDF ya adjunto — ábrelo desde tu carpeta de Borradores y dale Enviar. Si por algún motivo no se puede crear así, se abre un borrador con `mailto:` en su lugar (con destinatarios y asunto listos, pero hay que pegar/adjuntar el contenido a mano). El Excel descarga todas las Tutelas (no solo las de la fecha elegida arriba).</p>
        </div>
      </div>

      <div className="panel" style={{marginTop:20}}>
        <div className="panel-head"><h3>Tutelas por Abogado</h3></div>
        <div className="panel-body">
          <p style={{margin:'0 0 14px', color:'var(--texto-suave)', fontSize:13}}>
            Filtra las tutelas por fecha de <strong>Vencimiento</strong> según el mes elegido (corte fijo el día 28: del 29 del mes anterior al 28 de este) y suma el <strong>Valor Abogado</strong> de cada una (buscado por Entidad en Valores Entidad), agrupado por Abogado Tutela y Tipo Respuesta.
          </p>
          <div style={{display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', marginBottom:16}}>
            <div className="field" style={{maxWidth:200}}>
              <label>Mes</label>
              <select value={mesAbogados} onChange={e => setMesAbogados(Number(e.target.value))}>
                {MESES_NOMBRES.map((m,i) => <option key={m} value={i}>{m}</option>)}
              </select>
            </div>
            <IconButton icon="excel" variant="excel" label="Descargar Excel de Tutelas por Abogado" spinning={generandoAbogadosExcel} onClick={handleGenerarAbogadosExcel} />
          </div>
          {tutelasEntidadInvalida.length > 0 && (
            <div className="field-warning" style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:16}}>
              <span>{tutelasEntidadInvalida.length} tutela(s) no tienen "Entidad" en GRUPO COLMEDICA (valores encontrados: {valoresEntidadInvalidosDistintos.join(", ")}) — su Valor Abogado no se puede calcular hasta corregirlo.</span>
              <button
                type="button"
                className="btn-secondary"
                disabled={corrigiendoEntidad}
                onClick={() => requestConfirm(
                  `¿Poner "Entidad" en GRUPO COLMEDICA para las ${tutelasEntidadInvalida.length} tutela(s) que todavía no la tienen así? Esto actualiza SharePoint de una vez.`,
                  handleCorregirEntidad
                )}
              >
                {corrigiendoEntidad ? "Corrigiendo…" : "Unificar Entidad a GRUPO COLMEDICA"}
              </button>
            </div>
          )}
          <StackedBarChart grupos={gruposAbogados} emptyMsg={`No hay tutelas con vencimiento entre el 29 de ${MESES_NOMBRES[(mesAbogados+11)%12].toLowerCase()} y el 28 de ${MESES_NOMBRES[mesAbogados].toLowerCase()}.`} />
          {/* Detalle por abogado — pedido explícito del usuario 2026-08-27
              mirando el gráfico ya en vivo: "incluye las cantidades y
              separa cada uno de los abogados y una casilla al final del
              total... cada abogado tenga su valor encima de sus tipos de
              contestacion" — una tarjeta por abogado (nombre + su total en
              el encabezado) con cada Tipo Respuesta y su monto debajo, y un
              cuadro de Total general al final. El gráfico apilado de arriba
              se queda como comparativo visual rápido; esto es el detalle
              con los números exactos. */}
          {gruposAbogados.length > 0 && (
            <div className="abogados-detalle">
              {gruposAbogados.map(g => (
                <div className="abogado-card" key={g.abogado}>
                  <div className="abogado-card-head">
                    <span className="abogado-nombre">{g.abogado}</span>
                    <span className="abogado-total">$ {fmtMonto(g.totalAbogado)}</span>
                  </div>
                  <div className="abogado-card-body">
                    {g.filas.map(f => (
                      <div className="abogado-card-row" key={f.tipoRespuesta}>
                        <span className="abogado-tipo-dot" style={{background: colorDeTipoRespuesta(f.tipoRespuesta)}}></span>
                        <span className="abogado-tipo-label">{f.tipoRespuesta}</span>
                        <span className="abogado-tipo-cantidad">{f.cantidad}</span>
                        <span className="abogado-tipo-valor">$ {fmtMonto(f.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="abogados-total-general">
                <span className="abogado-nombre">Total general</span>
                <span className="abogado-total">$ {fmtMonto(totalGeneralAbogados)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel" style={{marginTop:20}}>
        <div className="panel-head">
          <h3>Detalle de Procesos judiciales por Entidad</h3>
          <IconButton icon="excel" variant="excel" label="Descargar Excel de todos los procesos (formato SOS, para cruces)" spinning={generandoGeneral} onClick={handleGenerarExcelGeneral} />
        </div>
        <div className="panel-body" style={{padding:0}}>
          {!filas.length ? (
            <div className="empty-state empty-state-compact">No hay procesos con Entidad asignada todavía.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Entidad</th>
                    <th>Procesos (activos/total)</th>
                    <th>Valor actual demanda</th>
                    <th>Semáforo de Estado</th>
                    <th>Informe</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map(f => (
                    <tr key={f.entidad}>
                      <td>{f.entidad}</td>
                      <td>{f.activos} / {f.total}</td>
                      <td>{fmtMonto(f.valorEnDisputa)}</td>
                      <td>
                        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                          {f.semaforo.verde > 0 && <span className="badge badge-verde">{f.semaforo.verde} verde</span>}
                          {f.semaforo.naranja > 0 && <span className="badge badge-naranja">{f.semaforo.naranja} naranja</span>}
                          {f.semaforo.rojo > 0 && <span className="badge badge-rojo">{f.semaforo.rojo} rojo</span>}
                          {f.semaforo.gris > 0 && <span className="badge badge-gris">{f.semaforo.gris} gris</span>}
                        </div>
                      </td>
                      <td>
                        {(() => {
                          const formato = FORMATOS_POR_ENTIDAD[f.entidad.toUpperCase()];
                          if(!formato) return <span className="save-hint" style={{fontSize:12}}>Aún sin modelo</span>;
                          return (
                            <div className="row-actions">
                              {formato.excel && <IconButton icon="excel" variant="excel" label="Descargar Excel" spinning={generando===f.entidad} onClick={() => handleGenerarExcel(f.entidad)} />}
                              {formato.pdf && <IconButton icon="pdf" variant="pdf" label="Descargar carta en PDF" spinning={generandoPDF===f.entidad} onClick={() => handleGenerarPDF(f.entidad)} />}
                              {formato.desistimientos && <IconButton icon="checklist" variant="checklist" label="Descargar Desistimientos (Excel)" spinning={generandoDesistimientos===f.entidad} onClick={() => handleGenerarDesistimientos(f.entidad)} />}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
