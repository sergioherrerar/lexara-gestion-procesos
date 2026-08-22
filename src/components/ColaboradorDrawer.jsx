import { useState, useEffect } from 'react';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { MODULOS_DISPONIBLES, modulosPermitidosDe, parseModulosPermitidos, serializeModulosPermitidos } from '../lib/permissions';

const ROL_OPTIONS = ["Administrador", "Jefe", "Colaborador"];
// Columna "Tipo de Colaborador" en Equipo MD — el usuario ya la venía usando
// directo en SharePoint con estos 2 valores (Trabajador para el equipo
// interno, Contratista para externos como una contadora). Si en SharePoint
// aparece algún valor distinto a estos dos, avisar para agregarlo aquí.
const TIPO_COLABORADOR_OPTIONS = ["Trabajador", "Contratista"];
// Lista fija (no texto libre) para poder agrupar/filtrar por Cargo más
// adelante sin que un typo ("Abogada junior" vs "Abogada Junior") rompa el
// agrupamiento — pedido explícito del usuario 2026-08-22. Cargos reales
// confirmados por el usuario (perfiles del equipo). Si aparece alguien con
// un cargo nuevo que no esté acá, agregarlo a esta lista.
const CARGO_OPTIONS = ["Gerente", "Abogado de Procesos", "Abogada Junior", "Soporte técnico y administrativo"];

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
    TipoColaborador: colaborador.TipoColaborador || "",
    // Cargo real (Gerente, Abogado de Procesos, etc.) — distinto del Rol de
    // permisos de arriba. Se usan en la certificación laboral/de prestación
    // de servicios en PDF (ver informeCertificacion.js).
    Cargo: colaborador.Cargo || "",
    FechaIngreso: colaborador.FechaIngreso || "",
    FechaRetiro: colaborador.FechaRetiro || "",
    // Si "Módulos permitidos" todavía está vacío en SharePoint (colaboradores
    // creados antes de este cambio), las casillas arrancan marcadas con lo
    // que ese Rol ya le daba por defecto (ver modulosPermitidosDe en
    // permissions.js) — así el formulario muestra de entrada el acceso real
    // que esa persona ya tiene, en vez de mostrar todo vacío/engañoso y
    // arriesgar que al guardar sin querer se le quite el acceso que tenía.
    // Se guarda siempre como el texto separado por comas (lo que de verdad
    // espera la columna en SharePoint) — las casillas del formulario solo lo
    // leen/escriben a través de parseModulosPermitidos/serializeModulosPermitidos,
    // nunca como arreglo.
    ModulosPermitidos: serializeModulosPermitidos(modulosPermitidosDe(colaborador)),
    SoloLectura: colaborador.SoloLectura === true || colaborador.SoloLectura === 1,
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

  const modulosMarcados = parseModulosPermitidos(form.ModulosPermitidos);
  function toggleModulo(key, marcado){
    const siguiente = marcado ? [...modulosMarcados, key] : modulosMarcados.filter(m => m !== key);
    setField('ModulosPermitidos', serializeModulosPermitidos(siguiente));
  }

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
              <div className="field">
                <label>Tipo de colaborador</label>
                <select value={form.TipoColaborador} onChange={e => setField('TipoColaborador', e.target.value)} disabled={!canWrite}>
                  <option value="">— seleccionar —</option>
                  {TIPO_COLABORADOR_OPTIONS.map(o => <option value={o} key={o}>{o}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Cargo</label>
                <select value={form.Cargo} onChange={e => setField('Cargo', e.target.value)} disabled={!canWrite}>
                  <option value="">— seleccionar —</option>
                  {/* si el valor ya guardado no está en la lista fija (cargo nuevo, o mayúsculas distintas), se agrega igual para no esconderlo */}
                  {(form.Cargo && !CARGO_OPTIONS.includes(form.Cargo) ? [form.Cargo, ...CARGO_OPTIONS] : CARGO_OPTIONS).map(o => <option value={o} key={o}>{o}</option>)}
                </select>
              </div>
              <div className="field"><label>Fecha de ingreso</label><input type="date" value={form.FechaIngreso} onChange={e => setField('FechaIngreso', e.target.value)} readOnly={!canWrite} /></div>
              <div className="field"><label>Fecha de retiro</label><input type="date" value={form.FechaRetiro} onChange={e => setField('FechaRetiro', e.target.value)} readOnly={!canWrite} /></div>
            </div>
          </div>
          <div className="field-section">
            <h4>Acceso a módulos</h4>
            <p className="field-hint-text">Marca solo los módulos que esta persona debe poder ver. Dashboard e Informes quedan siempre visibles para cualquiera que inicie sesión.</p>
            <div className="checkbox-grid">
              {MODULOS_DISPONIBLES.map(m => (
                <label key={m.key} className="checkbox-field">
                  <input type="checkbox" checked={modulosMarcados.includes(m.key)} onChange={e => toggleModulo(m.key, e.target.checked)} disabled={!canWrite} />
                  {m.label}
                </label>
              ))}
            </div>
            <label className="checkbox-field" style={{marginTop:12}}>
              <input type="checkbox" checked={form.SoloLectura} onChange={e => setField('SoloLectura', e.target.checked)} disabled={!canWrite} />
              Solo lectura (puede consultar e imprimir, pero no crear, editar ni eliminar)
            </label>
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
