import { useState, useEffect, useRef } from 'react';
import {
  stripHtml, estadoBadgeClass, findClienteByNombre,
  facturasForProceso, ordenesCompraForProceso, formasPagoForProceso, desistimientosForProceso, facturaNumero, ordenCompraNumero,
  computeFacturaTotals, computeOrdenCompraTotals, estadoFacturaBadgeClass,
  facturaForOrdenCompra, fmtMonto, fmtDate, fechaFromPartes, parseMonto,
  tiposAccionDistinct, tiposProcesoParaAccion, despachosParaAccion,
} from '../lib/graph';
import IconButton, { IconTextButton } from './IconButton';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { ICON_SVG } from '../config';

const TABS = [
  {key:'datos', label:'Datos generales'},
  {key:'trazabilidad', label:'Trazabilidad fechas'},
  {key:'facturas', label:'Facturas'},
  {key:'ordenes', label:'Órdenes de compra'},
  {key:'formaspago', label:'Formas de pago'},
  {key:'desistimientos', label:'Desistimientos'},
];

function fechaOrdenable(row){
  return fechaFromPartes(row.Dia, row.Mes, row.Anio) || row.Fecha || "";
}

// Lista compacta de facturas/órdenes de compra relacionadas con el proceso
// abierto — reutilizada por las pestañas "Facturas" y "Órdenes de compra".
function RelatedList({ emptyMsg, rows, columns, onOpen, onPrint }){
  if(!rows.length){
    return (
      <div className="empty-state empty-state-compact">
        <div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />
        {emptyMsg}
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}<th>Acciones</th></tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={row.id}
              onClick={() => onOpen(row.id)}
              role="button" tabIndex={0}
              onKeyDown={e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); onOpen(row.id); } }}
            >
              {columns.map(c => <td key={c.key}>{c.render(row)}</td>)}
              <td style={{whiteSpace:'nowrap'}}>
                <div className="row-actions">
                  <IconButton icon="edit" variant="edit" label="Ver / editar" onClick={e => { e.stopPropagation(); onOpen(row.id); }} />
                  {onPrint && <IconButton icon="print" variant="print" label="Imprimir" onClick={e => { e.stopPropagation(); onPrint(row.id); }} />}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Fechas del proceso, agrupadas todas juntas en su propia pestaña
// "Trazabilidad fechas" — ya no se mezclan con el resto de campos.
const DATE_FIELDS = ["FechaAdmision","FechaContestacion","FechaInstancia","FechaUltimoEstado"];

