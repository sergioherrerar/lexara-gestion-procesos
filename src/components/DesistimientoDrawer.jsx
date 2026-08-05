import { useState, useEffect } from 'react';
import { parseMonto, fmtMonto } from '../lib/graph';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

function emptyForm(desistimiento){
  return {
    Proceso: desistimiento.Proceso != null ? desistimiento.Proceso : "",
    NumeroCorto: desistimiento.NumeroCorto || "",
    DesistimientoValor: desistimiento.DesistimientoValor ? fmtMonto(parseMonto(desistimiento.DesistimientoValor)) : "",
    FechaRadicacion: desistimiento.FechaRadicacion || "",
    Aprobacion: desistimiento.Aprobacion || "",
    FechaAprobacion: desistimiento.FechaAprobacion || "",
    Observaciones: desistimiento.Observaciones || "",
  };
}

export default function DesistimientoDrawer({ desistimiento, procesos, onClose, onSave, onDelete, liveMode, saving, canWrite = true }){
  const [form, setForm] = useState(null);

  useEffect(() => {
    setForm(desistimiento ? emptyForm(desistimiento) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desistimiento]);

  useEscapeToClose(!!desistimiento, onClose);

  if(!desistimiento || !form) return null;

  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }

  const linkedProceso = procesos.find(p => String(p.id) === String(form.Proceso)) || null;
  const esNuevo = desistimiento.id == null;

  function handleSave(){
    const payload = {...form};
    payload.DesistimientoValor = parseMonto(payload.DesistimientoValor);
    onSave(payload);
  }

  return (
    <>
      <div id="desistimiento-overlay" className="active" onClick={onClose}></div>
      <div id="desistimiento-drawer" className="active">
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div className="eyebrow">DESISTIMIENTO</div>
          <h2>{form.NumeroCorto || (esNuevo ? "Nuevo desistimiento" : "Sin proceso vinculado")}</h2>
        </div>
        <div className="drawer-body">
          <div className="field-section">
            <h4>Relaciones</h4>
            <div className="field-grid">
              <div className="field full" style={{gridColumn:'1/-1'}}>
                <label>Numero corto</label>
                <input
                  type="text" list="lista-procesos-desist" value={form.NumeroCorto}
                  onChange={e => {
                    const val = e.target.value;
                    const matched = procesos.find(p => p.Radicado === val);
                    setForm(prev => ({...prev, NumeroCorto: val, Proceso: matched ? matched.id : prev.Proceso}));
                  }}
                  readOnly={!canWrite}
                  placeholder="Escribe para buscar…"
                />
                <datalist id="lista-procesos-desist">
                  {procesos.filter(p => p.Radicado).map(p => <option value={p.Radicado} key={p.id} />)}
                </datalist>
                {form.NumeroCorto && !linkedProceso && (
                  <div className="field-warning">Este numero corto no coincide con ningún proceso registrado.</div>
                )}
                {linkedProceso && (
                  <div className="field-info">Cliente: {linkedProceso.Cliente || "—"}</div>
                )}
              </div>
            </div>
          </div>
          <div className="field-section">
            <h4>Datos generales</h4>
            <div className="field-grid">
              <div className="field">
                <label>Desistimiento Valor</label>
                <input type="text" value={form.DesistimientoValor} onChange={e => setField('DesistimientoValor', e.target.value)} readOnly={!canWrite} />
              </div>
              <div className="field">
                <label>Fecha Radicación</label>
                <input type="date" value={form.FechaRadicacion} onChange={e => setField('FechaRadicacion', e.target.value)} readOnly={!canWrite} />
              </div>
              <div className="field">
                <label>Aprobación</label>
                <input type="text" value={form.Aprobacion} onChange={e => setField('Aprobacion', e.target.value)} readOnly={!canWrite} />
              </div>
              <div className="field">
                <label>Fecha de Aprobación</label>
                <input type="date" value={form.FechaAprobacion} onChange={e => setField('FechaAprobacion', e.target.value)} readOnly={!canWrite} />
              </div>
              <div className="field full" style={{gridColumn:'1/-1'}}>
                <label>Observaciones</label>
                <textarea value={form.Observaciones} onChange={e => setField('Observaciones', e.target.value)} readOnly={!canWrite} />
              </div>
            </div>
          </div>
        </div>
        <div className="drawer-foot">
          {canWrite ? (
            <>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving && <span className="btn-spinner" />}{saving ? "Guardando…" : "Guardar cambios"}
              </button>
              {!esNuevo && onDelete && (
                <button type="button" className="btn-secondary" onClick={() => onDelete(desistimiento.id)} disabled={saving}>Eliminar</button>
              )}
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
