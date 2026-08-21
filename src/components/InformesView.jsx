import { useState } from 'react';
import {
  groupCount, estadoBadgeClass, fmtMonto, stripHtml, parseMonto,
  clienteForFactura, clienteForOrdenCompra,
} from '../lib/graph';
import BarChart from './BarChart';
import IconButton from './IconButton';
import { generarInformeSOSExcel, generarInformeSOSPDF, generarDesistimientosSOSExcel } from '../lib/informeSOS';
import { generarInformeFamisanarExcel, generarInformeFamisanarPDF } from '../lib/informeFamisanar';
import { generarInformeAliansaludExcel, generarInformeAliansaludPDF } from '../lib/informeAliansalud';
import { generarInformeColmedicaExcel, generarInformeColmedicaPDF } from '../lib/informeColmedica';
import { generarInformeGrupoPDF } from '../lib/informeGrupo';
import { generarInformeLexaraExcel, generarInformeLexaraPDF } from '../lib/informeLexara';
import { generarInformeFacturasExcel, generarInformeOrdenesCompraExcel } from '../lib/informeFacturacion';
import { generarInformeTutelasPDF, abrirCorreoTutelas, enviarBorradorTutelasGraph, generarInformeTutelasExcel } from '../lib/informeTutelas';
import { generarInformeGeneralProcesosExcel } from '../lib/informeGeneral';

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

export default function InformesView({ procesos, clientes, facturas, ordenesCompra, desistimientos, tutelas, valoresEntidad, notify, liveMode }){
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
  const [generandoTutelasExcel, setGenerandoTutelasExcel] = useState(false);
  const [generandoGeneral, setGenerandoGeneral] = useState(false);

  const procesosPorEntidad = groupCount(procesos, p => p.Entidad);
  const clientesPorEntidad = groupCount(clientes, c => c.Entidad);
  const facturasPorEntidad = groupCount(facturas, f => entidadDeCliente(clientes, f, clienteForFactura));
  const ordenesPorEntidad = groupCount(ordenesCompra, o => entidadDeCliente(clientes, o, clienteForOrdenCompra));

  // Fila por Entidad de la tabla detallada — enfocada en Procesos judiciales,
  // que es donde vive el semáforo de Estado (ver [[project_procesos_extended_fields]]).
  const entidades = Array.from(new Set(procesos.map(p => p.Entidad).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const filas = entidades.map(entidad => {
    const propios = procesos.filter(p => p.Entidad === entidad);
    const activos = propios.filter(p => !(p.EstadoVT||"").toLowerCase().includes('termin'));
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
  async function handleGenerarExcel(entidad){
    const formato = FORMATOS_POR_ENTIDAD[entidad.toUpperCase()];
    if(!formato?.excel) return;
    setGenerando(entidad);
    try{ await formato.excel(entidad, procesos.filter(p => p.Entidad === entidad)); }
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
      const vigentes = procesos.filter(p => p.Entidad === entidad && !(p.EstadoVT||"").toLowerCase().includes('termin'));
      await formato.pdf(entidad, vigentes);
    } catch(err){ console.error(err); notify?.("No se pudo generar el PDF de " + entidad + ": " + err.message, 'error'); }
    finally {
      setGenerandoPDF(null);
    }
  }
  // Informe de Desistimientos — se une cada Desistimiento con su Proceso
  // (procesoForDesistimiento) y solo se incluyen los que pertenecen a esta
  // Entidad, filtrando primero los procesos propios de esa Entidad.
  async function handleGenerarDesistimientos(entidad){
    const formato = FORMATOS_POR_ENTIDAD[entidad.toUpperCase()];
    if(!formato?.desistimientos) return;
    setGenerandoDesistimientos(entidad);
    try{ await formato.desistimientos(desistimientos, procesos.filter(p => p.Entidad === entidad)); }
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
        if(mensaje?.webLink) window.open(mensaje.webLink, '_blank');
        notify?.('Se creó el borrador en Outlook con las tablas y el PDF ya adjunto — revísalo y dale Enviar cuando quieras.', 'info');
        return;
      }catch(err){ console.error('No se pudo crear el borrador por Graph, se usa el método anterior:', err); }
    }

    try{
      const copiadoHtml = await abrirCorreoTutelas(tutelas, fechaInformeTutelas);
      if(copiadoHtml) notify?.('No se pudo crear el borrador automático todavía (puede que falte aprobar el permiso nuevo en Azure AD) — se abrió el correo por el método anterior; las tablas ya están copiadas, pégalas con Ctrl+V.', 'info');
    }
    catch(err){ console.error(err); notify?.("No se pudo abrir el correo de Tutelas: " + err.message, 'error'); }
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
              <IconButton icon="mail" variant="mail" label="Abrir correo con este informe" onClick={handleAbrirCorreoTutelas} />
              <IconButton icon="excel" variant="excel" label="Descargar Excel con todas las Tutelas" spinning={generandoTutelasExcel} onClick={handleGenerarTutelasExcel} />
            </div>
          </div>
          <p className="save-hint" style={{marginTop:10}}>El botón de correo abre un borrador en tu cliente de correo (Outlook, si es el predeterminado) con destinatarios y asunto listos — el PDF se descarga aparte y hay que adjuntarlo a mano antes de enviar. El Excel descarga todas las Tutelas (no solo las de la fecha elegida arriba).</p>
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