// Pestaña "Datos generales" — organizada igual que el formulario Access
// original (agrupado por Identificación / Partes / Representación / Despacho /
// Estado / Valores / Enlaces), con los campos que aún no tenían un lugar en
// la app (se mapean desde Configuración cuando el usuario confirme la
// columna real de SharePoint; mientras tanto quedan en blanco).
const FIELD_SECTIONS = [
  {title:"Identificación del proceso", fields:[
    ["NoCompleto","text"],["NumeroContrato","text"],["HistoricoNumerosCompletos","textarea"],
  ]},
  {title:"Partes", fields:[
    ["Cliente","text"],["Entidad","text"],["Demandante","text"],["Demandado","text"],["ParteActuamos","text"],
  ]},
  {title:"Representación", fields:[
    ["Apoderado","text"],["CCApoderada","text"],["AbogadoEncargado","text"],
  ]},
  {title:"Estado del proceso", fields:[
    // Tipo de Acción / Tipo de Proceso / Despacho van seguidos, en ese
    // orden — son los 3 selects dependientes guiados por la lista
    // "tipos de Accion" (ver tiposAccionDistinct/tiposProcesoParaAccion/
    // despachosParaAccion en graph.js).
    ["TipoAccion","text"],["TipoProceso","text"],["EtapaProcesal","text"],
    ["Despacho","text"],["NumeroDespacho","text"],
    ["Estado","textarea"],["EstadoVT","text"],["CalificacionContingencia","text"],
  ]},
  {title:"Detalles del despacho", fields:[
    ["LinkDespacho","link"],["CorreoDespacho","text"],["Instancia","text"],
  ]},
  {title:"Valores", fields:[
    ["ValorRadicacion","money"],["ValorReforma","money"],["ValorActualDemanda","money"],
  ]},
  {title:"Enlaces y observaciones", fields:[
    ["LinkContrato","link"],["LinkCliente","link"],["LinkCarpeta","link"],["Observaciones","richtext"],
  ]},
];
// "Historico" es la bitácora narrativa del proceso (distinta de "Histórico
// números completos", que solo guarda numeraciones anteriores) — va junto a
// las fechas porque es, en la práctica, la traza cronológica del proceso.
// Igual que Observaciones, es una columna de SharePoint con texto
// enriquecido (permite negrita/subrayado/resaltado).
const TRAZABILIDAD_SECTION = {title:"Fechas del proceso", fields: [...DATE_FIELDS.map(k => [k,"date"]), ["Historico","richtext"]]};
// Se usa para inicializar el formulario — incluye tanto las secciones de
// Datos generales como la de Trazabilidad de fechas.
const ALL_SECTIONS = [...FIELD_SECTIONS, TRAZABILIDAD_SECTION];
const LABELS = {
  Cliente:"Cliente", Entidad:"Entidad", Apoderado:"Apoderado", Despacho:"Despacho / juzgado", NumeroDespacho:"No. de despacho",
  Instancia:"Instancia", TipoProceso:"Tipo de proceso", TipoAccion:"Tipo de Acción", NumeroContrato:"No. de contrato",
  EtapaProcesal:"Etapa procesal", Estado:"Estado",
  FechaAdmision:"Fecha de admisión", FechaContestacion:"Fecha de contestación",
  CalificacionContingencia:"Calificación de contingencia", EstadoVT:"Estado V/T", LinkCarpeta:"Link a la carpeta",
  Observaciones:"Observaciones",
  NoCompleto:"No. completo", HistoricoNumerosCompletos:"Histórico números completos",
  Demandante:"Demandante", Demandado:"Demandado", ParteActuamos:"Parte en que actuamos",
  CCApoderada:"CC Apoderada", AbogadoEncargado:"Abogado encargado",
  LinkDespacho:"Link despacho", CorreoDespacho:"Correo despacho",
  ValorRadicacion:"Valor radicación", ValorReforma:"Valor reforma", ValorActualDemanda:"Valor actual demanda",
  LinkContrato:"Link contrato", LinkCliente:"Link cliente",
  FechaInstancia:"Fecha instancia", FechaUltimoEstado:"Fecha último estado",
  Historico:"Histórico",
};

// Tarjeta de campo con etiqueta oscura arriba y valor abajo — mismo formato
// del formulario Access original que se usaba antes, pero con los colores
// institucionales de Lexara en vez de los verdes/teales de Access.
function FieldCard({ label, full, children }){
  return (
    <div className={"field-card" + (full ? " full" : "")}>
      <div className="field-card-label">{label}</div>
      <div className="field-card-value">{children}</div>
    </div>
  );
}

