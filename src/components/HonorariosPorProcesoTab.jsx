import { useState } from 'react';
import { IconTextButton } from './IconButton';
import { ETAPA_CONTRATO_OPTIONS } from '../lib/graph';

// "Honorarios por Proceso" (Administración, debajo de "Órdenes Colmédica")
// — pedido explícito del usuario 2026-08-29: a diferencia de "Órdenes
// Colmédica" (armado desde Tutelas, con datos por mes), esto arma un
// borrador de Factura U Orden de compra (a elección) para CUALQUIER
// proceso judicial, eligiendo en cascada Entidad -> Cliente -> Número corto
// -> Etapa Contrato. El "No Contrato" SÍ existe como dato real acá (el
// propio proceso lo tiene, `NumeroContrato`) — a diferencia de "Órdenes
// Colmédica", donde no hay ese campo y tocó dejarlo fijo a mano por
// cliente. Siempre en borrador — nunca toca SharePoint solo.
export default function HonorariosPorProcesoTab({ procesos, clientes, onAbrirBorradorFactura, onAbrirBorradorOrdenCompra }){
  const [entidad, setEntidad] = useState('');
  const [clienteTexto, setClienteTexto] = useState('');
  const [procesoId, setProcesoId] = useState('');
  const [etapaContrato, setEtapaContrato] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState('ordenCompra');

  const entidadesDisponibles = Array.from(new Set(procesos.map(p => p.Entidad).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const clientesDisponibles = entidad
    ? Array.from(new Set(procesos.filter(p => p.Entidad === entidad).map(p => p.Cliente).filter(Boolean))).sort((a,b)=>a.localeCompare(b))
    : [];
  const procesosDisponibles = (entidad && clienteTexto)
    ? procesos.filter(p => p.Entidad === entidad && p.Cliente === clienteTexto)
    : [];
  const procesoSeleccionado = procesos.find(p => String(p.id) === procesoId) || null;

  function handleEntidad(v){ setEntidad(v); setClienteTexto(''); setProcesoId(''); }
  function handleCliente(v){ setClienteTexto(v); setProcesoId(''); }

  function handleGenerarBorrador(){
    if(!procesoSeleccionado || !etapaContrato) return;
    const clienteReal = (clientes||[]).find(c => c.RazonSocial === procesoSeleccionado.Cliente);
    const hoy = new Date();
    const descripcion1 = `Honorarios generados dentro del Contrato ${procesoSeleccionado.NumeroContrato || "—"} celebrado entre MD ABOGADOS SAS y ${procesoSeleccionado.Cliente} por la ${etapaContrato} del proceso ${procesoSeleccionado.Radicado || "—"} de ${procesoSeleccionado.Demandante || "—"} y ${procesoSeleccionado.Demandado || "—"}`;
    const borrador = {
      CodigoCliente: clienteReal ? String(clienteReal.id) : "",
      Contrato: procesoSeleccionado.NumeroContrato || "",
      Ciudad: clienteReal?.Ciudad || "Bogota D.C",
      Proceso: procesoSeleccionado.Radicado || "",
      EtapaContrato: etapaContrato,
      Observacion: "",
      Dia: String(hoy.getDate()),
      Mes: String(hoy.getMonth() + 1).padStart(2, '0'),
      Anio: String(hoy.getFullYear()),
      Descripcion1: descripcion1, Cantidad1: "", ValorUnitario1: "",
    };
    if(tipoDocumento === 'factura') onAbrirBorradorFactura(borrador);
    else onAbrirBorradorOrdenCompra(borrador);
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>Honorarios por Proceso</h3></div>
      <div className="panel-body">
        <p style={{margin:'0 0 14px', color:'var(--texto-suave)', fontSize:13}}>
          Elige Entidad, Cliente y Número corto del proceso, la Etapa Contrato y qué quieres generar — arma un borrador con la Descripción de la 1ª línea ya lista, para revisar (completar Cantidad/Valor) y darle "Guardar cambios".
        </p>
        <div className="field-grid" style={{marginBottom:16}}>
          <div className="field">
            <label>Entidad</label>
            <select value={entidad} onChange={e => handleEntidad(e.target.value)}>
              <option value="">— seleccionar —</option>
              {entidadesDisponibles.map(e => <option value={e} key={e}>{e}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Cliente</label>
            <select value={clienteTexto} onChange={e => handleCliente(e.target.value)} disabled={!entidad}>
              <option value="">{entidad ? "— seleccionar —" : "— elige primero la Entidad —"}</option>
              {clientesDisponibles.map(c => <option value={c} key={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Número corto</label>
            <select value={procesoId} onChange={e => setProcesoId(e.target.value)} disabled={!clienteTexto}>
              <option value="">{clienteTexto ? "— seleccionar —" : "— elige primero el Cliente —"}</option>
              {procesosDisponibles.map(p => <option value={p.id} key={p.id}>{p.Radicado || `Proceso #${p.id}`}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Etapa Contrato</label>
            <select value={etapaContrato} onChange={e => setEtapaContrato(e.target.value)}>
              <option value="">— seleccionar —</option>
              {ETAPA_CONTRATO_OPTIONS.map(o => <option value={o} key={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Quiero generar</label>
            <select value={tipoDocumento} onChange={e => setTipoDocumento(e.target.value)}>
              <option value="ordenCompra">Orden de compra</option>
              <option value="factura">Factura</option>
            </select>
          </div>
        </div>
        {procesoSeleccionado && (
          <div className="field-info" style={{marginBottom:16}}>
            No. de contrato: {procesoSeleccionado.NumeroContrato || "—"} · Demandante: {procesoSeleccionado.Demandante || "—"} · Demandado: {procesoSeleccionado.Demandado || "—"}
          </div>
        )}
        <IconTextButton icon="add" variant="primary" onClick={handleGenerarBorrador} disabled={!procesoSeleccionado || !etapaContrato}>
          Generar borrador
        </IconTextButton>
      </div>
    </div>
  );
}
