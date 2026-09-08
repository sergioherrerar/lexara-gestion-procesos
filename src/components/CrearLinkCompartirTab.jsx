import { useState } from 'react';
import { SITIOS_EXPLORADOR } from '../config';
import { listarDrivesDeSitio, listarHijosRaizDrive, listarHijos, crearLinkCompartidoSoporte } from '../lib/graph';
import { IconTextButton } from './IconButton';

// "Crear link para compartir" (Informes) — pedido explícito del usuario
// 2026-09-07: explorador genérico de SharePoint (Sitio → biblioteca de
// Documentos → subcarpetas/archivos, en cascada, mismo estilo que "Envío
// seguro link de pagos") para generar un enlace de SOLO LECTURA que NO
// caduca (sin expirationDateTime — pedido explícito "ok sin fecha") de
// cualquier archivo o carpeta, sin depender de la lógica de Procesos
// judiciales (Buscar y vincular carpeta / Buscar contrato).
export default function CrearLinkCompartirTab({ config, notify }){
  const [sitioKey, setSitioKey] = useState('');
  const [cargandoDrives, setCargandoDrives] = useState(false);
  const [drives, setDrives] = useState([]);
  const [driveId, setDriveId] = useState('');
  // niveles: 1 por cada carpeta abierta — [{items:[...], seleccionadoId:''}]
  const [niveles, setNiveles] = useState([]);
  const [cargandoNivel, setCargandoNivel] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [linkGenerado, setLinkGenerado] = useState('');

  function limpiarDesdeSitio(){
    setDriveId(''); setDrives([]); setNiveles([]); setLinkGenerado('');
  }

  async function handleElegirDrive(id, sitioParaCargar){
    setDriveId(id);
    setNiveles([]); setLinkGenerado('');
    setCargandoNivel(true);
    try{
      const items = await listarHijosRaizDrive(id);
      setNiveles([{ items, seleccionadoId: '' }]);
    }catch(err){ console.error(err); notify?.("No se pudo listar la carpeta raíz: " + err.message, 'error'); }
    setCargandoNivel(false);
  }

  async function handleElegirSitio(key){
    setSitioKey(key);
    limpiarDesdeSitio();
    if(!key) return;
    const sitio = SITIOS_EXPLORADOR.find(s => s.key === key);
    setCargandoDrives(true);
    try{
      const lista = await listarDrivesDeSitio(config, sitio);
      setDrives(lista);
      if(lista.length === 1) await handleElegirDrive(lista[0].id);
    }catch(err){ console.error(err); notify?.("No se pudo listar las bibliotecas de ese sitio: " + err.message, 'error'); }
    setCargandoDrives(false);
  }

  async function handleElegirEnNivel(indiceNivel, itemId){
    const nivelActual = niveles[indiceNivel];
    const item = nivelActual.items.find(it => it.id === itemId);
    const nuevosNiveles = niveles.slice(0, indiceNivel + 1);
    nuevosNiveles[indiceNivel] = { ...nivelActual, seleccionadoId: itemId };
    setLinkGenerado('');
    if(!item){ setNiveles(nuevosNiveles); return; }
    if(item.folder){
      setNiveles(nuevosNiveles);
      setCargandoNivel(true);
      try{
        const hijos = await listarHijos(driveId, item.id);
        setNiveles([...nuevosNiveles, { items: hijos, seleccionadoId: '' }]);
      }catch(err){ console.error(err); notify?.("No se pudo listar esa carpeta: " + err.message, 'error'); }
      setCargandoNivel(false);
    } else {
      setNiveles(nuevosNiveles);
    }
  }

  // El "objetivo" es lo ÚLTIMO seleccionado en cualquier nivel (archivo o
  // carpeta) — pedido explícito del usuario: "el último archivo o carpeta
  // seleccionado", no hace falta llegar hasta un archivo.
  let objetivo = null;
  for(let i = niveles.length - 1; i >= 0 && !objetivo; i--){
    const n = niveles[i];
    if(n.seleccionadoId) objetivo = n.items.find(it => it.id === n.seleccionadoId);
  }

  async function handleGenerarLink(){
    if(!objetivo) return;
    setGenerando(true);
    try{
      const url = await crearLinkCompartidoSoporte(driveId, objetivo.id);
      setLinkGenerado(url);
      notify?.('Enlace generado.', 'success');
    }catch(err){ console.error(err); notify?.("No se pudo generar el enlace: " + err.message, 'error'); }
    setGenerando(false);
  }

  // Copiar al portapapeles — pedido explícito del usuario 2026-09-08
  // ("cree el link para copiar"): antes solo quedaba el link como texto/
  // enlace clicable, había que seleccionarlo y copiarlo a mano.
  async function handleCopiarLink(){
    try{
      await navigator.clipboard.writeText(linkGenerado);
      notify?.('Enlace copiado al portapapeles.', 'success');
    }catch(err){
      console.error(err);
      notify?.('No se pudo copiar automáticamente — selecciona el enlace y cópialo a mano.', 'error');
    }
  }

  return (
    <div className="panel" style={{marginTop:20}}>
      <div className="panel-head"><h3>Crear link para compartir</h3></div>
      <div className="panel-body">
        <p style={{margin:'0 0 16px', color:'var(--texto-suave)', fontSize:13}}>
          Elige el sitio, luego ve entrando a las carpetas hasta llegar al archivo o carpeta que quieras compartir. Genera un enlace de solo lectura que no caduca — lo puede abrir cualquiera que lo reciba, sin necesitar cuenta de Microsoft 365 del despacho.
        </p>
        <div style={{display:'flex', gap:14, flexWrap:'wrap', alignItems:'flex-end', marginBottom:14}}>
          <div className="field" style={{minWidth:240}}>
            <label>Sitio</label>
            <select value={sitioKey} onChange={e => handleElegirSitio(e.target.value)}>
              <option value="">— Selecciona —</option>
              {SITIOS_EXPLORADOR.map(s => <option key={s.key} value={s.key}>{s.nombre}</option>)}
            </select>
          </div>
          {cargandoDrives && <span className="save-hint">Cargando bibliotecas…</span>}
          {drives.length > 1 && (
            <div className="field" style={{minWidth:220}}>
              <label>Biblioteca de Documentos</label>
              <select value={driveId} onChange={e => handleElegirDrive(e.target.value)}>
                <option value="">— Selecciona —</option>
                {drives.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {niveles.map((nivel, i) => {
          const previo = i > 0 ? niveles[i-1].items.find(it => it.id === niveles[i-1].seleccionadoId) : null;
          return (
            <div className="field" style={{minWidth:280, marginBottom:14}} key={i}>
              <label>{previo ? `Dentro de "${previo.name}"` : 'Carpetas y archivos'}</label>
              <select value={nivel.seleccionadoId} onChange={e => handleElegirEnNivel(i, e.target.value)}>
                <option value="">— Selecciona —</option>
                {nivel.items.map(it => (
                  <option key={it.id} value={it.id}>{it.folder ? '📁 ' : '📄 '}{it.name}</option>
                ))}
              </select>
            </div>
          );
        })}
        {cargandoNivel && <p className="save-hint">Cargando…</p>}

        {objetivo && (
          <div style={{marginTop:6, marginBottom:10}}>
            <IconTextButton icon="open" variant="primary" onClick={handleGenerarLink} disabled={generando}>
              {generando ? "Generando…" : `Generar enlace de "${objetivo.name}"`}
            </IconTextButton>
          </div>
        )}
        {linkGenerado && (
          <div style={{marginTop:4}}>
            <p className="save-hint" style={{wordBreak:'break-all', marginBottom:8}}>
              <a href={linkGenerado} target="_blank" rel="noopener noreferrer">{linkGenerado}</a>
            </p>
            <IconTextButton icon="duplicate" variant="secondary" onClick={handleCopiarLink}>Copiar enlace</IconTextButton>
          </div>
        )}
      </div>
    </div>
  );
}
