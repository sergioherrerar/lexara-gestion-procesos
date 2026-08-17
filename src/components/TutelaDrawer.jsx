import { useState, useEffect } from 'react';
import { FieldCard, RichTextEditor } from './FormFields';
import { IconTextButton } from './IconButton';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

// Campos que todavía no se sabe si son un select fijo en SharePoint (el
// formulario Access original los mostraba como desplegable, pero no
// conocemos las opciones reales) — quedan como texto libre por ahora. Solo
// los que ya tienen un criterio claro (Sí/No) se dejan como select. Ver
// [[project_tutelas_modulo]] — a confirmar con el usuario antes de fijar
// opciones para TipoVinculacionEntidad/Departamento/Ciudad/Prestacion/TipoRespuesta.
const SI_NO = ["Sí", "No"];

const FIELDS = ["NoTutela", "LinkCarpetaTutela", "LinkCarpetaFormatos", "TipoVinculacionEntidad", "MedidaCautelar",
  "Departamento", "Ciudad", "Proceso", "FechaNotificacion", "FechaVencimiento", "Prestacion", "TipoRespuesta",
  "AgenciaOficiosa", "Usuario", "NoIdentificacion", "Juzgado", "Correo", "Solicita"];

function emptyForm(tutela){
  const initial = { Cliente: tutela.Cliente || "", Entidad: tutela.Entidad || "", Tema: tutela.Tema || "" };
  FIELDS.forEach(k => { initial[k] = tutela[k] || ""; });
  return initial;
}

