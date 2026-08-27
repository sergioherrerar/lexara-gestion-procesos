import { useState } from 'react';
import { ICON_SVG } from '../config';
import { stripHtml, estadoBadgeClass } from '../lib/graph';
import IconButton, { IconTextButton } from './IconButton';
import ColumnHeaderMenu from './ColumnHeaderMenu';
import { useColumnFilters } from '../hooks/useColumnFilters';
import { useColumnSort } from '../hooks/useColumnSort';
import { generarFichaProcesoPDF } from '../lib/informeProceso';
import { generarImpulsoProcesalWord, enviarBorradorImpulsoProcesalGraph, abrirCorreoImpulsoProcesal } from '../lib/formatoImpulsoProcesal';

function matchesFilter(p, currentFilter){
  if(currentFilter==='todos') return true;
  return (stripHtml(p.Entidad) || "Sin entidad") === currentFilter;
}
function isTerminado(p){
  return (stripHtml(p.EstadoVT) || "").toLowerCase().includes('termin');
}

const COLUMNS = [
  // ID interno del proceso en SharePoint — pedido explícito del usuario
  // 2026-08-27 ("incluye el campo de procesos judiciales 'ID' al lado del
  // proceso judicial"), útil para verificar a mano la relación por ID que
  // ya usan Desistimientos con este mismo proceso (ver [[project_desistimientos_data_model]]).
  {key:'id', label:'ID', value: p => String(p.id||"")},
  {key:'radicado', label:'Numero_Corto', value: p => p.Radicado || ""},
  {key:'cliente', label:'Cliente', value: p => p.Cliente || ""},
  {key:'despacho', label:'Despacho', value: p => `${p.Despacho||""} ${p.NumeroDespacho||""}`.trim()},
  {key:'estado', label:'Estado', value: p => stripHtml(p.Estado) || ""},
  {key:'observaciones', label:'Observación', value: p => stripHtml(p.Observaciones) || ""},
  {key:'carpeta', label:'Carpeta', filterable:false},
  {key:'acciones', label:'Acciones', filterable:false},
];

