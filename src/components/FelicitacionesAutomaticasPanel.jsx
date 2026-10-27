import { useState } from 'react';
import { cargarEstado, programarPendientes, enviarPrueba, esCuentaDeSoporte, REMITENTE_AUTOMATICO, DIAS_ADELANTE } from '../lib/felicitacionesAutomaticas';
import { mensajeError } from '../lib/graph';

const ETIQUETA = { enviada: 'Enviada', programada: 'Programada 7:00 a. m.', pendiente: 'Sin programar' };
const CLASE = { enviada: 'badge-verde', programada: 'badge-amarillo', pendiente: 'badge-gris' };

// Envío automático de las felicitaciones (desde Soporte@, a las 7:00 a. m. del cumpleaños). El portal deja cada correo programado en Exchange; Exchange lo entrega solo.
export default function FelicitacionesAutomaticasPanel({ colaboradores, listas, config, liveMode, notify, onVistaPrevia }){
  const [plan, setPlan] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [enviandoPrueba, setEnviandoPrueba] = useState(false);
  const soporte = esCuentaDeSoporte();

  async function revisar(){
    setCargando(true); setError('');
    try{ setPlan(await cargarEstado(colaboradores)); }
    catch(err){ console.error(err); setError(mensajeError(err)); }
    finally{ setCargando(false); }
  }
  async function programar(){
    setConfirmando(false);
    setProgreso({ i: 0, total: plan.filter(x => x.estado === 'pendiente').length, nombre: '' });
    const r = await programarPendientes(plan, listas, (i, total, nombre) => setProgreso({ i, total, nombre }), config, colaboradores);
    setProgreso(null);
    if(r.hechos.length) notify?.('✓ Quedaron programadas ' + r.hechos.length + ' felicitación' + (r.hechos.length === 1 ? '' : 'es') + ' para las 7:00 a. m. del cumpleaños, enviadas desde ' + REMITENTE_AUTOMATICO + ': ' + r.hechos.join(', ') + '.', 'success');
    if(r.fallos.length) notify?.('No se pudo programar: ' + r.fallos.map(f => f.nombre + ' (' + f.motivo + ')').join(' · '), 'error');
    await revisar();
  }
  async function probar(){
    const c = (colaboradores || []).find(x => x.Activo && x.Correo);
    if(!c){ notify?.('No hay un colaborador activo con correo para armar la prueba.', 'error'); return; }
    setEnviandoPrueba(true);
    try{
      const iso = await enviarPrueba(c, listas, config);
      notify?.('✓ Prueba programada: llegará a ' + REMITENTE_AUTOMATICO + ' hacia las ' + new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) + '. Si llega a esa hora, el envío automático funciona; si llega de inmediato o no llega, avísame.', 'success');
    }catch(err){ console.error(err); notify?.('No se pudo programar la prueba: ' + mensajeError(err), 'error'); }
    finally{ setEnviandoPrueba(false); }
  }

  if(!liveMode) return null;
  const pendientes = plan ? plan.filter(x => x.estado === 'pendiente') : [];
  return (
    <details className="cumple-auto">
      <summary>Envío automático de las felicitaciones (desde {REMITENTE_AUTOMATICO}, 7:00 a. m.)</summary>
      <div className="cumple-auto-cuerpo">
        <p className="save-hint" style={{margin:'0 0 8px'}}>
          Cada correo queda programado en Outlook para las 7:00 a. m. del día del cumpleaños y sale solo, aunque el portal esté cerrado, con copia al resto del equipo activo. Se programan los cumpleaños de los próximos {DIAS_ADELANTE} días.
        </p>
        {!soporte && <p className="save-hint" style={{margin:'0 0 8px', color:'#ffd98a'}}>Inicia sesión con <strong>{REMITENTE_AUTOMATICO}</strong> para programarlos: los correos salen de la cuenta con la que entraste.</p>}
        <div className="cumple-auto-acciones">
          <button type="button" className="cumple-felicitar" onClick={revisar} disabled={cargando}>{cargando ? 'Revisando…' : 'Ver estado'}</button>
          <button type="button" className="cumple-felicitar" onClick={probar} disabled={!soporte || enviandoPrueba}>{enviandoPrueba ? 'Programando prueba…' : 'Enviar prueba a Soporte (en 3 min)'}</button>
          {plan && pendientes.length > 0 && !confirmando && !progreso && (
            <button type="button" className="cumple-felicitar cumple-felicitar-fuerte" onClick={() => setConfirmando(true)} disabled={!soporte}>Programar {pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}</button>
          )}
        </div>
        {error && <p className="save-hint" style={{margin:'8px 0 0', color:'#ffb4a8'}}>{error}</p>}
        {confirmando && (
          <div className="cumple-auto-confirmar" role="alert">
            <p style={{margin:'0 0 8px'}}><strong>Se enviarán correos reales</strong> a las 7:00 a. m. del día de cada cumpleaños, desde {REMITENTE_AUTOMATICO}, con copia al resto del equipo activo, a: {pendientes.map(x => x.colaborador.Nombre + ' (' + x.texto + ')').join(', ')}. ¿Programarlos?</p>
            <button type="button" className="cumple-felicitar cumple-felicitar-fuerte" onClick={programar}>Sí, programar</button>{' '}
            <button type="button" className="cumple-felicitar" onClick={() => setConfirmando(false)}>Cancelar</button>
          </div>
        )}
        {progreso && <p className="save-hint" style={{margin:'8px 0 0'}}>Programando {progreso.i + 1} de {progreso.total}{progreso.nombre ? ' — ' + progreso.nombre : ''}…</p>}
        {plan && (
          plan.length ? (
            <ul className="cumple-auto-lista">
              {plan.map(x => (
                <li key={x.colaborador.id}>
                  <span>{x.colaborador.Nombre} · {x.texto}</span>
                  <span className="cumple-auto-fila-acciones">
                    <button type="button" className="cumple-felicitar" onClick={() => onVistaPrevia?.(x.colaborador)} aria-label={'Vista previa de la felicitación de ' + (x.colaborador.Nombre || '')}>👁 Vista previa</button>
                    <span className={'badge ' + CLASE[x.estado]}>{ETIQUETA[x.estado]}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="save-hint" style={{margin:'8px 0 0'}}>Nadie cumple años en los próximos {DIAS_ADELANTE} días (con correo y fecha de nacimiento en su ficha).</p>
        )}
      </div>
    </details>
  );
}
