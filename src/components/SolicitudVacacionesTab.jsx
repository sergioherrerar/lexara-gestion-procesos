import { useState, useRef, useEffect } from 'react';
import IconButton, { IconTextButton } from './IconButton';
import { agruparVacacionesPorColaborador, solicitudesDeVacaciones, estadoPeriodo, ETIQUETA_ESTADO_PERIODO, CLASE_ESTADO_PERIODO } from '../lib/vacaciones';
import { diasHabilesEntre, fechaReintegro, CORREO_GERENCIA, CORREO_SOPORTE } from '../lib/solicitudVacaciones';
import { cuentaDelPortal, fmtFechaDMA } from '../lib/graph';

// Informes → «Solicitud de vacaciones» (2026-10-29, pedido del usuario: «muy parecido a Horas Extras»). Misma idea que Horas Extras: el colaborador la llena acá, al
// guardarla el portal envía un correo a Gerencia (desde la cuenta de quien la crea, con copia a Soporte) y la aprobación se da en Administración → Vacaciones.
// Mientras no esté Aprobada se puede editar o eliminar desde acá; ya aprobada queda bloqueada.
const SUBTABS = [
  { key: 'solicitar', label: 'Solicitar' },
  { key: 'solicitudes', label: 'Solicitudes' },
];
const FORM_VACIO = { Colaborador: '', FechaInicio: '', FechaFin: '', Dias: '', Observaciones: '' };

