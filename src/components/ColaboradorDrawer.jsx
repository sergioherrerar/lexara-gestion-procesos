import { useState, useEffect } from 'react';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

const ROL_OPTIONS = ["Administrador", "Jefe", "Colaborador"];

function emptyForm(colaborador){
  return {
    Nombre: colaborador.Nombre || "",
    TipoIdentificacion: colaborador.TipoIdentificacion || "",
    Identificacion: colaborador.Identificacion || "",
    Telefono: colaborador.Telefono || "",
    Direccion: colaborador.Direccion || "",
    Correo: colaborador.Correo || "",
    Activo: colaborador.Activo != null ? !!colaborador.Activo : true,
    Rol: colaborador.Rol || "",
  };
}

export default function ColaboradorDrawer({ colaborador, liveMode, onClose, onSave, onDelete, saving, canWrite = true }){
  const [form, setForm] = useState(null);

  useEffect(() => {
    setForm(colaborador ? emptyForm(colaborador) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaborador]);

  useEscapeToClose(!!colaborador, onClose);

  if(!colaborador || !form) return null;

  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }

  const esNuevo = colaborador.id == null;

  return (
    <>
      <div id="colaborador-overlay" className="active" onClick={onClose}></div>
      <div id="colaborador-drawer" className="active">
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div className="eyebrow">COLABORADOR LEXARA</div>
          <h2>{esNuevo ? "Nuevo colaborador" : (colaborador.Nombre || "Sin nombre")}</h2>
        </div>
        <div className="drawer-body">
          <div className="field-section">
            <div className="field-grid">
              <div className="field"><label>Nombre</label><input type="text" value={form.Nombre} onChange={e => setField('Nombre', e.target.value)} readOnly={!canWrite} /></div>
              <div className="field"><label>Correo</label><input type="text" value={form.Correo} onChange={e => setField('Correo', e.target.value)} readOnly={!canWrite} /></div>
              <div className="field"><label>Tipo de identificación</label><input type="text" value={form.TipoIdentificacion} onChange={e => setField('TipoIdentificacion', e.target.value)} readOnly={!canWrite} /></div>
              <div className="field"><label>Identificación</label><input type="text" value={form.Identificacion} onChange={e => setField('Identificacion', e.target.value)} readOnly={!canWrite} /></div>
              <div className="field"><label>Teléfono</label><input type="text" value={form.Telefono} onChange={e => setField('Telefono', e.target.value)} readOnly={!canWrite} /></div>
              <div className="field"><label>Dirección</label><input type="text" value={form.Direccion} onChange={e => setField('Direccion', e.target.value)} readOnly={!canWrite} /></div>
              <div className="field">
                <label>Rol</label>
                <select value={form.Rol} onChange={e => setField('Rol', e.target.value)} disabled={!canWrite}>
                  <option value="">— seleccionar rol —</option>
                  {ROL_OPTIONS.map(o => <option value={o} key={o}>{o}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Activo</label>
                <select value={form.Activo ? "si" : "no"} onChange={e => setField('Activo', e.target.value === "si")} disabled={!canWrite}>
                  <option value="si">Sí</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="drawer-foot">
          {canWrite ? (
            <>
              <button className="btn-primary" onClick={() => onSave(form)} disabled={saving}>
                {saving && <span className="btn-spinner" />}{saving ? "Guardando…" : "Guardar cambios"}
              </button>
              {!esNuevo && onDelete && (
                <button type="button" className="btn-secondary" onClick={() => onDelete(colaborador.id)} disabled={saving}>Eliminar</button>
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
