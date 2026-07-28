import { useState, useEffect } from 'react';

const CLIENTE_FIELDS = [
  ["RazonSocial","Razón social"],
  ["Nit","NIT"],
  ["Direccion","Dirección"],
  ["Telefono","Teléfono"],
  ["Correo","Correo"],
  ["Entidad","Entidad"],
];

export default function ClienteDrawer({ cliente, liveMode, onClose, onSave, onDelete }){
  const [form, setForm] = useState(null);

  useEffect(() => {
    if(cliente){
      const initial = {};
      CLIENTE_FIELDS.forEach(([key]) => { initial[key] = cliente[key] || ""; });
      setForm(initial);
    } else {
      setForm(null);
    }
  }, [cliente]);

  if(!cliente || !form) return null;

  return (
    <>
      <div id="cliente-overlay" className="active" onClick={onClose}></div>
      <div id="cliente-drawer" className="active">
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div className="eyebrow">CLIENTE</div>
          <h2>{cliente.RazonSocial || "Sin nombre"}</h2>
        </div>
        <div className="drawer-body">
          <div className="field-section">
            <div className="field-grid">
              {CLIENTE_FIELDS.map(([key,label]) => (
                <div className="field" key={key}>
                  <label>{label}</label>
                  <input type="text" value={form[key]} onChange={e => setForm(v => ({...v, [key]: e.target.value}))} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="drawer-foot">
          <button className="btn-primary" onClick={() => onSave(form)}>Guardar cambios</button>
          <button className="btn-secondary" onClick={() => onDelete(cliente.id)}>Eliminar cliente</button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <span className="save-hint">{liveMode ? "Los cambios se guardan en SharePoint." : "Modo demo — los cambios no se guardan."}</span>
        </div>
      </div>
    </>
  );
}
