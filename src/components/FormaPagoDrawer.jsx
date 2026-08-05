import { useState, useEffect } from 'react';
import { procesoForFactura, parseMonto, fmtMonto, normalize, facturaNumero } from '../lib/graph';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

const LINE_NUMS = [1,2,3,4,5,6];

const ETAPA_CONTRATO_OPTIONS = [
  "Acta Audiencia","Administracion Proceso","Admision","Asesoria","Asesorias","Auditoria",
  "Audiencia de Conciliacion","Auto de Pruebas","Contestacion","Cuota Litis","Entrega de Poder",
  "Entrega poder Demanda","Escrito de Oposicion","Honorarios","Pronunciamiento Frente a las exepciones",
  "Radicacion Conciliacion","Radicacion de contestacion","Radicacion Demanda","Reforma",
  "Sentencia 1ra","Sentencia 2da","Tutelas","% Antes de Sentencia","% Por Conciliacion",
  "% Por Sentencia","% Reconocimiento Por Recurso",
];

// SharePoint puede devolver la casilla "Etapa procesal cumplida" como
// verdadero booleano o como texto ("Sí"/"No") según el tipo real de columna
// — se trata cualquiera de las dos formas, nunca un string no vacío como
// "truthy" a ciegas (eso volvería "No" en verdadero).
function isChecked(value){
  if(value === true || value === 1) return true;
  if(typeof value === 'string') return /^(s[ií]|true|1)$/i.test(value.trim());
  return false;
}

function emptyForm(formaPago){
  const initial = { Contrato: formaPago.Contrato || "", Honorarios: formaPago.Honorarios ? fmtMonto(parseMonto(formaPago.Honorarios)) : "" };
  LINE_NUMS.forEach(n => {
    initial[`Pago${n}`] = formaPago[`Pago${n}`] || "";
    const vp = formaPago[`ValorPago${n}`];
    initial[`ValorPago${n}`] = vp ? fmtMonto(parseMonto(vp)) : "";
    initial[`EtapaProcesalCumplida${n}`] = isChecked(formaPago[`EtapaProcesalCumplida${n}`]);
  });
  return initial;
}

// "Factura" de cada pago ya no se escribe a mano: se busca sola la factura
// que comparte el mismo Contrato Y la misma Etapa (el valor elegido en
// "Pago N") — si hay coincidencia se guarda y se resalta en verde.
function facturaParaPago(facturas, contrato, etapa){
  if(!contrato || !etapa) return null;
  const targetContrato = normalize(contrato);
  const targetEtapa = normalize(etapa);
  return (facturas||[]).find(f => f.Contrato && normalize(f.Contrato) === targetContrato && f.EtapaContrato && normalize(f.EtapaContrato) === targetEtapa) || null;
}

export default function FormaPagoDrawer({ formaPago, procesos, facturas, onClose, onSave, onDelete, liveMode, saving, canWrite = true }){
  const [form, setForm] = useState(null);

  useEffect(() => {
    setForm(formaPago ? emptyForm(formaPago) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formaPago]);

  useEscapeToClose(!!formaPago, onClose);

  if(!formaPago || !form) return null;

  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }
  function setLineField(n, field, value){ setField(`${field}${n}`, value); }

  const linkedProceso = procesoForFactura(procesos, form); // misma relación por Contrato
  const esNuevo = formaPago.id == null;
  const completados = LINE_NUMS.filter(n => form[`EtapaProcesalCumplida${n}`]).length;

  // Si el campo "Factura" de ese pago ya tiene un valor guardado, no se vuelve
  // a calcular ni se pisa — solo se llena automáticamente cuando está vacío.
  function facturaPagoActual(n){
    const yaGuardada = (formaPago[`FacturaPago${n}`] || "").toString().trim();
    if(yaGuardada) return yaGuardada;
    const match = facturaParaPago(facturas, form.Contrato, form[`Pago${n}`]);
    return match ? facturaNumero(match) : "";
  }

  function handleSave(){
    const payload = {...form};
    payload.Honorarios = parseMonto(payload.Honorarios);
    LINE_NUMS.forEach(n => {
      payload[`ValorPago${n}`] = parseMonto(payload[`ValorPago${n}`]);
      payload[`FacturaPago${n}`] = facturaPagoActual(n);
    });
    onSave(payload);
  }

  return (
    <>
      <div id="formapago-overlay" className="active" onClick={onClose}></div>
      <div id="formapago-drawer" className="active">
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div className="eyebrow">FORMA DE PAGO {!esNuevo && `— No. ${formaPago.id}`}</div>
          <h2>{form.Contrato || "Sin contrato"}</h2>
          <span className="badge badge-verde">{completados} de 6 pagos cumplidos</span>
        </div>
        <div className="drawer-body">
          <div className="field-section">
            <h4>Relaciones</h4>
            <div className="field-grid">
              <div className="field">
                <label>Número de contrato</label>
                <input type="text" list="lista-contratos-fp" value={form.Contrato} onChange={e => setField('Contrato', e.target.value)} readOnly={!canWrite} placeholder="Escribe para buscar…" />
                <datalist id="lista-contratos-fp">
                  {procesos.filter(p => p.NumeroContrato).map(p => (
                    <option value={p.NumeroContrato} key={p.id}>{p.NumeroContrato} · {p.Radicado}</option>
                  ))}
                </datalist>
                {form.Contrato && !linkedProceso && (
                  <div className="field-warning">Este contrato no coincide con ningún proceso registrado.</div>
                )}
                {linkedProceso && (
                  <div className="field-info">Numero corto: {linkedProceso.Radicado || "—"}</div>
                )}
              </div>
              <div className="field">
                <label>Honorarios</label>
                <input type="text" value={form.Honorarios} onChange={e => setField('Honorarios', e.target.value)} readOnly={!canWrite} />
              </div>
            </div>
          </div>
          <div className="field-section">
            <h4>Pagos</h4>
            <div className="table-wrap">
              <table className="lineas-pago">
                <thead>
                  <tr><th>Pago</th><th>Etapa</th><th>Valor pago</th><th>Factura</th><th>Cumplida</th></tr>
                </thead>
                <tbody>
                  {LINE_NUMS.map(n => (
                    <tr key={n} className={form[`EtapaProcesalCumplida${n}`] ? "linea-pago-cumplida" : ""}>
                      <td className="linea-pago-label">Pago {n}</td>
                      <td>
                        <select value={form[`Pago${n}`]} onChange={e => setLineField(n,'Pago',e.target.value)} disabled={!canWrite}>
                          <option value="">— seleccionar etapa —</option>
                          {ETAPA_CONTRATO_OPTIONS.map(o => <option value={o} key={o}>{o}</option>)}
                        </select>
                      </td>
                      <td><input type="text" value={form[`ValorPago${n}`]} onChange={e => setLineField(n,'ValorPago',e.target.value)} readOnly={!canWrite} /></td>
                      <td className="linea-pago-factura">
                        {(() => {
                          const valor = facturaPagoActual(n);
                          return valor
                            ? <span className="linea-pago-factura-match">{valor}</span>
                            : <span className="linea-pago-factura-sin">—</span>;
                        })()}
                      </td>
                      <td className="linea-pago-check">
                        <input type="checkbox" checked={form[`EtapaProcesalCumplida${n}`]} onChange={e => setLineField(n,'EtapaProcesalCumplida',e.target.checked)} disabled={!canWrite} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                <button type="button" className="btn-secondary" onClick={() => onDelete(formaPago.id)} disabled={saving}>Eliminar</button>
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
