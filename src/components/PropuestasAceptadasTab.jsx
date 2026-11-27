import { useEffect, useState } from 'react';
import { listarPropuestas, etiquetaPropuesta, mensajeError } from '../lib/graph';
import { procesoDesdePropuesta } from './PropuestaServiciosTab';

// «Propuestas aceptadas» (Informes, 2026-11-27, pedido del usuario: «la que crea el nuevo proceso debería ir también desde Informes, porque Daniel no tiene acceso a Administración»). Muestra SOLO las propuestas de
// servicios que ya fueron aceptadas (las confirma Gerencia en Administración → Propuesta de servicios) y todavía no tienen proceso. «Crear proceso» abre el formulario de proceso nuevo ya lleno con los datos de la
// propuesta; no guarda nada hasta Guardar, y al guardar se crea la carpeta del proceso y la propuesta se copia a su «0. Contrato».
const dma = f => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || ''); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };
export default function PropuestasAceptadasTab({ config, liveMode, notify, canWrite, clientes, onCrearProceso }){
  const [lista, setLista] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  async function cargar(){
    if(!liveMode) return;
    setCargando(true); setError('');
    try{ setLista((await listarPropuestas(config)).filter(p => p.estado === 'aceptada')); }
    catch(err){ console.error(err); setError(mensajeError(err)); }
    finally{ setCargando(false); }
  }
  useEffect(() => { cargar(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  function crearProceso(p){
    if(!p.pdfItemId) notify?.('Esta propuesta no tiene el PDF guardado: se crea el proceso pero no se copiará nada a «0. Contrato».', 'info');
    onCrearProceso?.(procesoDesdePropuesta(p, clientes), p.pdfItemId ? { numero: p.numero, etiqueta: p.etiqueta || etiquetaPropuesta(p.fecha), pdf: p.pdf, pdfItemId: p.pdfItemId, pdfDriveId: p.pdfDriveId, honorarios: p.honorarios } : { numero: p.numero, etiqueta: p.etiqueta || etiquetaPropuesta(p.fecha), honorarios: p.honorarios });
    notify?.('Se abrió el formulario del proceso nuevo con los datos de la propuesta ' + p.numero + '. Revíselo y presione Guardar: ahí se crea el proceso, su carpeta, su forma de pago con los honorarios de la propuesta y se copia la propuesta a «0. Contrato».', 'info');
  }
  return (
    <div className="field-section">
      <p className="rama-fuente">Propuestas de servicios que el cliente ya <strong>aceptó</strong> y todavía no tienen proceso en el portal. Presione <strong>«Crear proceso»</strong>: se abre el formulario ya lleno con los datos de la propuesta (revíselo y complete lo que falte). <strong>No se guarda nada hasta que presione Guardar</strong>; al guardar se crea la carpeta del proceso en SharePoint y la propuesta se copia a su «0. Contrato». Quien confirma que una propuesta fue aceptada es Gerencia, en Administración → Propuesta de servicios.</p>
      {!liveMode && <div className="empty-state empty-state-compact">En el modo demo no hay SharePoint: aquí aparecerán las propuestas aceptadas.</div>}
      {liveMode && <div style={{ margin: '8px 0' }}><button type="button" className="btn-secondary rama-btn" onClick={cargar} disabled={cargando}>{cargando ? 'Leyendo…' : 'Actualizar la lista'}</button></div>}
      {error && <div className="rama-error" role="alert"><strong>No se pudo leer la lista de propuestas.</strong> {/403|Access|denied/i.test(error) ? 'Su usuario no tiene permiso para ver la carpeta «Propuestas» de Administración Lexara: pídale a Soporte que se lo dé (solo lectura basta para ver la lista).' : ''}<br /><span className="rama-res-suave">Detalle técnico: {error}</span></div>}
      {lista && lista.length === 0 && <div className="empty-state empty-state-compact">No hay propuestas aceptadas esperando proceso.</div>}
      {lista && lista.length > 0 && (
        <div className="table-wrap"><table className="rama-tabla"><thead><tr><th>Propuesta</th><th>Aceptada el</th><th>Cliente</th><th>Proceso</th><th></th></tr></thead>
          <tbody>{lista.map(p => (
            <tr key={p.numero}>
              <td><strong>{p.etiqueta || etiquetaPropuesta(p.fecha)}</strong><br /><span className="rama-res-suave">{p.numero}</span></td>
              <td className="rama-fecha">{dma(p.aceptadaEl) || '—'}</td>
              <td>{p.entidad || p.cliente}</td>
              <td>{[p.tipoProceso, p.numeroProceso].filter(Boolean).join(' · ') || '—'}{p.demandante || p.demandado ? <><br /><span className="rama-res-suave">{[p.demandante, p.demandado].filter(Boolean).join(' vs. ')}</span></> : null}</td>
              <td className="rama-acc">
                {p.pdfWebUrl && <a className="btn-secondary rama-btn" href={p.pdfWebUrl} target="_blank" rel="noopener noreferrer">Ver PDF</a>}
                {canWrite && <button type="button" className="rama-btn rama-btn--crear" onClick={() => crearProceso(p)} title="Abre el formulario de proceso nuevo con los datos de la propuesta; no guarda nada hasta Guardar">Crear proceso</button>}
              </td>
            </tr>
          ))}</tbody></table></div>
      )}
    </div>
  );
}
