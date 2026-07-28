import { ICON_SVG } from '../config';
import { procesosForCliente } from '../lib/graph';

export default function ClientesView({ clientes, procesos, onOpenCliente, onDeleteCliente }){
  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Clientes</h1>
          <p>{clientes.length} clientes</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Razón social</th><th>NIT</th><th>Dirección</th><th>Teléfono</th><th>Correo</th><th>Entidad</th><th>Procesos</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {clientes.length ? clientes.map(c => (
              <tr key={c.id}>
                <td className="cliente">{c.RazonSocial || "—"}</td>
                <td>{c.Nit || "—"}</td>
                <td>{c.Direccion || "—"}</td>
                <td>{c.Telefono || "—"}</td>
                <td>{c.Correo || "—"}</td>
                <td>{c.Entidad || "—"}</td>
                <td>{procesosForCliente(procesos, c).length}</td>
                <td style={{whiteSpace:'nowrap'}}>
                  <button type="button" className="btn-secondary" style={{padding:'5px 10px', fontSize:'12px'}} onClick={() => onOpenCliente(c.id)}>Editar</button>
                  <button type="button" className="btn-secondary" style={{padding:'5px 10px', fontSize:'12px', marginLeft:'6px'}} onClick={() => onDeleteCliente(c.id)}>Eliminar</button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={8}><div className="empty-state"><div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />No hay clientes para mostrar.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
