import { useState } from 'react';
import { ICON_SVG, TUTELAS_REMITENTES_PERMITIDOS } from '../config';
import { fmtDate } from '../lib/graph';
import IconButton, { IconTextButton } from './IconButton';
import ColumnHeaderMenu from './ColumnHeaderMenu';
import TableScrollWrap from './TableScrollWrap';
import LeerCorreoTutelaModal from './LeerCorreoTutelaModal';
import { useColumnFilters } from '../hooks/useColumnFilters';
import { useColumnSort } from '../hooks/useColumnSort';
import { useLexiaVoz } from '../hooks/useLexiaVoz';
import lexiaAvatar from '../assets/LexIA avatar.png';

// Orden pedido explícito del usuario 2026-09-01 — Juzgado se quitó de la
// tabla (no estaba en la lista que pidió); sigue existiendo como dato, solo
// no se muestra acá.
const COLUMNS = [
  {key:'noTutela', label:'No. Tutela', value: t => t.NoTutela || ""},
  {key:'fechaCreacion', label:'Fecha de creación', value: t => t.createdDateTime || ""},
  {key:'entidad', label:'Entidad', value: t => t.Entidad || ""},
  {key:'cliente', label:'Cliente', value: t => t.Cliente || ""},
  {key:'tipoRespuesta', label:'Tipo Respuesta', value: t => t.TipoRespuesta || ""},
  {key:'fechaVencimiento', label:'Vencimiento', value: t => t.FechaVencimiento || ""},
  {key:'fechaNotificacion', label:'Fecha Notificación', value: t => t.FechaNotificacion || ""},
  {key:'tema', label:'Tema', value: t => t.Tema || ""},
  {key:'acciones', label:'Acciones', filterable:false},
];