export default function SolicitudVacacionesTab({ colaboradores, vacacionesPeriodos, onSolicitar, onEditar, onEliminar, onReenviar, liveMode, notify }){
  const [subTab, setSubTab] = useState('solicitar');
  const [form, setForm] = useState(FORM_VACIO);
  const [diasManual, setDiasManual] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [reenviandoId, setReenviandoId] = useState(null);
  const formRef = useRef(null);

  const filas = agruparVacacionesPorColaborador(colaboradores, vacacionesPeriodos);
  const solicitudes = solicitudesDeVacaciones(vacacionesPeriodos);
  const miNombre = (() => {
    const yo = (colaboradores || []).find(c => String(c.Correo || '').trim().toLowerCase() === cuentaDelPortal());
    return (yo?.Nombre || '').trim();
  })();

  // La persona que entró es la que pide por defecto (la puede cambiar: Gerencia/Administración registran por otros).
  useEffect(() => {
    if(!form.Colaborador && miNombre && filas.some(f => (f.nombre || '').trim() === miNombre)) setForm(prev => ({ ...prev, Colaborador: miNombre }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miNombre, filas.length]);
  useEffect(() => {
    if(subTab === 'solicitar' && editandoId && formRef.current) formRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [subTab, editandoId]);

  function setField(key, value){
    setForm(prev => {
      const siguiente = { ...prev, [key]: value };
      if((key === 'FechaInicio' || key === 'FechaFin') && !diasManual){
        const n = diasHabilesEntre(siguiente.FechaInicio, siguiente.FechaFin);
        siguiente.Dias = n > 0 ? String(n) : '';
      }
      return siguiente;
    });
  }

  const fila = filas.find(f => (f.nombre || '').trim() === (form.Colaborador || '').trim());
  const dias = Number(form.Dias) || 0;
  // Al EDITAR no se vuelve a contar la propia solicitud (ya está sumada en «tomados»).
  const propia = editandoId ? Number((vacacionesPeriodos || []).find(p => p.id === editandoId)?.Dias) || 0 : 0;
  const pendientesAntes = fila && fila.diasPendientes != null ? Math.round((fila.diasPendientes + propia) * 100) / 100 : null;
  const pendientesDespues = pendientesAntes != null ? Math.round((pendientesAntes - dias) * 100) / 100 : null;
  const fechaInvalida = form.FechaInicio && form.FechaFin && form.FechaFin < form.FechaInicio;

  function limpiar(){ setForm({ ...FORM_VACIO, Colaborador: miNombre && filas.some(f => (f.nombre || '').trim() === miNombre) ? miNombre : '' }); setDiasManual(false); setEditandoId(null); }
  function editar(p){
    setEditandoId(p.id); setDiasManual(true);
    setForm({ Colaborador: p.Colaborador || '', FechaInicio: String(p.FechaInicio || '').slice(0, 10), FechaFin: String(p.FechaFin || '').slice(0, 10), Dias: p.Dias ?? '', Observaciones: p.Observaciones || '' });
    setSubTab('solicitar');
  }
  async function enviar(){
    if(!form.Colaborador || !form.FechaInicio || !form.FechaFin || !form.Dias){
      notify?.('Completa Colaborador, Fecha inicio, Fecha fin y Días antes de enviar la solicitud.', 'error'); return;
    }
    if(fechaInvalida){ notify?.('La fecha fin no puede ser anterior a la fecha inicio.', 'error'); return; }
    if(!(dias > 0)){ notify?.('Los días solicitados deben ser mayores a cero.', 'error'); return; }
    setEnviando(true);
    try{
      const datos = { Colaborador: form.Colaborador, FechaInicio: form.FechaInicio, FechaFin: form.FechaFin, Dias: dias, Observaciones: form.Observaciones };
      if(editandoId){
        await onEditar?.(editandoId, datos);
        limpiar(); setSubTab('solicitudes');
      }else{
        const creado = await onSolicitar?.(datos);
        if(creado){ limpiar(); setSubTab('solicitudes'); }
      }
    } finally { setEnviando(false); }
  }
  async function reenviar(p){
    setReenviandoId(p.id);
    try{ await onReenviar?.(p); } finally { setReenviandoId(null); }
  }

  const nombreFueraDeLista = form.Colaborador && !filas.some(f => (f.nombre || '').trim() === form.Colaborador.trim());
  return (
    <div>
      <div className="subnav-panel">
        <div className="subtabs">
          {SUBTABS.map(t => (
            <button key={t.key} type="button" className={'subtab' + (subTab === t.key ? ' active' : '')} onClick={() => setSubTab(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>

      {subTab === 'solicitar' && (
        <div className="panel" style={{ marginTop: 20 }} ref={formRef}>
          <div className="panel-head"><h3>{editandoId ? 'Editar solicitud de vacaciones' : 'Solicitud de vacaciones'}</h3></div>
          <div className="panel-body">
            <p style={{ margin: '0 0 16px', color: 'var(--texto-suave)', fontSize: 13 }}>
              Elige tus fechas: Portal Lexara calcula los días hábiles (sin sábados, domingos ni festivos) y los puedes corregir si son días no consecutivos. Al enviarla se guarda como <strong>pendiente</strong> y se manda un correo a Gerencia ({CORREO_GERENCIA}) desde tu cuenta, con copia a Soporte ({CORREO_SOPORTE}). La aprobación se da en Administración.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px,1fr))', gap: 14, marginBottom: 8 }}>
              <div className="field">
                <label>Colaborador</label>
                <select value={form.Colaborador} onChange={e => setField('Colaborador', e.target.value)} disabled={!!editandoId}>
                  <option value="">— Selecciona —</option>
                  {nombreFueraDeLista && <option value={form.Colaborador}>{form.Colaborador}</option>}
                  {filas.map(f => <option key={f.id} value={f.nombre}>{f.nombre}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Fecha inicio</label>
                <input type="date" value={form.FechaInicio} onChange={e => setField('FechaInicio', e.target.value)} />
              </div>
              <div className="field">
                <label>Fecha fin</label>
                <input type="date" value={form.FechaFin} min={form.FechaInicio || undefined} onChange={e => setField('FechaFin', e.target.value)} />
              </div>
              <div className="field">
                <label>Días</label>
                <input type="number" min="0" step="0.5" value={form.Dias} onChange={e => { setDiasManual(true); setForm(prev => ({ ...prev, Dias: e.target.value })); }} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Observaciones (opcional)</label>
                <input type="text" value={form.Observaciones} onChange={e => setField('Observaciones', e.target.value)} placeholder="Ej: días no consecutivos, 1, 4, 5, 6 y 8" />
              </div>
            </div>
            {(form.FechaInicio && form.FechaFin && !fechaInvalida) && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '0 0 14px', padding: '10px 14px', background: 'var(--gris-claro)', borderRadius: 8, fontSize: 12.5 }}>
                <span>Regresas el: <strong>{fmtFechaDMA(fechaReintegro(form.FechaFin))}</strong></span>
                {pendientesAntes != null && <span>Días pendientes hoy: <strong>{pendientesAntes}</strong></span>}
                {pendientesDespues != null && dias > 0 && <span>Quedarían: <strong style={{ color: pendientesDespues < 0 ? '#a3281c' : undefined }}>{pendientesDespues}</strong></span>}
                {pendientesDespues != null && pendientesDespues < 0 && <span style={{ color: '#a3281c' }}>Supera los días pendientes; igual se envía y Gerencia decide.</span>}
              </div>
            )}
            {fechaInvalida && <p className="save-hint" style={{ color: '#a3281c', margin: '0 0 12px' }}>La fecha fin no puede ser anterior a la fecha inicio.</p>}
            {!liveMode && <p className="save-hint" style={{ margin: '0 0 12px' }}>En modo demo la solicitud se guarda de prueba y no se envía ningún correo.</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <IconTextButton icon="mail" variant="primary" onClick={enviar} disabled={enviando}>
                {enviando ? 'Enviando…' : (editandoId ? 'Guardar cambios' : 'Enviar solicitud')}
              </IconTextButton>
              {editandoId && <button type="button" className="btn-secondary" onClick={() => { limpiar(); setSubTab('solicitudes'); }}>Cancelar</button>}
            </div>
          </div>
        </div>
      )}

      {subTab === 'solicitudes' && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="panel-head"><h3>Solicitudes de vacaciones</h3></div>
          <div className="panel-body">
            <p style={{ margin: '0 0 16px', color: 'var(--texto-suave)', fontSize: 13 }}>
              Las solicitudes hechas desde Portal Lexara y su estado. Mientras estén pendientes las puedes editar, eliminar o reenviar el correo a Gerencia; la aprobación se da en Administración y, una vez aprobadas, quedan bloqueadas.
            </p>
            {!solicitudes.length ? (
              <div className="empty-state empty-state-compact">Todavía no hay solicitudes de vacaciones.</div>
            ) : (
              <div className="table-wrap">
                <table className="table-compact">
                  <thead>
                    <tr><th>Colaborador</th><th>Fecha inicio</th><th>Fecha fin</th><th>Días</th><th>Observaciones</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {solicitudes.map(p => {
                      const estado = estadoPeriodo(p);
                      return (
                        <tr key={p.id}>
                          <td className="cliente">{p.Colaborador || '—'}</td>
                          <td>{fmtFechaDMA(p.FechaInicio) || '—'}</td>
                          <td>{fmtFechaDMA(p.FechaFin) || '—'}</td>
                          <td>{p.Dias ?? '—'}</td>
                          <td>{p.Observaciones || '—'}</td>
                          <td><span className={'badge ' + CLASE_ESTADO_PERIODO[estado]}>{ETIQUETA_ESTADO_PERIODO[estado]}</span></td>
                          <td>
                            {estado === 'aprobada'
                              ? <span className="save-hint" style={{ fontSize: 11 }}>No editable</span>
                              : (
                                <div className="row-actions">
                                  <IconButton icon="edit" variant="edit" label={`Editar solicitud de ${p.Colaborador}`} onClick={() => editar(p)} />
                                  <IconButton icon="mail" variant="mail" label={reenviandoId === p.id ? 'Enviando…' : `Reenviar correo a Gerencia de la solicitud de ${p.Colaborador}`} onClick={() => reenviar(p)} />
                                  <IconButton icon="delete" variant="delete" label={`Eliminar solicitud de ${p.Colaborador}`} onClick={() => onEliminar?.(p.id)} />
                                </div>
                              )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
