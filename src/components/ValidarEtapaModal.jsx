import { useEffect, useMemo, useState } from 'react';
import { listarArchivosDelProceso, guardarValidacionCobro, mensajeError } from '../lib/graph';
import { RUTAS_CARPETAS_ENTIDAD } from '../config';
import { etiquetaEtapa } from '../lib/propuestaServicios';

// «Validar la etapa» (Informes → Etapas por cobrar, 2026-11-28, pedido del usuario): el abogado tiene que verificar la información: busca la PIEZA que demuestra la etapa en la carpeta del proceso, certifica que la etapa ya
// pasó y se crea, para quien está en el portal, el PENDIENTE «solicitar la orden de compra de ese proceso por esa etapa» (aparece en Vencimientos y en la campana). La pieza certificada se anexa luego al correo de la orden de compra.
const nrm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const SUGERENCIAS = [
  [/poder/, /poder/], [/admision/, /admi/], [/reforma/, /reforma/], [/contestacion/, /contest/], [/excepciones|exepciones/, /excepci|exepci/],
  [/oposicion/, /oposici/], [/prueba/, /prueba/], [/sentencia/, /sentencia|fallo/], [/audiencia/, /acta|audiencia/], [/radicacion demanda/, /demanda|reparto/],
];
function sugerida(archivos, etapa){
  const e = nrm(etapa);
  const par = SUGERENCIAS.find(([re]) => re.test(e));
  if(!par) return null;
  return archivos.find(a => par[1].test(nrm(a.sub + ' ' + a.nombre))) || null;
}
const tamano = n => !n ? '' : n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