// Fecha de hoy en formato "yyyy-mm-dd", para comparar contra Fecha
// Vencimiento (que llega como fecha/hora ISO) sin líos de huso horario.
function hoyISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function TutelasView({ tutelas, searchQuery, onOpenTutela, onCreateTutela, onDuplicateTutela, onDeleteTutela, onAgregarCorreccionIA, canWrite = true, liveMode, config, notify }){
  const { filters, setFilter, clearFilters, rowMatches, hasActiveFilters } = useColumnFilters();
  const { sort, setSortKey, sortRows } = useColumnSort();
  // "Leer correo (LexIA)" — nombre elegido por el usuario 2026-09-24 para
  // el robot/asistente ("con Lexara mejor... me gusta LexIA"), en vez del
  // genérico "(IA)" de antes. "API Claude" Tarea 1 (2026-09-23, pedido explícito
  // del usuario, con aprobación interna, ver [[project_api_claude_tutelas]]).
  // Solo tiene sentido conectado a SharePoint en vivo (necesita leer un
  // buzón real de Outlook) — en modo demo no se muestra.
  const [mostrarLeerCorreo, setMostrarLeerCorreo] = useState(false);
  // Voz de LexIA (2026-09-24, pedido explícito del usuario: "que salude
  // con la voz al abrir") — se instancia acá (no dentro del modal) para
  // poder disparar el saludo DENTRO del mismo clic que abre la ventana:
  // varios navegadores solo dejan sonar la síntesis de voz si queda
  // pegada al gesto real del usuario, no un instante después (que es lo
  // que pasaba cuando el saludo se disparaba en un useEffect al montar el
  // modal, un tris más tarde que el clic).
  const { activada: vozActivada, setActivada: setVozActivada, decir } = useLexiaVoz();
  // Contador de tutelas que vencen hoy — se recalcula en cada render, así
  // que siempre queda al día con lo último que haya en `tutelas` (recién
  // cargado o después de un refresh).
  const vencenHoy = tutelas.filter(t => String(t.FechaVencimiento||"").slice(0,10) === hoyISO()).length;
  const query = (searchQuery||"").trim().toLowerCase();
  // "No Tutela" es una columna numérica en SharePoint (llega como number,
  // no string) — .toLowerCase()/.localeCompare no existen en números y
  // tumbaban la búsqueda/orden sin avisar. Se envuelve todo en String().
  // Orden por defecto pedido explícito del usuario 2026-09-01: siempre por
  // "No Tutela", el número mayor arriba — antes era por Fecha Vencimiento.
  // Number() y no localeCompare: "No Tutela" es una columna numérica real
  // (ver nota más abajo), comparar como texto ordenaría mal en cuanto
  // cambiara de cantidad de dígitos (ej. "9" quedaría después de "10").
  const rows = tutelas.filter(t => (!query ||
    String(t.NoTutela||"").toLowerCase().includes(query) ||
    String(t.Cliente||"").toLowerCase().includes(query) ||
    String(t.Entidad||"").toLowerCase().includes(query)) && rowMatches(t, COLUMNS))
    .sort((a,b) => (Number(b.NoTutela)||0) - (Number(a.NoTutela)||0));
  const sortedRows = sortRows(rows, COLUMNS);
  // Diferencia por tipo (pedido explícito del usuario 2026-08-31, ajustado
  // 2026-09-01 a "solo las del día") — desglose del mismo badge "vencen
  // hoy" de arriba: cuántas de las que vencen HOY son Tutela/Impugnación/
  // Otras, sobre el total de `tutelas` (sin filtrar por búsqueda/columna,
  // igual que vencenHoy) — antes contaba todo lo filtrado/buscado en
  // pantalla, sin importar la fecha.
  const tutelasHoy = tutelas.filter(t => String(t.FechaVencimiento||"").slice(0,10) === hoyISO());
  const conteoTutela = tutelasHoy.filter(t => (t.TipoRespuesta||"").trim().toUpperCase() === 'TUTELA').length;
  const conteoImpugnacion = tutelasHoy.filter(t => (t.TipoRespuesta||"").trim().toUpperCase() === 'IMPUGNACION').length;
  const conteoOtras = tutelasHoy.length - conteoTutela - conteoImpugnacion;

  return (
    <div className="view">
      <div className="view-header view-header-lexia">
        <div>
          <h1>Tutelas</h1>
          <p>{rows.length} de {tutelas.length} tutelas{hasActiveFilters && <> · <button type="button" className="clear-filters-link" onClick={clearFilters}>Limpiar filtros de columna</button></>}</p>
        </div>
        {/* Botón de LexIA centrado (2026-09-24, pedido explícito del
            usuario: "mejor deja el botón de LexIA en la mitad, debajo del
            calendario") — el calendario global vive centrado en la barra
            superior (Topbar.jsx), así que este botón queda alineado
            debajo de ese mismo eje central, separado del grupo de la
            derecha (badge/Nueva tutela). */}
        {canWrite && liveMode && (
          <button type="button" className="btn-lexia view-header-lexia-btn" onClick={() => {
            setMostrarLeerCorreo(true);
            decir('Hola, soy LexIA. Elige un correo y dale extraer, o pregúntame lo que necesites.');
          }}>
            <img src={lexiaAvatar} alt="" className="btn-lexia-avatar" />
            LexIA
          </button>
        )}
        <div style={{display:'flex', alignItems:'center', gap:12, flexWrap:'wrap'}}>
          <span className={"badge badge-forma-boton " + (vencenHoy > 0 ? "badge-alerta" : "badge-gris")}>
            {vencenHoy} {vencenHoy === 1 ? "vence" : "vencen"} hoy
          </span>
          {canWrite && <IconTextButton icon="add" variant="primary" onClick={onCreateTutela}>Nueva tutela</IconTextButton>}
        </div>
      </div>
      {mostrarLeerCorreo && (
        <LeerCorreoTutelaModal
          correoBuzon={config?.TUTELAS_BUZON_CORREO}
          remitentesPermitidos={TUTELAS_REMITENTES_PERMITIDOS}
          robotUrl={config?.ROBOT_CLAUDE_URL}
          tutelas={tutelas}
          onAgregarCorreccionIA={onAgregarCorreccionIA}
          robotPreguntasUrl={config?.ROBOT_PREGUNTAS_URL}
          notify={notify}
          vozActivada={vozActivada}
          setVozActivada={setVozActivada}
          decir={decir}
          onClose={() => setMostrarLeerCorreo(false)}
          onExtraido={campos => onCreateTutela(campos)}
        />
      )}
      {/* Diferencia por tipo, solo de lo que vence HOY (pedido explícito del
          usuario 2026-09-01) — en su propia fila, separada del título/botón
          de arriba: metida en la misma fila del view-header (que no tiene
          flex-wrap) empujaba el título hacia abajo en pantallas angostas.
          Alineada a la derecha, también pedido explícito. */}
      <div style={{display:'flex', gap:10, flexWrap:'wrap', justifyContent:'flex-end', marginBottom:16}}>
        <span className="badge badge-verde">{conteoTutela} Tutelas</span>
        <span className="badge badge-naranja">{conteoImpugnacion} Impugnaciones</span>
        <span className="badge badge-gris">{conteoOtras} Otras contestaciones</span>
      </div>
      <TableScrollWrap>
        <table>
          <thead>
            <tr>
              {COLUMNS.map(c => (
                <ColumnHeaderMenu key={c.key} column={c} sort={sort} onSort={setSortKey} filterValue={filters[c.key]} onFilterChange={setFilter} rows={tutelas} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length ? sortedRows.map(t => (
              <tr key={t.id}>
                <td className="cliente">{t.NoTutela || "—"}</td>
                <td>{fmtDate(t.createdDateTime)}</td>
                <td>{t.Entidad || "—"}</td>
                <td>{t.Cliente || "—"}</td>
                <td>{t.TipoRespuesta || "—"}</td>
                <td>{fmtDate(t.FechaVencimiento)}</td>
                <td>{fmtDate(t.FechaNotificacion)}</td>
                <td>{t.Tema || "—"}</td>
                <td style={{whiteSpace:'nowrap'}}>
                  <div className="row-actions">
                    <IconButton icon="edit" variant="edit" label={canWrite ? "Editar tutela" : "Ver tutela"} onClick={() => onOpenTutela(t.id)} />
                    {canWrite && <IconButton icon="duplicate" variant="duplicate" label="Duplicar tutela" onClick={() => onDuplicateTutela(t.id)} />}
                    {canWrite && <IconButton icon="delete" variant="delete" label="Eliminar tutela" onClick={() => onDeleteTutela(t.id)} />}
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={9}><div className="empty-state"><div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />No hay tutelas para mostrar.</div></td></tr>
            )}
          </tbody>
        </table>
      </TableScrollWrap>
    </div>
  );
}