export default function ProcesosView({ procesos, currentFilter, setFilter, searchQuery, onOpenProceso, onCreateProceso, canWrite = true, liveMode, notify }){
  const [showTerminados, setShowTerminados] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(null); // id del proceso mientras genera su ficha en PDF
  const [generandoWord, setGenerandoWord] = useState(null); // id del proceso mientras genera el Impulso Procesal en Word
  const [generandoCorreo, setGenerandoCorreo] = useState(null); // id del proceso mientras crea el borrador de correo
  const { filters, setFilter: setColFilter, clearFilters, rowMatches, hasActiveFilters } = useColumnFilters();
  const { sort, setSortKey, sortRows } = useColumnSort();

  async function handleGenerarFicha(proceso){
    setGenerandoPDF(proceso.id);
    try{ await generarFichaProcesoPDF(proceso); }
    finally { setGenerandoPDF(null); }
  }
  async function handleGenerarImpulsoWord(proceso){
    setGenerandoWord(proceso.id);
    try{ await generarImpulsoProcesalWord(proceso); }
    catch(err){ console.error(err); notify?.("No se pudo generar el Impulso Procesal en Word: " + err.message, 'error'); }
    finally { setGenerandoWord(null); }
  }
  // Mismo criterio que el correo de Tutelas (ver InformesView.jsx): primero
  // intenta el borrador DIRECTO en Outlook por Microsoft Graph (nunca en modo
  // demo, ahí no hay cuenta real) y si falla por cualquier motivo cae de
  // vuelta a un mailto: con el mismo texto en plano.
  async function handleAbrirCorreoImpulso(proceso){
    if(generandoCorreo) return;
    setGenerandoCorreo(proceso.id);
    try{
      if(liveMode){
        try{
          const mensaje = await enviarBorradorImpulsoProcesalGraph(proceso);
          if(mensaje?.carpetaBorradores) window.open(mensaje.carpetaBorradores, '_blank');
          const carpetaInfo = mensaje?.carpetaReal ? ` (quedó guardado en la carpeta "${mensaje.carpetaReal}")` : '';
          notify?.(`Se creó el borrador en Outlook con el texto del Impulso Procesal${carpetaInfo} — complete los Antecedentes/Solicitud antes de enviarlo.`, 'info');
          return;
        }catch(err){ console.error('No se pudo crear el borrador por Graph, se usa mailto:', err); }
      }
      abrirCorreoImpulsoProcesal(proceso);
    }catch(err){ console.error(err); notify?.("No se pudo abrir el correo del Impulso Procesal: " + err.message, 'error'); }
    finally { setGenerandoCorreo(null); }
  }
  const entidades = Array.from(new Set(procesos.map(p => stripHtml(p.Entidad) || "Sin entidad"))).sort((a,b)=>a.localeCompare(b));
  const filterChips = [{key:'todos', label:'Todos'}, ...entidades.map(e => ({key:e, label:e}))];
  const totalTerminados = procesos.filter(isTerminado).length;

  const query = (searchQuery||"").trim().toLowerCase();
  const rows = procesos.filter(p => matchesFilter(p, currentFilter) && (showTerminados ? isTerminado(p) : !isTerminado(p)) && (!query ||
    (p.Radicado||"").toLowerCase().includes(query) ||
    (p.Cliente||"").toLowerCase().includes(query) ||
    (p.Apoderado||"").toLowerCase().includes(query)) && rowMatches(p, COLUMNS))
    .sort((a,b) => (a.Radicado||"").localeCompare(b.Radicado||""));
  const sortedRows = sortRows(rows, COLUMNS);

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Procesos judiciales</h1>
          <p>{rows.length} de {procesos.length} procesos{hasActiveFilters && <> · <button type="button" className="clear-filters-link" onClick={clearFilters}>Limpiar filtros de columna</button></>}</p>
        </div>
        {canWrite && <IconTextButton icon="add" variant="primary" onClick={onCreateProceso}>Nuevo proceso judicial</IconTextButton>}
      </div>
      <div className="toolbar">
        {filterChips.map(f => (
          <div
            key={f.key}
            className={"filter-chip" + (currentFilter===f.key ? " active" : "")}
            onClick={() => setFilter(f.key)}
            role="button" tabIndex={0}
            onKeyDown={e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); setFilter(f.key); } }}
          >{f.label}</div>
        ))}
        <div
          className={"filter-chip filter-chip-terminados" + (showTerminados ? " active" : "")}
          style={{marginLeft:'auto'}}
          onClick={() => setShowTerminados(v => !v)}
          role="button" tabIndex={0}
          onKeyDown={e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); setShowTerminados(v => !v); } }}
        >
          {showTerminados ? "← Ver vigentes" : `Ver terminados (${totalTerminados})`}
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map(c => (
                <ColumnHeaderMenu key={c.key} column={c} sort={sort} onSort={setSortKey} filterValue={filters[c.key]} onFilterChange={setColFilter} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length ? sortedRows.map(p => (
              <tr
                key={p.id}
                onClick={() => onOpenProceso(p.id, {viewOnly: !canWrite})}
                role="button" tabIndex={0}
                onKeyDown={e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); onOpenProceso(p.id, {viewOnly: !canWrite}); } }}
              >
                <td style={{textAlign:'right'}}>{p.id}</td>
                <td className="radicado">{p.Radicado || "—"}</td>
                <td className="cliente">{p.Cliente || "—"}</td>
                <td>{p.Despacho || "—"}{p.NumeroDespacho ? ` · ${p.NumeroDespacho}` : ""}</td>
                <td><span className={"badge badge-truncate " + estadoBadgeClass(p.EstadoVT, p.FechaUltimoEstado, p.Estado)}>{stripHtml(p.Estado) || "—"}</span></td>
                <td><span className="obs-truncate">{stripHtml(p.Observaciones) || "—"}</span></td>
                <td>{p.LinkCarpeta ? <IconButton icon="open" variant="open" label="Abrir carpeta" href={p.LinkCarpeta} onClick={e => e.stopPropagation()} /> : "—"}</td>
                <td style={{whiteSpace:'nowrap'}}>
                  <div className="row-actions">
                    <IconButton icon="view" variant="view" label="Ver proceso (solo consulta)" onClick={e => { e.stopPropagation(); onOpenProceso(p.id, {viewOnly:true}); }} />
                    {canWrite && <IconButton icon="edit" variant="edit" label="Editar proceso" onClick={e => { e.stopPropagation(); onOpenProceso(p.id, {viewOnly:false}); }} />}
                    <IconButton icon="pdf" variant="pdf" label="Descargar ficha en PDF" spinning={generandoPDF===p.id} onClick={e => { e.stopPropagation(); handleGenerarFicha(p); }} />
                    <IconButton icon="word" variant="word" label="Descargar Impulso Procesal en Word" spinning={generandoWord===p.id} onClick={e => { e.stopPropagation(); handleGenerarImpulsoWord(p); }} />
                    <IconButton icon="mail" variant="mail" label="Crear borrador de correo — Impulso Procesal al Despacho" spinning={generandoCorreo===p.id} onClick={e => { e.stopPropagation(); handleAbrirCorreoImpulso(p); }} />
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={8}><div className="empty-state"><div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />No se encontraron procesos con ese criterio.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
