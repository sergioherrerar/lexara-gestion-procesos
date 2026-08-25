import { useState } from 'react';
import { ICON_SVG } from '../config';
import IconButton, { IconTextButton } from './IconButton';
import ColumnHeaderMenu from './ColumnHeaderMenu';
import { useColumnFilters } from '../hooks/useColumnFilters';
import { useColumnSort } from '../hooks/useColumnSort';
import { generarCertificacionColaboradorPDF } from '../lib/informeCertificacion';

const COLUMNS = [
  {key:'nombre', label:'Nombre', value: c => c.Nombre || ""},
  {key:'correo', label:'Correo', value: c => c.Correo || ""},
  {key:'telefono', label:'Teléfono', value: c => c.Telefono || ""},
  {key:'direccion', label:'Dirección', value: c => c.Direccion || ""},
  {key:'rol', label:'Rol', value: c => c.Rol || ""},
  {key:'tipoColaborador', label:'Tipo de colaborador', value: c => c.TipoColaborador || ""},
  {key:'activo', label:'Activo', value: c => c.Activo ? "Sí" : "No"},
  {key:'acciones', label:'Acciones', filterable:false},
];

// `embedded`/`titulo`: agregados 2026-08-25 al mudar este módulo dentro de
// la pestaña "Colaboradores MD" de Administración (ver AdministracionView.jsx
// y [[project_administracion_modulo]]) — con embedded=true no repite su
// propio <h1>/.view-header grande (quedaría duplicado con el de
// Administración), solo el contador + botón "Nuevo colaborador" en una
// franja liviana. Por defecto queda igual que siempre (embedded=false), por
// si este componente se vuelve a usar solo en algún otro lugar.
export default function ColaboradoresView({ colaboradores, searchQuery, onOpenColaborador, onCreateColaborador, onDeleteColaborador, canWrite = true, notify, embedded = false, titulo = "Colaborador Lexara" }){
  const { filters, setFilter, clearFilters, rowMatches, hasActiveFilters } = useColumnFilters();
  const { sort, setSortKey, sortRows } = useColumnSort();
  const [generandoCertificacion, setGenerandoCertificacion] = useState(null); // id del colaborador mientras genera su certificación

  // Requiere Cargo y Fecha de ingreso para que el texto de la certificación
  // tenga sentido — sin esto avisa en vez de generar un PDF con "—" por todos
  // lados (ver ColaboradorDrawer.jsx para completar esos campos).
  async function handleGenerarCertificacion(colaborador){
    if(!colaborador.Cargo || !colaborador.FechaIngreso){
      notify?.(`Antes de generar la certificación de ${colaborador.Nombre}, completa su Cargo y Fecha de ingreso en la ficha del colaborador.`, 'error');
      return;
    }
    setGenerandoCertificacion(colaborador.id);
    try{ await generarCertificacionColaboradorPDF(colaborador); }
    catch(err){ console.error(err); notify?.("No se pudo generar la certificación: " + err.message, 'error'); }
    finally { setGenerandoCertificacion(null); }
  }
  const query = (searchQuery||"").trim().toLowerCase();
  const rows = colaboradores.filter(c => (!query ||
    (c.Nombre||"").toLowerCase().includes(query) ||
    (c.Correo||"").toLowerCase().includes(query)) && rowMatches(c, COLUMNS))
    .sort((a,b) => (a.Nombre||"").localeCompare(b.Nombre||""));
  const sortedRows = sortRows(rows, COLUMNS);

  const contadorYFiltro = (
    <p>{rows.length} de {colaboradores.length} colaboradores{hasActiveFilters && <> · <button type="button" className="clear-filters-link" onClick={clearFilters}>Limpiar filtros de columna</button></>}</p>
  );
  const tabla = (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map(c => (
                <ColumnHeaderMenu key={c.key} column={c} sort={sort} onSort={setSortKey} filterValue={filters[c.key]} onFilterChange={setFilter} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length ? sortedRows.map(c => (
              <tr key={c.id}>
                <td className="cliente">{c.Nombre || "—"}</td>
                <td>{c.Correo || "—"}</td>
                <td>{c.Telefono || "—"}</td>
                <td>{c.Direccion || "—"}</td>
                <td>{c.Rol || "—"}</td>
                <td>{c.TipoColaborador || "—"}</td>
                <td>{c.Activo ? "Sí" : "No"}</td>
                <td style={{whiteSpace:'nowrap'}}>
                  <div className="row-actions">
                    <IconButton icon="edit" variant="edit" label={canWrite ? "Editar colaborador" : "Ver colaborador"} onClick={() => onOpenColaborador(c.id)} />
                    <IconButton icon="pdf" variant="pdf" label="Descargar certificación (PDF)" spinning={generandoCertificacion===c.id} onClick={() => handleGenerarCertificacion(c)} />
                    {canWrite && <IconButton icon="delete" variant="delete" label="Eliminar colaborador" onClick={() => onDeleteColaborador(c.id)} />}
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={8}><div className="empty-state"><div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />No hay colaboradores para mostrar.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
  );

  if(embedded){
    return (
      <div>
        <div className="view-header" style={{marginBottom:14}}>
          <div>{contadorYFiltro}</div>
          {canWrite && <IconTextButton icon="add" variant="primary" onClick={onCreateColaborador}>Nuevo colaborador</IconTextButton>}
        </div>
        {tabla}
      </div>
    );
  }
  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>{titulo}</h1>
          {contadorYFiltro}
        </div>
        {canWrite && <IconTextButton icon="add" variant="primary" onClick={onCreateColaborador}>Nuevo colaborador</IconTextButton>}
      </div>
      {tabla}
    </div>
  );
}