export default function TutelaDrawer({
  tutela, clientes, temas, valoresEntidad, liveMode, onClose, onSave, onDelete,
  onCreateTema, onSaveTema, onCreateValorEntidad, onSaveValorEntidad, saving, canWrite = true,
}){
  const [form, setForm] = useState(null);
  const [showEditarTema, setShowEditarTema] = useState(false);
  const [nombreTema, setNombreTema] = useState("");
  const [showEditarValor, setShowEditarValor] = useState(false);
  const [valorEntidad, setValorEntidad] = useState("");

  useEffect(() => {
    setForm(tutela ? emptyForm(tutela) : null);
    setShowEditarTema(false);
    setShowEditarValor(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutela]);

  useEscapeToClose(!!tutela, onClose);

  if(!tutela || !form) return null;

  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }

  const esNuevo = tutela.id == null;
  const temaActual = (temas||[]).find(t => t.Nombre === form.Tema) || null;
  const valorActual = (valoresEntidad||[]).find(v => v.Entidad === form.Entidad) || null;

  function abrirEditarTema(){
    setNombreTema(temaActual?.Nombre || "");
    setShowEditarTema(v => !v);
    setShowEditarValor(false);
  }
  async function handleGuardarTema(){
    if(!nombreTema.trim()) return;
    if(temaActual){ await onSaveTema(temaActual.id, {Nombre: nombreTema.trim()}); }
    else { await onCreateTema({Nombre: nombreTema.trim()}); }
    setField('Tema', nombreTema.trim());
    setShowEditarTema(false);
  }

  function abrirEditarValor(){
    setValorEntidad(valorActual?.Valor || "");
    setShowEditarValor(v => !v);
    setShowEditarTema(false);
  }
  async function handleGuardarValor(){
    if(!form.Entidad){ return; }
    if(valorActual){ await onSaveValorEntidad(valorActual.id, {Entidad: form.Entidad, Valor: valorEntidad}); }
    else { await onCreateValorEntidad({Entidad: form.Entidad, Valor: valorEntidad}); }
    setShowEditarValor(false);
  }

  function handleSave(){ onSave(form); }

  const clienteNombres = clientes.map(c => c.RazonSocial).filter(Boolean);
  if(form.Cliente && !clienteNombres.includes(form.Cliente)) clienteNombres.unshift(form.Cliente);
  const entidadOpciones = Array.from(new Set(clientes.map(c => c.Entidad).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  if(form.Entidad && !entidadOpciones.includes(form.Entidad)) entidadOpciones.unshift(form.Entidad);
  const temaOpciones = (temas||[]).map(t => t.Nombre).filter(Boolean);
  if(form.Tema && !temaOpciones.includes(form.Tema)) temaOpciones.unshift(form.Tema);

  return (
    <>
      <div id="tutela-overlay" className="active" onClick={onClose}></div>
      <div id="tutela-drawer" className="drawer-fullscreen active">
        <div className="drawer-head">
          <button className="drawer-back" onClick={onClose}>‹ Volver a Tutelas</button>
          <button className="drawer-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div className="eyebrow">TUTELA</div>
          <h2>{esNuevo ? "Nueva tutela" : (form.NoTutela || "Sin número")}</h2>
        </div>
        <div className="drawer-body">
          <div className="field-section">
            <h4>Identificación</h4>
            <div className="field-card-grid">
              <FieldCard label="No. Tutela">
                <input type="text" value={form.NoTutela} onChange={e => setField('NoTutela', e.target.value)} readOnly={!canWrite} />
              </FieldCard>
              <FieldCard label="Cliente" full>
                <select value={form.Cliente} onChange={e => setField('Cliente', e.target.value)} disabled={!canWrite}>
                  <option value="">— seleccionar cliente —</option>
                  {clienteNombres.map(n => <option value={n} key={n}>{n}</option>)}
                </select>
              </FieldCard>
              <FieldCard label="Entidad">
                <div style={{display:'flex', gap:8, alignItems:'flex-start'}}>
                  <select value={form.Entidad} onChange={e => setField('Entidad', e.target.value)} disabled={!canWrite} style={{flex:1}}>
                    <option value="">— seleccionar —</option>
                    {entidadOpciones.map(n => <option value={n} key={n}>{n}</option>)}
                  </select>
                  {canWrite && <IconTextButton icon="edit" variant="secondary" onClick={abrirEditarValor}>Valor entidad</IconTextButton>}
                </div>
                {showEditarValor && (
                  <div style={{marginTop:10, padding:12, border:'1px solid var(--gris-linea)', borderRadius:8, background:'var(--gris-claro)'}}>
                    {!form.Entidad ? (
                      <div className="field-warning">Elige primero una Entidad.</div>
                    ) : (
                      <>
                        <div className="field"><label>Valor para "{form.Entidad}"</label><input type="text" value={valorEntidad} onChange={e => setValorEntidad(e.target.value)} /></div>
                        <div style={{marginTop:10, display:'flex', gap:8}}>
                          <IconTextButton icon="add" variant="primary" onClick={handleGuardarValor} disabled={saving}>{saving ? "Guardando…" : "Guardar valor"}</IconTextButton>
                          <button type="button" className="btn-secondary" onClick={() => setShowEditarValor(false)} disabled={saving}>Cancelar</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </FieldCard>
              <FieldCard label="Tipo Vinculación Entidad">
                <input type="text" value={form.TipoVinculacionEntidad} onChange={e => setField('TipoVinculacionEntidad', e.target.value)} readOnly={!canWrite} />
              </FieldCard>
            </div>
          </div>

          <div className="field-section">
            <h4>Trámite</h4>
            <div className="field-card-grid">
              <FieldCard label="Departamento">
                <input type="text" value={form.Departamento} onChange={e => setField('Departamento', e.target.value)} readOnly={!canWrite} />
              </FieldCard>
              <FieldCard label="Ciudad">
                <input type="text" value={form.Ciudad} onChange={e => setField('Ciudad', e.target.value)} readOnly={!canWrite} />
              </FieldCard>
              <FieldCard label="Juzgado">
                <input type="text" value={form.Juzgado} onChange={e => setField('Juzgado', e.target.value)} readOnly={!canWrite} />
              </FieldCard>
              <FieldCard label="Proceso">
                <input type="text" value={form.Proceso} onChange={e => setField('Proceso', e.target.value)} readOnly={!canWrite} />
              </FieldCard>
              <FieldCard label="Fecha Notificación">
                <input type="date" value={form.FechaNotificacion} onChange={e => setField('FechaNotificacion', e.target.value)} readOnly={!canWrite} />
              </FieldCard>
              <FieldCard label="Fecha Vencimiento">
                <input type="date" value={form.FechaVencimiento} onChange={e => setField('FechaVencimiento', e.target.value)} readOnly={!canWrite} />
              </FieldCard>
              <FieldCard label="Prestación">
                <input type="text" value={form.Prestacion} onChange={e => setField('Prestacion', e.target.value)} readOnly={!canWrite} />
              </FieldCard>
              <FieldCard label="Tipo Respuesta">
                <input type="text" value={form.TipoRespuesta} onChange={e => setField('TipoRespuesta', e.target.value)} readOnly={!canWrite} />
              </FieldCard>
              <FieldCard label="Tema" full>
                <div style={{display:'flex', gap:8, alignItems:'flex-start'}}>
                  <select value={form.Tema} onChange={e => setField('Tema', e.target.value)} disabled={!canWrite} style={{flex:1}}>
                    <option value="">— seleccionar —</option>
                    {temaOpciones.map(n => <option value={n} key={n}>{n}</option>)}
                  </select>
                  {canWrite && <IconTextButton icon="edit" variant="secondary" onClick={abrirEditarTema}>Tema</IconTextButton>}
                </div>
                {showEditarTema && (
                  <div style={{marginTop:10, padding:12, border:'1px solid var(--gris-linea)', borderRadius:8, background:'var(--gris-claro)'}}>
                    <div className="field"><label>{temaActual ? `Editar "${temaActual.Nombre}"` : "Nuevo tema"}</label><input type="text" value={nombreTema} onChange={e => setNombreTema(e.target.value)} /></div>
                    <div style={{marginTop:10, display:'flex', gap:8}}>
                      <IconTextButton icon="add" variant="primary" onClick={handleGuardarTema} disabled={saving}>{saving ? "Guardando…" : (temaActual ? "Guardar" : "Crear tema")}</IconTextButton>
                      <button type="button" className="btn-secondary" onClick={() => setShowEditarTema(false)} disabled={saving}>Cancelar</button>
                    </div>
                  </div>
                )}
              </FieldCard>
              <FieldCard label="Medida Cautelar">
                <select value={form.MedidaCautelar} onChange={e => setField('MedidaCautelar', e.target.value)} disabled={!canWrite}>
                  <option value="">— seleccionar —</option>
                  {SI_NO.map(o => <option value={o} key={o}>{o}</option>)}
                </select>
              </FieldCard>
              <FieldCard label="Agencia oficiosa">
                <select value={form.AgenciaOficiosa} onChange={e => setField('AgenciaOficiosa', e.target.value)} disabled={!canWrite}>
                  <option value="">— seleccionar —</option>
                  {SI_NO.map(o => <option value={o} key={o}>{o}</option>)}
                </select>
              </FieldCard>
            </div>
          </div>

          <div className="field-section">
            <h4>Enlaces y contacto</h4>
            <div className="field-card-grid">
              <FieldCard label="Link Carpeta Tutela">
                <input type="text" value={form.LinkCarpetaTutela} onChange={e => setField('LinkCarpetaTutela', e.target.value)} readOnly={!canWrite} />
              </FieldCard>
              <FieldCard label="Link Carpeta Formatos">
                <input type="text" value={form.LinkCarpetaFormatos} onChange={e => setField('LinkCarpetaFormatos', e.target.value)} readOnly={!canWrite} />
              </FieldCard>
              <FieldCard label="Usuario">
                <input type="text" value={form.Usuario} onChange={e => setField('Usuario', e.target.value)} readOnly={!canWrite} />
              </FieldCard>
              <FieldCard label="No. Identificación">
                <input type="text" value={form.NoIdentificacion} onChange={e => setField('NoIdentificacion', e.target.value)} readOnly={!canWrite} />
              </FieldCard>
              <FieldCard label="Correo">
                <input type="text" value={form.Correo} onChange={e => setField('Correo', e.target.value)} readOnly={!canWrite} />
              </FieldCard>
            </div>
          </div>

          <div className="field-section">
            <h4>Solicita</h4>
            <div className="field-card-grid">
              <FieldCard label="Solicita" full>
                <RichTextEditor value={form.Solicita} onChange={v => setField('Solicita', v)} readOnly={!canWrite} />
              </FieldCard>
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
                <button type="button" className="btn-secondary" onClick={() => onDelete(tutela.id)} disabled={saving}>Eliminar</button>
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