// Editor de texto enriquecido para "Histórico" y "Observaciones" — en
// SharePoint son columnas de texto enriquecido reales (permiten negrita,
// subrayado y resaltado), así que un <textarea> plano les hacía perder el
// formato. Es "no controlado" (el HTML vive en el propio contentEditable,
// no se vuelve a pintar en cada tecla) para no perder la posición del
// cursor mientras se escribe.
function RichTextEditor({ value, onChange, readOnly }){
  const ref = useRef(null);
  const focusedRef = useRef(false);

  useEffect(() => {
    if(ref.current && !focusedRef.current && ref.current.innerHTML !== (value || "")){
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  function exec(cmd, arg){
    if(readOnly) return;
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current.innerHTML);
  }

  return (
    <div className="richtext">
      {!readOnly && (
        <div className="richtext-toolbar">
          <button type="button" title="Negrita" onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')}><b>N</b></button>
          <button type="button" title="Subrayado" onMouseDown={e => e.preventDefault()} onClick={() => exec('underline')}><u>S</u></button>
          <button type="button" title="Resaltar" onMouseDown={e => e.preventDefault()} onClick={() => exec('hiliteColor', '#fff3b0')}>Resaltar</button>
          <button type="button" title="Quitar formato" onMouseDown={e => e.preventDefault()} onClick={() => exec('removeFormat')}>Limpiar</button>
        </div>
      )}
      <div
        ref={ref}
        className="richtext-body"
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onFocus={() => { focusedRef.current = true; }}
        onBlur={() => { focusedRef.current = false; }}
        onInput={e => onChange(e.currentTarget.innerHTML)}
      />
    </div>
  );
}
const EMPTY_NEW_CLIENTE = {RazonSocial:"", Nit:"", Direccion:"", Telefono:"", Correo:""};

export default function ProcesoDrawer({ proceso, clientes, facturas, ordenesCompra, formasPago, desistimientos, tiposAccion, liveMode, onClose, onSave, onCreateCliente, onOpenFactura, onPrintFactura, onCreateFactura, onOpenOrdenCompra, onPrintOrdenCompra, onCreateOrdenCompra, onOpenFormaPago, onCreateFormaPago, onOpenDesistimiento, onCreateDesistimiento, saving, canWrite = true }){
  const [form, setForm] = useState(null);
  const [showNewCliente, setShowNewCliente] = useState(false);
  const [newCliente, setNewCliente] = useState(EMPTY_NEW_CLIENTE);
  const [nuevoClienteError, setNuevoClienteError] = useState("");
  const [activeTab, setActiveTab] = useState('datos');

  useEffect(() => {
    if(proceso){
      const initial = {};
      ALL_SECTIONS.forEach(sec => sec.fields.forEach(([key,type]) => {
        initial[key] = key==='Estado' ? stripHtml(proceso[key])
          : type==='money' ? (proceso[key] ? fmtMonto(parseMonto(proceso[key])) : "")
          : (proceso[key] || "");
      }));
      setForm(initial);
      setShowNewCliente(false);
      setNewCliente(EMPTY_NEW_CLIENTE);
      setNuevoClienteError("");
      setActiveTab('datos');
    } else {
      setForm(null);
    }
  }, [proceso]);

  useEscapeToClose(!!proceso, onClose);

  if(!proceso || !form) return null;

  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }

  // Solo se envían los campos que realmente cambiaron respecto a lo que
  // había — antes se reenviaba el formulario completo (36 campos) aunque
  // solo se hubiera tocado uno, lo que hacía casi imposible saber cuál
  // campo rechazaba SharePoint con su 400 genérico. Además reduce el
  // riesgo: un campo que la app todavía no ha probado bien contra la
  // lista real no se toca si el usuario no lo modificó.
  // Los campos "money" se muestran formateados ($ colombiano) mientras se
  // editan, pero SharePoint espera un número plano — igual que en Facturas/
  // Órdenes de compra, se pasan por parseMonto justo antes de comparar y guardar.
  // Los campos "link" son columnas de "Hipervínculo o imagen" en SharePoint
  // — Graph las espera como {Url, Description}, no como texto plano, o el
  // guardado no toma el dato (aunque no siempre avisa con error).
  function handleSave(){
    const payload = {};
    ALL_SECTIONS.forEach(sec => sec.fields.forEach(([key,type]) => {
      const actual = type==='money' ? parseMonto(form[key]) : (form[key] ?? "");
      const original = type==='money' ? parseMonto(proceso[key])
        : key==='Estado' ? stripHtml(proceso[key])
        : (proceso[key] ?? "");
      const cambio = type==='money' ? actual !== original : String(actual) !== String(original ?? "");
      if(cambio) payload[key] = type==='link' && actual ? { Url: actual, Description: actual } : actual;
    }));
    onSave(payload);
  }

  // Al cambiar el Tipo de Acción, si el Tipo de Proceso o el Despacho ya
  // elegidos dejan de ser válidos para la nueva categoría (según la lista
  // "tipos de Accion"), se limpian — evita combinaciones inconsistentes
  // (p.ej. un Despacho de "Civil" con Tipo de Acción "Laboral").
  function setTipoAccion(value){
    setForm(prev => {
      const next = {...prev, TipoAccion: value};
      if(prev.TipoProceso && !tiposProcesoParaAccion(tiposAccion, value).includes(prev.TipoProceso)) next.TipoProceso = "";
      if(prev.Despacho && !despachosParaAccion(tiposAccion, value).includes(prev.Despacho)) next.Despacho = "";
      return next;
    });
  }

  async function handleCreateCliente(){
    if(!newCliente.RazonSocial.trim()){ setNuevoClienteError("El nombre (Razón social) es obligatorio."); return; }
    setNuevoClienteError("");
    const created = await onCreateCliente(newCliente);
    if(created){
      setField('Cliente', created.RazonSocial);
      setShowNewCliente(false);
      setNewCliente(EMPTY_NEW_CLIENTE);
    }
  }

  const clienteNombres = clientes.map(c => c.RazonSocial).filter(Boolean);
  if(form.Cliente && !clienteNombres.includes(form.Cliente)) clienteNombres.unshift(form.Cliente);
  const linkedCliente = findClienteByNombre(clientes, form.Cliente);

  // Tipo de Acción / Tipo de Proceso / Despacho — selects dependientes
  // guiados por la lista "tipos de Accion" (ver graph.js). Si el valor ya
  // guardado no está en la lista de opciones válidas (p.ej. antes de mapear
  // la lista, o un dato viejo), se agrega igual para no perderlo de vista.
  const tipoAccionOpciones = tiposAccionDistinct(tiposAccion);
  if(form.TipoAccion && !tipoAccionOpciones.includes(form.TipoAccion)) tipoAccionOpciones.unshift(form.TipoAccion);
  const tipoProcesoOpciones = tiposProcesoParaAccion(tiposAccion, form.TipoAccion);
  if(form.TipoProceso && !tipoProcesoOpciones.includes(form.TipoProceso)) tipoProcesoOpciones.unshift(form.TipoProceso);
  const despachoOpciones = despachosParaAccion(tiposAccion, form.TipoAccion);
  if(form.Despacho && !despachoOpciones.includes(form.Despacho)) despachoOpciones.unshift(form.Despacho);

  const facturasRelacionadas = facturasForProceso(facturas, proceso)
    .sort((a,b) => Number(facturaNumero(b)) - Number(facturaNumero(a)) || 0);
  const ordenesRelacionadas = ordenesCompraForProceso(ordenesCompra, proceso)
    .sort((a,b) => Number(ordenCompraNumero(b)) - Number(ordenCompraNumero(a)));
  const formasPagoRelacionadas = formasPagoForProceso(formasPago, proceso);
  const desistimientosRelacionados = desistimientosForProceso(desistimientos, proceso);

  // Al abrir/imprimir una factura u orden de compra relacionada, se cierra
  // este panel primero — dos paneles superpuestos a la vez se ven mal.
  function goToFactura(id){ onClose(); onOpenFactura(id); }
  function goToPrintFactura(id){ onClose(); onPrintFactura(id); }
  function goToOrdenCompra(id){ onClose(); onOpenOrdenCompra(id); }
  function goToPrintOrdenCompra(id){ onClose(); onPrintOrdenCompra(id); }
  function goToFormaPago(id){ onClose(); onOpenFormaPago(id); }
  function goToDesistimiento(id){ onClose(); onOpenDesistimiento(id); }
  // Botones "+ Nueva factura"/"+ Nueva orden de compra"/"+ Nueva forma de
  // pago"/"+ Nuevo desistimiento" de este panel: cierran el proceso y abren
  // un borrador con el Contrato/Proceso ya llenos.
  function goToNewFactura(){ onClose(); onCreateFactura(proceso); }
  function goToNewOrdenCompra(){ onClose(); onCreateOrdenCompra(proceso); }
  function goToNewFormaPago(){ onClose(); onCreateFormaPago(proceso); }
  function goToNewDesistimiento(){ onClose(); onCreateDesistimiento(proceso); }

  const FACTURA_COLUMNS = [
    {key:'numero', label:'No. factura', render: f => facturaNumero(f)},
    {key:'fecha', label:'Fecha', render: f => fmtDate(fechaOrdenable(f))},
    {key:'total', label:'Total', render: f => fmtMonto(computeFacturaTotals(f).total)},
    {key:'estado', label:'Estado', render: f => <span className={"badge " + estadoFacturaBadgeClass(f.EstadoFactura)}>{f.EstadoFactura || "—"}</span>},
  ];
  const ORDEN_COLUMNS = [
    {key:'numero', label:'No. orden', render: oc => ordenCompraNumero(oc)},
    {key:'fecha', label:'Fecha', render: oc => fmtDate(fechaOrdenable(oc))},
    {key:'total', label:'Total', render: oc => fmtMonto(computeOrdenCompraTotals(oc).total)},
    {key:'factura', label:'Factura', render: oc => { const f = facturaForOrdenCompra(facturas, oc); return f ? facturaNumero(f) : "—"; }},
  ];
  const FORMA_PAGO_COLUMNS = [
    {key:'honorarios', label:'Honorarios', render: fp => fmtMonto(parseMonto(fp.Honorarios))},
    {key:'cumplidos', label:'Pagos cumplidos', render: fp => {
      const n = [1,2,3,4,5,6].filter(i => {
        const v = fp[`EtapaProcesalCumplida${i}`];
        return v === true || v === 1 || (typeof v === 'string' && /^(s[ií]|true|1)$/i.test(v.trim()));
      }).length;
      return `${n} de 6`;
    }},
  ];
  const DESISTIMIENTO_COLUMNS = [
    {key:'valor', label:'Valor', render: d => fmtMonto(parseMonto(d.DesistimientoValor))},
    {key:'fecharadicacion', label:'Fecha radicación', render: d => fmtDate(d.FechaRadicacion)},
    {key:'aprobacion', label:'Aprobación', render: d => d.Aprobacion || "—"},
  ];

  return (
    <>
      <div id="overlay" className="active" onClick={onClose}></div>
      <div id="drawer" className="active drawer-fullscreen">
        <div className="drawer-head">
          <button className="drawer-back" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            Volver a procesos judiciales
          </button>
          <button className="drawer-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div className="eyebrow">NUMERO_CORTO — {proceso.Radicado || "—"}</div>
          <h2>{proceso.Cliente || "Sin nombre"}</h2>
          <span className={"badge badge-truncate " + estadoBadgeClass(proceso.Estado)}>{stripHtml(proceso.Estado) || "—"}</span>
        </div>
        <div className="drawer-tabs">
          {TABS.map(t => (
            <button
              key={t.key} type="button"
              className={"drawer-tab" + (activeTab===t.key ? " active" : "")}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
              {t.key==='facturas' && facturasRelacionadas.length > 0 && <span className="drawer-tab-count">{facturasRelacionadas.length}</span>}
              {t.key==='ordenes' && ordenesRelacionadas.length > 0 && <span className="drawer-tab-count">{ordenesRelacionadas.length}</span>}
              {t.key==='formaspago' && formasPagoRelacionadas.length > 0 && <span className="drawer-tab-count">{formasPagoRelacionadas.length}</span>}
              {t.key==='desistimientos' && desistimientosRelacionados.length > 0 && <span className="drawer-tab-count">{desistimientosRelacionados.length}</span>}
            </button>
          ))}
        </div>
        <div className="drawer-body">
          {activeTab === 'facturas' && (
            <div className="field-section">
              {canWrite && (
                <div style={{display:'flex', justifyContent:'flex-end', marginBottom:12}}>
                  <IconTextButton icon="add" variant="primary" onClick={goToNewFactura}>Nueva factura</IconTextButton>
                </div>
              )}
              <RelatedList
                emptyMsg="No hay facturas con el mismo contrato de este proceso."
                rows={facturasRelacionadas}
                columns={FACTURA_COLUMNS}
                onOpen={goToFactura}
                onPrint={goToPrintFactura}
              />
            </div>
          )}
          {activeTab === 'ordenes' && (
            <div className="field-section">
              {canWrite && (
                <div style={{display:'flex', justifyContent:'flex-end', marginBottom:12}}>
                  <IconTextButton icon="add" variant="primary" style={{background:'var(--verde-claro)'}} onClick={goToNewOrdenCompra}>Nueva orden de compra</IconTextButton>
                </div>
              )}
              <RelatedList
                emptyMsg="No hay órdenes de compra con el mismo contrato de este proceso."
                rows={ordenesRelacionadas}
                columns={ORDEN_COLUMNS}
                onOpen={goToOrdenCompra}
                onPrint={goToPrintOrdenCompra}
              />
            </div>
          )}
          {activeTab === 'formaspago' && (
            <div className="field-section">
              {canWrite && (
                <div style={{display:'flex', justifyContent:'flex-end', marginBottom:12}}>
                  <IconTextButton icon="add" variant="primary" onClick={goToNewFormaPago}>Nueva forma de pago</IconTextButton>
                </div>
              )}
              <RelatedList
                emptyMsg="No hay formas de pago con el mismo contrato de este proceso."
                rows={formasPagoRelacionadas}
                columns={FORMA_PAGO_COLUMNS}
                onOpen={goToFormaPago}
              />
            </div>
          )}
          {activeTab === 'desistimientos' && (
            <div className="field-section">
              {canWrite && (
                <div style={{display:'flex', justifyContent:'flex-end', marginBottom:12}}>
                  <IconTextButton icon="add" variant="primary" onClick={goToNewDesistimiento}>Nuevo desistimiento</IconTextButton>
                </div>
              )}
              <RelatedList
                emptyMsg="No hay desistimientos vinculados a este proceso."
                rows={desistimientosRelacionados}
                columns={DESISTIMIENTO_COLUMNS}
                onOpen={goToDesistimiento}
              />
            </div>
          )}
          {activeTab === 'datos' && FIELD_SECTIONS.map(sec => (
            <div className="field-section" key={sec.title}>
              <h4>{sec.title}</h4>
              <div className="field-card-grid">
                {sec.fields.map(([key,type]) => {
                  if(key==='Cliente'){
                    return (
                      <FieldCard label="Cliente" full key={key}>
                        <select value={form.Cliente} onChange={e => setField('Cliente', e.target.value)} disabled={!canWrite}>
                          <option value="">— seleccionar cliente —</option>
                          {clienteNombres.map(n => <option value={n} key={n}>{n}</option>)}
                        </select>
                        {canWrite && (
                          <IconTextButton icon="add" variant="primary" style={{marginTop:8, alignSelf:'flex-start'}} onClick={() => setShowNewCliente(v => !v)}>Nuevo cliente</IconTextButton>
                        )}
                        {form.Cliente && (
                          linkedCliente ? (
                            <div style={{marginTop:10, padding:'10px 12px', border:'1px solid var(--gris-linea)', borderRadius:8, fontSize:12.5, color:'var(--texto-suave)', lineHeight:1.7, background:'#fff'}}>
                              <strong style={{color:'var(--texto)'}}>Datos del cliente (lista Clientes)</strong><br/>
                              NIT: {linkedCliente.Nit || "—"} · Tel: {linkedCliente.Telefono || "—"}<br/>
                              {linkedCliente.Direccion || "—"}<br/>
                              {linkedCliente.Correo || "—"}
                            </div>
                          ) : (
                            <div style={{marginTop:10, padding:'10px 12px', border:'1px solid #f3d78e', background:'#fff7e8', borderRadius:8, fontSize:12.5, color:'#6b5115'}}>
                              Este nombre no coincide con ningún registro de la lista de Clientes — créalo con "+ Nuevo cliente" para vincularlo.
                            </div>
                          )
                        )}
                        {showNewCliente && (
                          <div style={{marginTop:10, padding:12, border:'1px solid var(--gris-linea)', borderRadius:8, background:'var(--gris-claro)'}}>
                            <div className="field-grid">
                              <div className="field"><label>Razón social *</label><input type="text" value={newCliente.RazonSocial} onChange={e => setNewCliente(v => ({...v, RazonSocial:e.target.value}))} /></div>
                              <div className="field"><label>NIT</label><input type="text" value={newCliente.Nit} onChange={e => setNewCliente(v => ({...v, Nit:e.target.value}))} /></div>
                              <div className="field"><label>Dirección</label><input type="text" value={newCliente.Direccion} onChange={e => setNewCliente(v => ({...v, Direccion:e.target.value}))} /></div>
                              <div className="field"><label>Teléfono</label><input type="text" value={newCliente.Telefono} onChange={e => setNewCliente(v => ({...v, Telefono:e.target.value}))} /></div>
                              <div className="field full" style={{gridColumn:'1/-1'}}><label>Correo</label><input type="text" value={newCliente.Correo} onChange={e => setNewCliente(v => ({...v, Correo:e.target.value}))} /></div>
                            </div>
                            {nuevoClienteError && <div className="field-warning" style={{marginBottom:10}}>{nuevoClienteError}</div>}
                            <div style={{marginTop:10, display:'flex', gap:8}}>
                              <IconTextButton icon="add" variant="primary" onClick={handleCreateCliente} disabled={saving}>{saving ? "Creando…" : "Crear cliente"}</IconTextButton>
                              <button type="button" className="btn-secondary" onClick={() => setShowNewCliente(false)} disabled={saving}>Cancelar</button>
                            </div>
                          </div>
                        )}
                      </FieldCard>
                    );
                  }
                  // Tipo de Acción / Tipo de Proceso / Despacho: selects dependientes
                  // guiados por la lista "tipos de Accion" — elegir el Tipo de Acción
                  // filtra las opciones de los otros dos (ver graph.js).
                  if(key==='TipoAccion'){
                    return (
                      <FieldCard label={LABELS[key]} key={key}>
                        <select value={form.TipoAccion} onChange={e => setTipoAccion(e.target.value)} disabled={!canWrite}>
                          <option value="">— seleccionar —</option>
                          {tipoAccionOpciones.map(n => <option value={n} key={n}>{n}</option>)}
                        </select>
                      </FieldCard>
                    );
                  }
                  if(key==='TipoProceso'){
                    return (
                      <FieldCard label={LABELS[key]} key={key}>
                        <select value={form.TipoProceso} onChange={e => setField('TipoProceso', e.target.value)} disabled={!canWrite || !form.TipoAccion}>
                          <option value="">{form.TipoAccion ? "— seleccionar —" : "— elige primero el Tipo de Acción —"}</option>
                          {tipoProcesoOpciones.map(n => <option value={n} key={n}>{n}</option>)}
                        </select>
                      </FieldCard>
                    );
                  }
                  if(key==='Despacho'){
                    return (
                      <FieldCard label={LABELS[key]} key={key}>
                        <select value={form.Despacho} onChange={e => setField('Despacho', e.target.value)} disabled={!canWrite || !form.TipoAccion}>
                          <option value="">{form.TipoAccion ? "— seleccionar —" : "— elige primero el Tipo de Acción —"}</option>
                          {despachoOpciones.map(n => <option value={n} key={n}>{n}</option>)}
                        </select>
                      </FieldCard>
                    );
                  }
                  // Campos "link" (Link Contrato/Lexara/Cliente/Carpeta/Despacho): antes
                  // eran solo texto — al tocarlos no pasaba nada. Ahora, si hay un valor,
                  // aparece un botón para abrirlo en una pestaña nueva.
                  if(type==='link'){
                    const url = (form[key]||"").trim();
                    return (
                      <FieldCard label={LABELS[key]} key={key}>
                        <div style={{display:'flex', alignItems:'center', gap:6}}>
                          <input type="text" value={form[key]} onChange={e => setField(key, e.target.value)} readOnly={!canWrite} style={{flex:1, minWidth:0}} />
                          {url && <IconButton icon="open" variant="open" label="Abrir enlace" href={url} onClick={e => e.stopPropagation()} />}
                        </div>
                      </FieldCard>
                    );
                  }
                  return (
                    <FieldCard label={LABELS[key]} full={type==='textarea' || type==='richtext'} key={key}>
                      {type==='richtext'
                        ? <RichTextEditor value={form[key]} onChange={v => setField(key, v)} readOnly={!canWrite} />
                        : type==='textarea'
                        ? <textarea value={form[key]} onChange={e => setField(key, e.target.value)} readOnly={!canWrite} />
                        : type==='money'
                        ? <input type="text" className="input-money" value={form[key]} onChange={e => setField(key, e.target.value)} onBlur={e => setField(key, fmtMonto(parseMonto(e.target.value)))} readOnly={!canWrite} />
                        : <input type={type} value={form[key]} onChange={e => setField(key, e.target.value)} readOnly={!canWrite} />}
                    </FieldCard>
                  );
                })}
              </div>
            </div>
          ))}
          {activeTab === 'trazabilidad' && (
            <div className="field-section">
              <h4>{TRAZABILIDAD_SECTION.title}</h4>
              <div className="field-card-grid">
                {TRAZABILIDAD_SECTION.fields.map(([key,type]) => (
                  <FieldCard label={LABELS[key]} full={type==='richtext'} key={key}>
                    {type==='richtext'
                      ? <RichTextEditor value={form[key]} onChange={v => setField(key, v)} readOnly={!canWrite} />
                      : <input type={type} value={form[key]} onChange={e => setField(key, e.target.value)} readOnly={!canWrite} />}
                  </FieldCard>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="drawer-foot">
          {canWrite ? (
            <>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving && <span className="btn-spinner" />}{saving ? "Guardando…" : "Guardar cambios"}
              </button>
              <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
              <span className="save-hint">{liveMode ? "Los cambios se guardan en SharePoint." : "Modo demo — los cambios no se guardan."}</span>
            </>
          ) : (
            <>
              <button className="btn-secondary" onClick={onClose}>Cerrar</button>
              <span className="save-hint">Solo puedes consultar esta información.</span>
            </>
          )}
        </div>
      </div>
    </>
  );
}
