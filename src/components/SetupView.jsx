import { useState, useEffect } from 'react';

export default function SetupView({ config, saveConfig, clearConfig, lists, updateListMapping, testStatus, onTestConnection, onApplyAllMappings, onDownloadMappings }){
  const [form, setForm] = useState(config);
  useEffect(() => { setForm(config); }, [config]);

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Configuración de la conexión</h1>
          <p>Conecta esta aplicación con el sitio de SharePoint <strong>NuevosProcesosMD</strong> mediante Microsoft Graph.</p>
        </div>
      </div>

      <div className="setup-card">
        <h3>1. Registra la aplicación en Azure AD (Microsoft Entra)</h3>
        <p>Solo se hace una vez. La app usará esta identidad para leer y escribir en las listas de SharePoint con los permisos del usuario que inicia sesión (no un usuario de servicio).</p>
        <ul className="step-list">
          <li>Entra a <code>entra.microsoft.com</code> → <strong>Registros de aplicaciones</strong> → <strong>Nuevo registro</strong>.</li>
          <li>Nombre sugerido: <code>Lexara – Gestión de Procesos</code>. Tipo de cuenta: solo este directorio.</li>
          <li>En <strong>URI de redirección</strong> elige tipo <em>SPA (Single-page application)</em> y coloca la URL donde publiques este archivo.</li>
          <li>En <strong>Permisos de API</strong>, agrega Microsoft Graph → Delegados: <code>Sites.ReadWrite.All</code>, <code>User.Read</code> y <code>Mail.ReadWrite</code> (este último para crear el borrador del informe de Tutelas directo en Outlook, con el PDF ya adjunto). Pide a un administrador que otorgue consentimiento.</li>
          <li>Copia el <strong>ID de aplicación (cliente)</strong> y el <strong>ID de directorio (inquilino)</strong>.</li>
        </ul>
      </div>

      <div className="setup-card">
        <h3>2. Pega tus credenciales aquí abajo</h3>
        <p>Estos valores se guardan solo en tu navegador (memoria de esta sesión). Para dejarlos fijos de forma permanente, edítalos directamente en <code>src/config.js</code>.</p>
        <div className="field-grid">
          <div className="field"><label>Client ID (ID de aplicación)</label><input type="text" placeholder="00000000-0000-0000-0000-000000000000" value={form.CLIENT_ID} onChange={e => setForm(v => ({...v, CLIENT_ID:e.target.value}))} /></div>
          <div className="field"><label>Tenant ID (ID de directorio)</label><input type="text" placeholder="00000000-0000-0000-0000-000000000000" value={form.TENANT_ID} onChange={e => setForm(v => ({...v, TENANT_ID:e.target.value}))} /></div>
          <div className="field"><label>Dominio SharePoint</label><input type="text" placeholder="mydabogados.sharepoint.com" value={form.SP_HOST} onChange={e => setForm(v => ({...v, SP_HOST:e.target.value}))} /></div>
          <div className="field"><label>Ruta del sitio</label><input type="text" placeholder="/sites/NuevosProcesosMD" value={form.SP_SITE_PATH} onChange={e => setForm(v => ({...v, SP_SITE_PATH:e.target.value}))} /></div>
        </div>
        <div style={{marginTop:16, display:'flex', gap:10, flexWrap:'wrap'}}>
          <button className="btn-primary" onClick={() => saveConfig(form)}>Guardar credenciales</button>
          <button className="btn-secondary" onClick={clearConfig}>Volver a modo demo</button>
        </div>
      </div>

      <div className="setup-card">
        <h3>3. Probar conexión y mapear columnas</h3>
        <p>Cada lista de SharePoint puede tener nombres internos de columna distintos a lo que ves en pantalla. Este paso se conecta a todas las listas registradas (Procesos judiciales, Clientes, y las que se agreguen), lee sus columnas y te deja indicar cuál corresponde a cada campo de la app.</p>
        <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
          <button className="btn-primary" onClick={onTestConnection}>Conectar y leer columnas</button>
          {testStatus && <span className="save-hint" style={{marginLeft:0, color: testStatus.isError ? '#b3590a' : 'var(--texto-suave)'}}>{testStatus.msg}</span>}
        </div>
        <div style={{marginTop:20}}>
          {lists.some(l => l.columns || l.connectError) && (
            <>
              {lists.map(list => (
                <MappingCard key={list.key} list={list} updateListMapping={updateListMapping} />
              ))}
              <div style={{marginTop:16, display:'flex', gap:10, flexWrap:'wrap'}}>
                <button className="btn-primary" onClick={onApplyAllMappings}>Aplicar mapeo y entrar en vivo</button>
                <button className="btn-secondary" onClick={onDownloadMappings}>Descargar este mapeo (JSON)</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="setup-card">
        <h3>4. Cómo se leen y guardan los datos</h3>
        <p>La app llama a Microsoft Graph así, usando el mapeo que definas arriba para traducir cada campo al nombre real de tu columna:</p>
        <pre className="code-block">{`GET https://graph.microsoft.com/v1.0/sites/{siteId}/lists/{listId}/items?expand=fields

PATCH https://graph.microsoft.com/v1.0/sites/{siteId}/lists/{listId}/items/{itemId}/fields
Body: { "<columna real de Estado>": "En trámite", "<columna real de Fecha admisión>": "2026-07-01" }`}</pre>
        <p>Ningún dato se almacena fuera de SharePoint: esta app es solo la ventana.</p>
      </div>
    </div>
  );
}

function MappingCard({ list, updateListMapping }){
  if(list.connectError){
    return (
      <div className="setup-card">
        <h3>{list.label}</h3>
        <p style={{color:'#b3271e'}}>No se pudo conectar: {list.connectError}</p>
      </div>
    );
  }
  if(!list.columns) return null;
  return (
    <div className="setup-card">
      <h3>{list.label}</h3>
      <p style={{fontSize:13, color:'var(--texto-suave)', marginBottom:12}}>
        Lista "{list.listName}" — {list.columns.length} columnas, {(list.rawItems||[]).length}{list.itemsTruncated ? '+' : ''} elementos. Elige la columna real para cada campo.
      </p>
      <div className="field-grid">
        {list.semanticFields.map(f => (
          <div className="field" key={f.key}>
            <label>{f.label}{f.required ? ' *' : ''}</label>
            <select value={list.mapping[f.key] || ""} onChange={e => updateListMapping(list.key, f.key, e.target.value)}>
              <option value="">— sin mapear —</option>
              {list.columns.map(c => <option value={c.name} key={c.name}>{c.displayName||c.name} ({c.name})</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
