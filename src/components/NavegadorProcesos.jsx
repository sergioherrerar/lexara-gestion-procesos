import { useMemo, useState } from 'react';
import { vecinosDeProceso, buscarEnLista } from '../lib/navegacionProcesos';

// Botones «primero · atrás · siguiente · último» y buscador, SOLO entre los procesos de la misma entidad (grupo) del proceso abierto (2026-11-28, pedido del usuario; estilo de los botones de navegación de un formulario).
function Flecha({ d }){ return <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d={d} /></svg>; }
const ICONOS = {
  primero: 'M6 6h2.5v12H6zM20 6.5v11a.5.5 0 0 1-.8.4L11.2 12.4a.5.5 0 0 1 0-.8l8-5.5a.5.5 0 0 1 .8.4z',
  atras: 'M16 6.5v11a.5.5 0 0 1-.8.4L7.2 12.4a.5.5 0 0 1 0-.8l8-5.5a.5.5 0 0 1 .8.4z',
  siguiente: 'M8 6.5v11a.5.5 0 0 0 .8.4l8-5.5a.5.5 0 0 0 0-.8l-8-5.5a.5.5 0 0 0-.8.4z',
  ultimo: 'M15.5 6H18v12h-2.5zM4 6.5v11a.5.5 0 0 0 .8.4l8-5.5a.5.5 0 0 0 0-.8l-8-5.5a.5.5 0 0 0-.8.4z',
};
export default function NavegadorProcesos({ actual, procesos, onIr }){
  const { lista, indice, entidad } = useMemo(() => vecinosDeProceso(procesos, actual), [procesos, actual]);
  const [texto, setTexto] = useState('');
  const resultados = useMemo(() => buscarEnLista(lista, texto), [lista, texto]);
  if(!actual || lista.length < 2) return null;
  const ir = i => { if(i >= 0 && i < lista.length && i !== indice){ setTexto(''); onIr(lista[i]); } };
  return (
    <div className="proc-nav" role="group" aria-label={'Moverse entre los procesos de ' + (entidad || 'la misma entidad')}>
      <div className="proc-nav-botones">
        <button type="button" className="proc-nav-btn" onClick={() => ir(0)} disabled={indice <= 0} title="Primer proceso" aria-label="Primer proceso"><Flecha d={ICONOS.primero} /></button>
        <button type="button" className="proc-nav-btn" onClick={() => ir(indice - 1)} disabled={indice <= 0} title="Proceso anterior" aria-label="Proceso anterior"><Flecha d={ICONOS.atras} /></button>
        <button type="button" className="proc-nav-btn" onClick={() => ir(indice + 1)} disabled={indice >= lista.length - 1} title="Proceso siguiente" aria-label="Proceso siguiente"><Flecha d={ICONOS.siguiente} /></button>
        <button type="button" className="proc-nav-btn" onClick={() => ir(lista.length - 1)} disabled={indice >= lista.length - 1} title="Último proceso" aria-label="Último proceso"><Flecha d={ICONOS.ultimo} /></button>
        <div className="proc-nav-buscar">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></svg>
          <input type="text" value={texto} onChange={e => setTexto(e.target.value)} placeholder={'Buscar en ' + (entidad || 'esta entidad') + '…'} aria-label={'Buscar un proceso de ' + (entidad || 'esta entidad')}
            onKeyDown={e => { if(e.key === 'Enter' && resultados[0]) ir(lista.indexOf(resultados[0])); if(e.key === 'Escape') setTexto(''); }} />
          {texto.trim().length >= 2 && (
            <ul className="proc-nav-resultados" role="listbox">
              {resultados.length === 0 ? <li className="proc-nav-vacio">Sin resultados en {entidad || 'esta entidad'}</li> : resultados.map(p => (
                <li key={p.id} role="option" aria-selected={String(p.id) === String(actual.id)}>
                  <button type="button" onClick={() => ir(lista.indexOf(p))}><strong>{p.Radicado || '—'}</strong> <span>{p.Cliente || ''}</span>{p.Demandante ? <em> · {p.Demandante}</em> : null}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="proc-nav-pos">Proceso {indice + 1} de {lista.length}{entidad ? ' · ' + entidad : ''}</div>
    </div>
  );
}