export default function ValidarEtapaModal({ liveMode, item, resultado, config, miNombre, pendientes, onCrearPendiente, notify, onGuardado, onCerrar }){
  const [lista, setLista] = useState(null);   // { status, archivos } | null mientras carga
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('');
  const [sel, setSel] = useState('');   // id del archivo elegido
  const [certifico, setCertifico] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const p = item.proceso || {};
  useEffect(() => {
    const f = e => { if(e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try{
        // Modo demo: archivos de ejemplo (no hay SharePoint)
        const r = !liveMode ? { status: 'ok', carpeta: { nombre: 'Carpeta de ejemplo' }, archivos: [{ sub: '0. Contrato', nombre: 'Contrato.pdf', id: 'd1', size: 120000, webUrl: '' }, { sub: '2. Poder', nombre: 'Poder.pdf', id: 'd2', size: 90000, webUrl: '' }, { sub: '1. Escritos', nombre: 'Auto admite demanda.pdf', id: 'd3', size: 250000, webUrl: '' }, { sub: '1. Escritos', nombre: 'Sentencia primera instancia.pdf', id: 'd4', size: 1800000, webUrl: '' }] } : await listarArchivosDelProceso(config, RUTAS_CARPETAS_ENTIDAD, p);
        if(!vivo) return;
        setLista(r);
        if(r.status === 'ok'){ const s = sugerida(r.archivos, item.etapa); if(s) setSel(s.id); }
      }catch(e){ if(vivo){ console.error(e); setError(mensajeError(e)); setLista({ status: 'error', archivos: [] }); } }
    })();
    return () => { vivo = false; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const archivos = useMemo(() => ((lista && lista.archivos) || []).filter(a => !filtro.trim() || nrm(a.sub + ' ' + a.nombre).includes(nrm(filtro))), [lista, filtro]);
  const elegido = ((lista && lista.archivos) || []).find(a => a.id === sel) || null;
  const textoPendiente = 'Solicitar orden de compra del proceso ' + (p.Radicado || '') + ' por la etapa ' + etiquetaEtapa(item.etapa);

  async function certificar(){
    if(!elegido || !certifico || guardando) return;
    setGuardando(true);
    try{
      const hoy = new Date(); const hoyISO = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
      const validacion = {
        contrato: item.fp.Contrato || '', etapa: item.etapa, proceso: p.Radicado || '', procesoId: p.id, formaPagoId: item.fp.id, pago: item.n, salarios: item.salarios,
        detectado: resultado && resultado.evidencia ? { origen: resultado.evidencia.origen, fecha: resultado.evidencia.fecha, texto: resultado.evidencia.texto } : null,
        pieza: { nombre: elegido.nombre, id: elegido.id, driveId: elegido.driveId, webUrl: elegido.webUrl, sub: elegido.sub, size: elegido.size },
        certificadoPor: miNombre || '', fecha: hoyISO,
      };
      if(liveMode) await guardarValidacionCobro(config, validacion);
      let creado = false;
      const yaHay = (pendientes || []).some(x => x.Estado !== 'Terminado' && x.Pendiente === textoPendiente);
      if(onCrearPendiente && !yaHay){
        await onCrearPendiente({ Pendiente: textoPendiente, PendienteDe: miNombre || '', PendientePara: miNombre || '', FechaPendiente: hoyISO, Estado: 'Vigente', ProcesoMD: p.id,
          Observacion: 'Etapa «' + etiquetaEtapa(item.etapa) + '» validada por ' + (miNombre || 'el abogado') + ' el ' + hoyISO + '. Pieza que la demuestra: «' + elegido.nombre + '». Contrato: ' + (item.fp.Contrato || '—') + '. Se genera en Administración → Etapas por cobrar.' });
        creado = true;
      }
      notify?.('Etapa certificada con la pieza «' + elegido.nombre + '».' + (creado ? ' Quedó el pendiente «' + textoPendiente + '» en Vencimientos.' : yaHay ? ' Ya había un pendiente vigente para esta etapa.' : ''), 'success');
      onGuardado?.(validacion);
      onCerrar();
    }catch(err){ console.error(err); notify?.('No se pudo guardar la validación: ' + mensajeError(err), 'error'); }
    finally{ setGuardando(false); }
  }

  return (
    <div className="confirm-overlay" onClick={e => { if(e.target === e.currentTarget) onCerrar(); }}>
      <div className="rama-modal val-modal" role="dialog" aria-modal="true" aria-label="Validar la etapa">
        <h4>Validar la etapa «{etiquetaEtapa(item.etapa)}»</h4>
        <p className="rama-res-suave">Proceso <strong>{p.Radicado}</strong> · {p.Cliente} · contrato {item.fp.Contrato || '—'} · {String(item.salarios || '').replace('.', ',') || '—'} salarios. Busque en la carpeta del proceso la <strong>pieza que demuestra que la etapa ya pasó</strong>, revísela y certifíquelo: se crea el pendiente de <strong>solicitar la orden de compra</strong> y esa pieza se anexa al correo.</p>
        {resultado && resultado.estado === 'pasada' && <p className="rama-res-suave"><span className="badge badge-verde">Lo que encontró el portal</span> {resultado.evidencia.origen}{resultado.evidencia.fecha ? ' · ' + resultado.evidencia.fecha.split('-').reverse().join('-') : ''}: «{resultado.evidencia.texto}»</p>}
        {!lista && <div className="empty-state empty-state-compact">Leyendo la carpeta del proceso…</div>}
        {error && <div className="rama-error" role="alert"><strong>No se pudo leer la carpeta.</strong> {error}</div>}
        {lista && lista.status !== 'ok' && !error && <div className="rama-hist-aviso"><span><strong>No encontré la carpeta de este proceso en SharePoint.</strong> {lista.status === 'ambiguo' ? 'Hay varias carpetas que podrían ser (' + (lista.candidatas || []).join(', ') + '). ' : ''}Abra el proceso y use «Buscar y vincular carpeta», o guarde la pieza en la carpeta del proceso y vuelva a intentarlo.</span></div>}
        {lista && lista.status === 'ok' && (
          <>
            <div className="rama-fechas"><label style={{ flex: 1 }}>Buscar la pieza <input type="text" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Nombre del archivo o de la subcarpeta (auto, sentencia, poder…)" /></label></div>
            <p className="rama-res-suave" style={{ margin: '4px 0' }}>Carpeta: «{lista.carpeta.nombre}» · {lista.archivos.length} archivos</p>
            <div className="val-lista" role="radiogroup" aria-label="Pieza que demuestra la etapa">
              {archivos.length === 0 ? <div className="empty-state empty-state-compact">No hay archivos que coincidan.</div> : archivos.map(a => (
                <label key={a.id} className={'val-fila' + (a.id === sel ? ' val-fila--sel' : '')}>
                  <input type="radio" name="pieza" checked={a.id === sel} onChange={() => setSel(a.id)} />
                  <span className="val-nombre"><strong>{a.nombre}</strong><br /><span className="rama-res-suave">{a.sub ? a.sub + ' · ' : ''}{tamano(a.size)}</span></span>
                  {a.webUrl && <a className="rama-mas" href={a.webUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>abrir</a>}
                </label>
              ))}
            </div>
          </>
        )}
        {elegido && <label className="val-certifico"><input type="checkbox" checked={certifico} onChange={e => setCertifico(e.target.checked)} /> <span>Certifico que revisé la pieza «<strong>{elegido.nombre}</strong>» y que la etapa «{etiquetaEtapa(item.etapa)}» <strong>ya pasó</strong>, por lo que se puede cobrar.</span></label>}
        <div className="confirm-actions">
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={certificar} disabled={!elegido || !certifico || guardando}>{guardando ? 'Guardando…' : 'Certificar y crear el pendiente'}</button>
        </div>
      </div>
    </div>
  );
}
